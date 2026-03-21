"use client";

import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { formatDuration } from "@/lib/mindmap";
import { cn } from "@/lib/utils";

export type MindMapNodeData = {
  label: string;
  timestamp?: string;
  endTimestamp?: string;
  important?: boolean;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  detail?: string;
  depth?: number;
};

/** depth 0~4+ 样式（索引用 Math.min(depth, 4)） */
export const DEPTH_CONFIG = [
  { bg: "#1e293b", text: "#ffffff", border: "#334155" },
  { bg: "#4f46e5", text: "#ffffff", border: "#4338ca" },
  { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  { bg: "#f8fafc", text: "#1e293b", border: "#e2e8f0" },
  { bg: "#ffffff", text: "#64748b", border: "#e2e8f0" },
] as const;

function timeLabelDepth1(
  timestamp?: string,
  endTimestamp?: string
): React.ReactNode {
  const dur = formatDuration(timestamp, endTimestamp);
  if (!dur) return null;
  return (
    <span className="text-[10px] opacity-90">
      ⏱ {dur}
    </span>
  );
}

function timeLabelDepth2Plus(
  timestamp?: string,
  endTimestamp?: string
): React.ReactNode {
  const ts = timestamp?.trim();
  const te = endTimestamp?.trim();
  if (!ts && !te) return null;
  if (ts && te) {
    return (
      <span className="text-[10px] opacity-90">
        ▶ {ts} ~ {te}
      </span>
    );
  }
  return (
    <span className="text-[10px] opacity-90">
      ▶ {ts ?? te}
    </span>
  );
}

export function MindMapNode({ data, selected }: NodeProps<MindMapNodeData>) {
  const depth = data.depth ?? 0;
  const cfg = DEPTH_CONFIG[Math.min(depth, 4)];

  const showDetail = depth >= 2 && Boolean(data.detail?.trim());
  const showTimeDepth1 = depth === 1;
  const showTimeDepth2 = depth >= 2;

  const borderColor = selected ? "#f97316" : cfg.border;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-1.5 !w-1.5 !border-2"
        style={{ background: cfg.border }}
      />
      <div
        className="w-[240px] box-border rounded-lg border-2 px-3 py-2 shadow-sm transition-colors"
        style={{
          backgroundColor: cfg.bg,
          color: cfg.text,
          borderColor: borderColor,
        }}
      >
        <div className="flex items-start justify-between gap-1">
          <div
            className={cn(
              "min-w-0 flex-1 text-[13px] leading-snug",
              data.important && "font-bold"
            )}
          >
            {data.label}
            {data.important ? (
              <span className="ml-0.5 text-[11px] font-normal opacity-90">
                ★
              </span>
            ) : null}
          </div>
          {data.hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onToggle?.();
              }}
              className="shrink-0 rounded px-0.5 text-sm leading-none opacity-80 hover:opacity-100"
              style={{ color: cfg.text }}
              aria-expanded={!data.collapsed}
              aria-label={data.collapsed ? "展开子节点" : "折叠子节点"}
            >
              {data.collapsed ? "▸" : "▾"}
            </button>
          ) : null}
        </div>

        {showDetail && (
          <div
            className="mt-1.5 text-[11px] leading-[1.5]"
            style={{ color: cfg.text, opacity: 0.92 }}
          >
            {data.detail}
          </div>
        )}

        {depth === 0 ? null : (
          <div
            className="mt-1.5 text-right"
            style={{ color: cfg.text, opacity: 0.85 }}
          >
            {showTimeDepth1
              ? timeLabelDepth1(data.timestamp, data.endTimestamp)
              : showTimeDepth2
                ? timeLabelDepth2Plus(data.timestamp, data.endTimestamp)
                : null}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-1.5 !w-1.5 !border-2"
        style={{ background: cfg.border }}
      />
    </>
  );
}
