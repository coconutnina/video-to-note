"use client";

import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { cn } from "@/lib/utils";

export type MindMapNodeData = {
  label: string;
  timestamp?: string;
};

export function MindMapNode({ data, selected }: NodeProps<MindMapNodeData>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !border-2" />
      <div
        className={cn(
          "min-w-[120px] rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-colors",
          selected ? "border-orange-500 ring-2 ring-orange-500/30" : "border-border"
        )}
      >
        <div className="text-sm font-medium text-foreground">{data.label}</div>
        {data.timestamp != null && (
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            {data.timestamp}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !border-2" />
    </>
  );
}
