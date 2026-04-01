"use client";

import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { formatDuration } from "@/lib/mindmap";
import { cn } from "@/lib/utils";

export type MindMapNodeData = {
  label: string;
  timestamp?: string;
  timestampSeconds?: number;
  endTimestamp?: string;
  important?: boolean;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  detail?: string;
  depth?: number;
};

function timeLabelDepth1(
  timestamp?: string,
  endTimestamp?: string
): React.ReactNode {
  const dur = formatDuration(timestamp, endTimestamp);
  if (!dur) return null;
  return <span>{dur}</span>;
}

function timeLabelDepth2Plus(
  timestamp?: string,
  endTimestamp?: string
): React.ReactNode {
  const ts = timestamp?.trim();
  const te = endTimestamp?.trim();
  if (!ts && !te) return null;
  if (ts && te) {
    return <span>{ts} ~ {te}</span>;
  }
  return <span>{ts ?? te}</span>;
}

export function MindMapNode({ data, selected }: NodeProps<MindMapNodeData>) {
  const depth = data.depth ?? 0;
  const level = Math.max(0, Math.min(depth, 3));

  const showDetail = Boolean(data.detail?.trim());
  const showTimeDepth1 = depth === 1;
  const showTimeDepth2 = depth >= 2;
  const l2TimeText =
    level === 2
      ? (data.timestamp?.trim() ??
        (typeof data.timestampSeconds === "number"
          ? String(data.timestampSeconds)
          : ""))
      : "";

  const nodeClassName = cn(
    "box-border transition-colors",
    level === 0 && "rounded-[8px] px-[14px] py-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.15)]",
    level === 1 && "rounded-[6px] border px-[12px] py-[7px]",
    level === 2 && "max-w-[300px] rounded-[5px] border px-[11px] pb-[8px] pt-[6px] hover:bg-[#EAEAE8]",
    level >= 3 && "max-w-[280px] rounded-[4px] border px-[10px] py-[5px] hover:bg-[#F5F5F5]"
  );

  const nodeStyle: React.CSSProperties =
    level === 0
      ? {
          backgroundColor: "#111111",
          color: "#FBFBFB",
          border: selected ? "1px solid #A8882A" : "1px solid transparent",
        }
      : level === 1
        ? {
            backgroundColor: "#F0E8CC",
            borderColor:
              data.important
                ? "rgba(168,136,42,0.5)"
                : selected
                  ? "#A8882A"
                  : "#C9A84C",
            color: "#3D2E00",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }
        : level === 2
          ? {
              backgroundColor: "#EAEAE6",
              borderColor: selected ? "#A8882A" : "#C8C8C4",
              color: "#252525",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            }
          : {
              backgroundColor: "#FBFBFB",
              borderColor: selected ? "#A8882A" : "#E2E2E2",
              color: "#3A3A3A",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            };

  const handleColor =
    level === 0 ? "#A8882A" : level === 1 ? "#A8882A" : level === 2 ? "#DCDCDA" : "#E2E2E2";

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-1.5 !w-1.5 !border-2"
        style={{ background: handleColor }}
      />
      <div className={nodeClassName} style={nodeStyle}>
        <div className="flex items-start justify-between gap-1">
          <div
            className={cn(
              "min-w-0 flex-1 leading-snug",
              level <= 1 && "text-[13px] font-medium",
              level === 2 && "text-[12px] font-medium",
              level >= 3 && "text-[12px] font-normal"
            )}
            style={{
              fontFamily:
                level <= 1
                  ? '"EB Garamond", serif'
                  : '"DM Sans", sans-serif',
            }}
          >
            {level === 2 && data.important ? (
              <span className="mr-[5px] inline-block h-[5px] w-[5px] rounded-full bg-[#A8882A]" />
            ) : null}
            {data.label}
          </div>
          {data.hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onToggle?.();
              }}
              className="shrink-0 rounded px-0.5 text-sm leading-none opacity-80 hover:opacity-100"
              style={{ color: "currentColor" }}
              aria-expanded={!data.collapsed}
              aria-label={data.collapsed ? "展开子节点" : "折叠子节点"}
            >
              {data.collapsed ? "▸" : "▾"}
            </button>
          ) : null}
        </div>

        {showDetail && level === 0 && (
          <div
            className="mt-1 text-[9px] leading-[1.3]"
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              color: "rgba(251,251,251,0.45)",
            }}
          >
            {data.detail}
          </div>
        )}

        {showDetail && level === 2 && (
          <div
            className="mt-[3px] text-[11px] leading-[1.55] text-[#444444]"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            {data.detail}
          </div>
        )}

        {level >= 3 && data.detail && (
          <div
            style={{
              fontSize: "11px",
              color: "#555555",
              lineHeight: 1.55,
              marginTop: "3px",
            }}
          >
            {data.detail}
          </div>
        )}

        {level === 0 ? null : (
          <div
            className={cn(
              "text-[9px]",
              level === 1 && "mt-1 ml-auto text-right text-[rgba(168,136,42,0.5)]",
              level === 2 && "mt-[4px] text-left text-[#AAAAAA]",
              level >= 3 && "mt-1 text-right text-[#AAAAAA]"
            )}
            style={{ fontFamily: '"IBM Plex Mono", monospace' }}
          >
            {level === 2
              ? l2TimeText
              : showTimeDepth1
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
        style={{ background: handleColor }}
      />
    </>
  );
}
