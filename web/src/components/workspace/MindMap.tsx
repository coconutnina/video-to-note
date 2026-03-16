"use client";

import * as React from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  Panel,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MindMapNode } from "@/components/workspace/MindMapNode";
import {
  MINDMAP_EDGES,
  MINDMAP_NODE_IDS,
  MINDMAP_NODES,
} from "@/components/workspace/mindmap-data";
import type { FlowEdge, FlowNode } from "@/lib/mindmap";
import { cn } from "@/lib/utils";

const nodeTypes = { mindmap: MindMapNode };

const defaultNodes: Node<{ label: string; timestamp?: string }>[] = MINDMAP_NODES.map(
  (n) => ({
    ...n,
    type: "mindmap",
  })
);

export interface MindMapProps {
  className?: string;
  /** 生成中时显示骨架屏 */
  loading?: boolean;
  /** API 返回的节点/边，不传则用 mock */
  initialNodes?: FlowNode[] | null;
  initialEdges?: FlowEdge[] | null;
}

export function MindMap({
  className,
  loading = false,
  initialNodes,
  initialEdges,
}: MindMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialNodes?.length ? initialNodes : defaultNodes) as Node<{
      label: string;
      timestamp?: string;
    }>[]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges?.length ? initialEdges : MINDMAP_EDGES
  );

  const nodeIds = React.useMemo(
    () =>
      initialNodes?.length
        ? initialNodes.map((n) => n.id)
        : MINDMAP_NODE_IDS,
    [initialNodes]
  );

  const [highlightedNodeId, setHighlightedNodeId] = React.useState<string>(
    nodeIds[0] ?? "1"
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [regenerateTopic, setRegenerateTopic] = React.useState("");

  React.useEffect(() => {
    if (initialNodes?.length)
      setNodes(initialNodes as Node<{ label: string; timestamp?: string }>[]);
    if (initialEdges?.length) setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  React.useEffect(() => {
    setHighlightedNodeId((prev) => (nodeIds.includes(prev) ? prev : nodeIds[0] ?? "1"));
  }, [nodeIds]);

  // 同步高亮到节点 selected 状态
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({ ...n, selected: n.id === highlightedNodeId }))
    );
  }, [highlightedNodeId, setNodes]);

  // 每 5 秒自动切换高亮（模拟视频播放推进）
  React.useEffect(() => {
    const id = setInterval(() => {
      setHighlightedNodeId((prev) => {
        const idx = nodeIds.indexOf(prev);
        const next = (idx + 1) % nodeIds.length;
        return nodeIds[next] ?? prev;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [nodeIds]);

  const onNodeClick = React.useCallback(
    (_: React.MouseEvent, node: Node<{ label: string; timestamp?: string }>) => {
      const ts = node.data?.timestamp ?? "";
      console.log("跳转到时间戳：" + ts);
      setHighlightedNodeId(node.id);
    },
    []
  );

  const handleRegenerateConfirm = () => {
    console.log("重新生成主题：" + regenerateTopic);
    setRegenerateTopic("");
    setDialogOpen(false);
  };

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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        connectionLineType="bezier"
        defaultEdgeOptions={{
          type: "default",
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
        <Panel position="top-left" className="m-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            重新生成
          </Button>
        </Panel>
      </ReactFlow>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重新生成</DialogTitle>
          </DialogHeader>
          <Input
            value={regenerateTopic}
            onChange={(e) => setRegenerateTopic(e.target.value)}
            placeholder="输入主题"
            className="mt-2"
          />
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={handleRegenerateConfirm}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
