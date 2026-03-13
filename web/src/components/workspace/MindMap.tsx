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
import { cn } from "@/lib/utils";

const nodeTypes = { mindmap: MindMapNode };

const initialNodes: Node<{ label: string; timestamp?: string }>[] = MINDMAP_NODES.map(
  (n) => ({
    ...n,
    type: "mindmap",
  })
);

export interface MindMapProps {
  className?: string;
}

export function MindMap({ className }: MindMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(MINDMAP_EDGES);
  const [highlightedNodeId, setHighlightedNodeId] = React.useState<string>(
    MINDMAP_NODE_IDS[0] ?? "1"
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [regenerateTopic, setRegenerateTopic] = React.useState("");

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
        const idx = MINDMAP_NODE_IDS.indexOf(prev);
        const next = (idx + 1) % MINDMAP_NODE_IDS.length;
        return MINDMAP_NODE_IDS[next] ?? prev;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
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
