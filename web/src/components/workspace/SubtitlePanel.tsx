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
  /** 点击字幕行跳转播放（秒） */
  onLineClick?: (seconds: number) => void;
  /** 为 true 时隐藏英文/中文/双语切换，固定按双语展示（专注模式） */
  hideModeToggle?: boolean;
  /** 为 true 时隐藏整个标题栏（含「双语字幕」与模式切换） */
  hideHeader?: boolean;
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
  onLineClick,
  hideModeToggle = false,
  hideHeader = false,
  className,
}: SubtitlePanelProps) {
  const displayLines = lines !== undefined && lines !== null ? lines : MOCK_SUBTITLES;
  const displayMode: SubtitleMode =
    hideHeader || hideModeToggle ? "bilingual" : mode;

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

  const isPlaceholderZh = (zh: string) =>
    zh === ZH_PLACEHOLDER || zh === ZH_UNAVAILABLE;

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col border-l bg-muted/30", className)}
      aria-label="字幕面板"
    >
      {!hideHeader && (
        <header className="flex h-[38px] shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[#FBFBFB] px-[14px]">
          <h3
            className="text-[10px] uppercase tracking-[0.14em] text-[#777777]"
            style={{ fontFamily: '"IBM Plex Mono", monospace' }}
          >
            双语字幕
          </h3>
          {!hideModeToggle && (
            <div className="flex overflow-hidden rounded-[5px] border border-[#E4E4E4]">
              {(["en", "zh", "bilingual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange?.(m)}
                  className={cn(
                    "px-[10px] py-[3px] text-[11.5px] transition-colors",
                    m !== "bilingual" && "border-r border-[#E4E4E4]",
                    mode === m
                      ? "bg-[#111111] text-white"
                      : "bg-transparent text-[#777777] hover:text-[#111111]"
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </header>
      )}
      <div
        onScroll={handleListScroll}
        className="subtitle-scroll flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
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
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (line.timestampSeconds != null) {
                      onLineClick?.(line.timestampSeconds);
                    }
                    onRowClick?.(line.timestamp, line.timestampSeconds);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    if (line.timestampSeconds != null) {
                      onLineClick?.(line.timestampSeconds);
                    }
                    onRowClick?.(line.timestamp, line.timestampSeconds);
                  }}
                  aria-current={index === activeIndex ? "true" : undefined}
                  className={cn(
                    "w-full cursor-pointer px-[14px] py-[9px] text-left transition-colors hover:bg-[#F0F0F0]",
                    index === activeIndex && "border-l-2 border-[#A8882A] bg-[rgba(168,136,42,0.07)] pl-[12px]"
                  )}
                >
                  <div
                    className={cn(
                      "mb-[3px] text-[10px] text-[#AAAAAA]",
                      index === activeIndex && "text-[#A8882A]"
                    )}
                    style={{ fontFamily: '"IBM Plex Mono", monospace' }}
                  >
                    [{line.timestamp}]
                  </div>
                  {displayMode === "en" && (
                    <div
                      className="mb-[3px] text-[13px] font-normal leading-[1.6] text-[#111111]"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}
                    >
                      {line.en}
                    </div>
                  )}
                  {displayMode === "zh" && (
                    <div
                      className={cn(
                        "text-[12.5px] font-normal leading-[1.6]",
                        isPlaceholderZh(line.zh)
                          ? "italic text-[#444444]"
                          : "text-[#444444]"
                      )}
                      style={{ fontFamily: '"DM Sans", sans-serif' }}
                    >
                      {line.zh}
                    </div>
                  )}
                  {displayMode === "bilingual" && (
                    <>
                      <div
                        className="mb-[3px] text-[13px] font-normal leading-[1.6] text-[#111111]"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}
                      >
                        {line.en}
                      </div>
                      <div
                        className={cn(
                          "text-[12.5px] font-normal leading-[1.6] text-[#444444]",
                          isPlaceholderZh(line.zh) && "italic"
                        )}
                        style={{ fontFamily: '"DM Sans", sans-serif' }}
                      >
                        {line.zh}
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
