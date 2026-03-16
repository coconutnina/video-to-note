"use client";

import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { cn } from "@/lib/utils";

export type MindMapNodeData = {
  label: string;
  timestamp?: string;
  detail?: string;
  depth?: number;
};

export function MindMapNode({ data, selected }: NodeProps<MindMapNodeData>) {
  const depth = data.depth ?? 0;
  const showDetail = depth >= 2 && data.detail;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-1.5 !h-1.5 !border-2"
        style={{ background: "#888" }}
      />
      <div
        className={cn(
          "w-[240px] box-border rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-colors",
          selected ? "border-orange-500 ring-2 ring-orange-500/30" : "border-border"
        )}
      >
        <div
          className={cn(
            "text-[13px] text-foreground",
            depth <= 1 ? "font-bold" : "font-normal"
          )}
        >
          {data.label}
        </div>
        {showDetail && (
          <div className="mt-1 text-[11px] leading-[1.5] text-muted-foreground">
            {data.detail}
          </div>
        )}
        {depth > 0 && data.timestamp != null && data.timestamp !== "" && (
          <div className="mt-1 text-right text-[10px] text-muted-foreground/80">
            {data.timestamp}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-1.5 !h-1.5 !border-2"
        style={{ background: "#888" }}
      />
    </>
  );
}
