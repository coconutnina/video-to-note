"use client";

import * as React from "react";
import { toPng } from "html-to-image";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  Controls,
  ConnectionLineType,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { MindMapNode, type MindMapNodeData } from "@/components/workspace/MindMapNode";
import { flowToMarkdown, type FlowEdge, type FlowNode } from "@/lib/mindmap";
import { cn } from "@/lib/utils";

const nodeTypes = { mindmap: MindMapNode };
const NODE_EXPORT_WIDTH = 320;
const NODE_EXPORT_HEIGHT = 120;
const BBOX_PADDING = 60;

/** 遍历 edges 构建 父 ID → 子 ID 列表 */
function buildChildrenMap(edges: FlowEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, []);
    map.get(e.source)!.push(e.target);
  }
  return map;
}

/** 对每个 collapsedId，递归收集其所有后代节点 ID（不含折叠节点自身） */
function getHiddenIds(
  collapsedIds: Set<string>,
  childrenMap: Map<string, string[]>
): Set<string> {
  const hidden = new Set<string>();

  function collectDescendants(id: string) {
    const kids = childrenMap.get(id) ?? [];
    for (const child of kids) {
      if (hidden.has(child)) continue;
      hidden.add(child);
      collectDescendants(child);
    }
  }

  for (const id of collapsedIds) {
    collectDescendants(id);
  }
  return hidden;
}

/** MM:SS 或 HH:MM:SS → 秒数 */
function timestampToSeconds(timestamp?: string): number | null {
  if (!timestamp?.trim()) return null;
  const parts = timestamp
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export interface MindMapProps {
  className?: string;
  /** 生成中时显示骨架屏 */
  loading?: boolean;
  /** API 返回的节点/边；不传或为空时显示空画布，mock 数据仅开发调试时手动传入 */
  initialNodes?: FlowNode[] | null;
  initialEdges?: FlowEdge[] | null;
  /** 点击节点时根据 timestamp 跳转（秒） */
  onNodeClick?: (seconds: number) => void;
  /** 向父组件暴露图片下载函数 */
  onDownloadImage?: (download: () => void) => void;
  /** 向父组件暴露 Markdown 下载函数 */
  onDownloadMarkdown?: (download: () => void) => void;
}

function MindMapCanvas({
  className,
  initialNodes,
  initialEdges,
  onNodeClick,
  onDownloadImage,
  onDownloadMarkdown,
}: Omit<MindMapProps, "loading">) {
  const { getNodes } = useReactFlow();
  const [rawNodes, setRawNodes] = React.useState<FlowNode[]>(
    () => initialNodes ?? []
  );
  const [rawEdges, setRawEdges] = React.useState<FlowEdge[]>(
    () => initialEdges ?? []
  );
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(
    () => new Set()
  );

  React.useEffect(() => {
    setRawNodes(initialNodes ?? []);
    setRawEdges(initialEdges ?? []);
    setCollapsedIds(new Set());
  }, [initialNodes, initialEdges]);

  const toggleCollapse = React.useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { visibleNodes, visibleEdges } = React.useMemo(() => {
    const childrenMap = buildChildrenMap(rawEdges);
    const hiddenIds = getHiddenIds(collapsedIds, childrenMap);
    const visNodes = rawNodes.filter((n) => !hiddenIds.has(n.id));
    const visEdges = rawEdges.filter(
      (e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target)
    );
    const enriched: Node<MindMapNodeData>[] = visNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        collapsed: collapsedIds.has(n.id),
        onToggle: n.data.hasChildren
          ? () => toggleCollapse(n.id)
          : undefined,
      },
    }));
    return { visibleNodes: enriched, visibleEdges: visEdges };
  }, [rawNodes, rawEdges, collapsedIds, toggleCollapse]);

  const [nodes, setNodes, onNodesChange] = useNodesState(visibleNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges);

  React.useEffect(() => {
    setNodes(visibleNodes);
  }, [visibleNodes, setNodes]);

  React.useEffect(() => {
    setEdges(visibleEdges);
  }, [visibleEdges, setEdges]);

  const handleNodeClick = React.useCallback(
    (_: React.MouseEvent, node: Node<MindMapNodeData>) => {
      const sec = timestampToSeconds(node.data.timestamp);
      if (sec !== null) onNodeClick?.(sec);
    },
    [onNodeClick]
  );
  const reactFlowWrapperRef = React.useRef<HTMLDivElement>(null);
  const [pngExporting, setPngExporting] = React.useState(false);

  const handleDownloadImage = React.useCallback(async () => {
    if (pngExporting) return;
    const wrapper = reactFlowWrapperRef.current;
    if (!wrapper) return;
    const viewport = wrapper.querySelector(
      ".react-flow__viewport"
    ) as HTMLElement | null;
    if (!viewport) return;

    const rfNodes = getNodes();
    if (rfNodes.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of rfNodes) {
      const x = n.position.x;
      const y = n.position.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_EXPORT_WIDTH);
      maxY = Math.max(maxY, y + NODE_EXPORT_HEIGHT);
    }

    const width = maxX - minX + BBOX_PADDING * 2;
    const height = maxY - minY + BBOX_PADDING * 2;

    wrapper.classList.add("capturing");
    setPngExporting(true);
    try {
      const dataUrl = await toPng(viewport, {
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        width,
        height,
        style: {
          transform: `translate(${-(minX - BBOX_PADDING)}px, ${-(minY - BBOX_PADDING)}px)`,
          transformOrigin: "top left",
          width: `${width}px`,
          height: `${height}px`,
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "mindmap.png";
      a.click();
    } finally {
      wrapper.classList.remove("capturing");
      setPngExporting(false);
    }
  }, [getNodes, pngExporting]);

  const handleDownloadMarkdown = React.useCallback(() => {
    const md = flowToMarkdown(rawNodes, rawEdges);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindmap.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [rawNodes, rawEdges]);

  React.useEffect(() => {
    onDownloadImage?.(() => {
      void handleDownloadImage();
    });
  }, [onDownloadImage, handleDownloadImage]);

  React.useEffect(() => {
    onDownloadMarkdown?.(handleDownloadMarkdown);
  }, [onDownloadMarkdown, handleDownloadMarkdown]);

  return (
    <div ref={reactFlowWrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "#888", strokeWidth: 1.5 },
        }}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        className="h-full w-full"
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function MindMap({
  className,
  loading = false,
  initialNodes,
  initialEdges,
  onNodeClick,
  onDownloadImage,
  onDownloadMarkdown,
}: MindMapProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "relative flex h-full w-full min-h-[600px] items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-8",
          className
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-label="生成中"
          />
          <p className="text-sm text-muted-foreground">正在生成思维导图...</p>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 w-28 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative h-full w-full min-h-[600px] overflow-hidden", className)}
      style={{ width: "100%", height: "100%" }}
    >
      <ReactFlowProvider>
        <MindMapCanvas
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onNodeClick={onNodeClick}
          onDownloadImage={onDownloadImage}
          onDownloadMarkdown={onDownloadMarkdown}
        />
      </ReactFlowProvider>
    </div>
  );
}
