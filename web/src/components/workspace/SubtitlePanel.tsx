"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { SubtitleLine } from "./subtitle-data";
import {
  MOCK_SUBTITLES,
  ZH_PLACEHOLDER,
  ZH_UNAVAILABLE,
} from "./subtitle-data";

export type SubtitleMode = "en" | "zh" | "bilingual";

export type TranscriptStatus = "loading" | "success" | "no_subtitle" | "error";

function computeActiveIndex(
  lines: SubtitleLine[],
  currentTimeSeconds: number
): number {
  if (lines.length === 0 || currentTimeSeconds < 0) return -1;
  let idx = -1;
  lines.forEach((line, i) => {
    const t = line.timestampSeconds ?? 0;
    if (t <= currentTimeSeconds) idx = i;
  });
  return idx;
}

export interface SubtitlePanelProps {
  mode?: SubtitleMode;
  onModeChange?: (mode: SubtitleMode) => void;
  /** 当前播放时间（秒），用于高亮与自动滚动 */
  currentTimeSeconds?: number;
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
  currentTimeSeconds,
  lines,
  transcriptStatus,
  loading = false,
  error,
  elapsedSeconds,
  onRowClick,
  className,
}: SubtitlePanelProps) {
  const displayLines = lines !== undefined && lines !== null ? lines : MOCK_SUBTITLES;

  const isLoading =
    transcriptStatus === "loading" || error === "loading";

  const activeIndex = React.useMemo(() => {
    if (currentTimeSeconds === undefined) return -1;
    return computeActiveIndex(displayLines, currentTimeSeconds);
  }, [currentTimeSeconds, displayLines]);

  const [userScrolling, setUserScrolling] = React.useState(false);
  const resumeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const programmaticScrollRef = React.useRef(false);
  const rowRefs = React.useRef<(HTMLLIElement | null)[]>([]);

  React.useEffect(() => {
    return () => {
      if (resumeTimer.current !== undefined) {
        clearTimeout(resumeTimer.current);
      }
    };
  }, []);

  React.useLayoutEffect(() => {
    if (userScrolling || activeIndex < 0) return;
    const el = rowRefs.current[activeIndex];
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 500);
    return () => window.clearTimeout(t);
  }, [activeIndex, userScrolling]);

  const handleListScroll = React.useCallback(() => {
    if (programmaticScrollRef.current) return;
    setUserScrolling(true);
    if (resumeTimer.current !== undefined) {
      clearTimeout(resumeTimer.current);
    }
    resumeTimer.current = setTimeout(() => setUserScrolling(false), 3000);
  }, []);

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
      <div
        onScroll={handleListScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
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
              <li
                key={`${line.timestamp}-${index}`}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
              >
                <button
                  type="button"
                  onClick={() => handleRowClick(line)}
                  aria-current={index === activeIndex ? "true" : undefined}
                  className={cn(
                    "w-full cursor-pointer px-3 py-2 text-left transition-colors hover:bg-muted/80",
                    index === activeIndex && "rounded-md bg-[#e4e8f4]"
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
