"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { SubtitleLine } from "./subtitle-data";
import {
  MOCK_CURRENT_INDEX,
  MOCK_SUBTITLES,
  ZH_PLACEHOLDER,
  ZH_UNAVAILABLE,
} from "./subtitle-data";

export type SubtitleMode = "en" | "zh" | "bilingual";

export type TranscriptStatus = "loading" | "success" | "no_subtitle" | "error";

export interface SubtitlePanelProps {
  mode?: SubtitleMode;
  onModeChange?: (mode: SubtitleMode) => void;
  activeIndex?: number;
  /** 字幕数据；不传则用 mock */
  lines?: SubtitleLine[] | null;
  /** 字幕加载状态，用于严格判断「暂无字幕」展示 */
  transcriptStatus?: TranscriptStatus;
  /** 是否正在加载字幕 */
  loading?: boolean;
  /** 错误文案：字幕获取超时、网络错误等（no_subtitle 由 transcriptStatus 单独展示） */
  error?: string | null;
  /** 加载状态下已等待的秒数，用于展示预估文案 */
  elapsedSeconds?: number;
  onRowClick?: (timestamp: string, timestampSeconds?: number) => void;
  className?: string;
}

const MODE_LABELS: Record<SubtitleMode, string> = {
  en: "英文",
  zh: "中文",
  bilingual: "双语",
};

export function SubtitlePanel({
  mode = "bilingual",
  onModeChange,
  activeIndex = MOCK_CURRENT_INDEX,
  lines,
  transcriptStatus,
  loading = false,
  error,
  elapsedSeconds,
  onRowClick,
  className,
}: SubtitlePanelProps) {
  // 有传入 lines 时用传入的，否则用 mock（仅在没有 loading/error 时展示 mock，避免遮盖加载态）
  const displayLines = lines !== undefined && lines !== null ? lines : MOCK_SUBTITLES;

  // 所有「还在加载」的情况统一显示计时提示（含 transcriptStatus=loading 或 error=loading 的并发等待）
  const isLoading =
    transcriptStatus === "loading" || error === "loading";

  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (!isLoading) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleRowClick = (line: SubtitleLine) => {
    if (onRowClick) {
      onRowClick(line.timestamp, line.timestampSeconds);
    }
  };

  const isPlaceholderZh = (zh: string) =>
    zh === ZH_PLACEHOLDER || zh === ZH_UNAVAILABLE;

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col border-l bg-muted/30", className)}
      aria-label="字幕面板"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <h3 className="text-sm font-medium">双语字幕</h3>
        <div className="flex gap-0.5">
          {(["en", "zh", "bilingual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange?.(m)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <div
              className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
              aria-label="加载中"
            />
            <p className="text-sm text-muted-foreground">正在获取字幕...</p>
            <p className="text-xs text-muted-foreground/80">
              预计需要 15–30 秒，已等待 {elapsed} 秒
            </p>
          </div>
        )}
        {transcriptStatus === "no_subtitle" && (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            该视频暂无英文字幕
          </div>
        )}
        {transcriptStatus === "success" && displayLines.length === 0 && (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            该视频暂无字幕
          </div>
        )}
        {!isLoading && error && error !== "loading" && transcriptStatus === "error" && (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            {error}
          </div>
        )}
        {!isLoading && displayLines.length > 0 && (
          <ul className="flex flex-col py-2">
            {displayLines.map((line, index) => (
              <li key={`${line.timestamp}-${index}`}>
                <button
                  type="button"
                  onClick={() => handleRowClick(line)}
                  className={cn(
                    "w-full cursor-pointer px-3 py-2 text-left transition-colors hover:bg-muted/80",
                    index === activeIndex && "bg-blue-500/15"
                  )}
                >
                  <div className="text-xs text-muted-foreground">
                    [{line.timestamp}]
                  </div>
                  {mode === "en" && (
                    <div className="mt-0.5 text-sm text-foreground">{line.en}</div>
                  )}
                  {mode === "zh" && (
                    <div
                      className={cn(
                        "mt-0.5 text-sm",
                        isPlaceholderZh(line.zh)
                          ? "italic text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {line.zh}
                    </div>
                  )}
                  {mode === "bilingual" && (
                    <>
                      <div className="mt-0.5 text-sm text-foreground">
                        {line.en}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 text-sm text-muted-foreground",
                          isPlaceholderZh(line.zh) && "italic"
                        )}
                      >
                        {line.zh}
                      </div>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
