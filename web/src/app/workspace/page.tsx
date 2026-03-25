"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { ArrowLeft, Map, Maximize, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AIChatPanel } from "@/components/workspace/AIChatPanel";
import { MindMap } from "@/components/workspace/MindMap";
import { SubtitlePanel } from "@/components/workspace/SubtitlePanel";
import type { SubtitleMode } from "@/components/workspace/SubtitlePanel";
import {
  VideoPlayer,
  type VideoPlayerHandle,
} from "@/components/workspace/VideoPlayer";
import type { FlowEdge, FlowNode } from "@/lib/mindmap";
import { treeToFlow } from "@/lib/mindmap";
import { fetchTranscript, formatTimestamp } from "@/lib/transcript";
import {
  clearAllCachedMindmaps,
  clearAllCachedTranslations,
  getCachedMindmap,
  getCachedTranslations,
  isTranslationsComplete,
  setCachedMindmap,
  setCachedTranslations,
} from "@/lib/workspace-cache";
import { fetchVideoInfo } from "@/lib/video-info";
import { getYouTubeVideoId } from "@/lib/youtube";
import type { SubtitleLine } from "@/components/workspace/subtitle-data";

type TranscriptSegment = {
  text: string;
  start: number;
  duration: number;
};

/** 按句末标点合并，最多 4 条合一组 */
function mergeSegments(segments: TranscriptSegment[]) {
  const groups: { en: string; start: number }[] = [];
  let buf: string[] = [];
  let startTime = 0;

  segments.forEach((seg, i) => {
    if (buf.length === 0) startTime = seg.start;
    buf.push(seg.text);
    const endsWithPunct = /[.?!]$/.test(seg.text.trim());
    if (endsWithPunct || buf.length >= 4 || i === segments.length - 1) {
      groups.push({ en: buf.join(" "), start: startTime });
      buf = [];
    }
  });
  return groups;
}

type WorkspaceMode = "nav" | "focus";
type TranscriptStatus = "loading" | "success" | "no_subtitle" | "error";

function parseTimestampToSeconds(time: string): number {
  const parts = time.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function WorkspaceClient() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  /** 测试用：访问 `...?clearMindmapCache=1` 会清空脑图 localStorage 并去掉该参数 */
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("clearMindmapCache") !== "1") return;
    clearAllCachedMindmaps();
    sp.delete("clearMindmapCache");
    const qs = sp.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
    );
  }, []);

  /** 测试用：访问 `...?clearTransCache=1` 会清空字幕翻译 localStorage 并去掉该参数 */
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("clearTransCache") !== "1") return;
    clearAllCachedTranslations();
    sp.delete("clearTransCache");
    const qs = sp.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
    );
  }, []);

  const videoId = React.useMemo(() => getYouTubeVideoId(url), [url]);
  const [subtitleMode, setSubtitleMode] = React.useState<SubtitleMode>("bilingual");
  const [mode, setMode] = React.useState<WorkspaceMode>("nav");
  const [videoTitle, setVideoTitle] = React.useState<string>("加载中...");
  const [channelTitle, setChannelTitle] = React.useState<string>("");
  const videoTitleRef = React.useRef(videoTitle);
  const channelTitleRef = React.useRef(channelTitle);
  React.useEffect(() => {
    videoTitleRef.current = videoTitle;
  }, [videoTitle]);
  React.useEffect(() => {
    channelTitleRef.current = channelTitle;
  }, [channelTitle]);
  // 字幕加载状态：初始为 loading，只有 API 返回成功/失败后才改变，保证新视频加载时显示等待提示
  const [transcriptStatus, setTranscriptStatus] =
    React.useState<TranscriptStatus>("loading");
  const [elapsed, setElapsed] = React.useState(0);
  const [transcriptError, setTranscriptError] = React.useState<string | null>(null);
  const [transcriptLines, setTranscriptLines] = React.useState<SubtitleLine[] | null>(null);
  /** key 为合并后字幕行下标（与 transcriptLines 一致） */
  const [translations, setTranslations] = React.useState<Record<number, string>>({});
  const translationsRef = React.useRef<Record<number, string>>({});
  const [mindmapNodes, setMindmapNodes] = React.useState<FlowNode[] | null>(null);
  const [mindmapEdges, setMindmapEdges] = React.useState<FlowEdge[] | null>(null);
  const [mindmapLoading, setMindmapLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [videoSlotRect, setVideoSlotRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const slotNavRef = React.useRef<HTMLDivElement>(null);
  const slotFocusRef = React.useRef<HTMLDivElement>(null);
  const videoPlayerRef = React.useRef<VideoPlayerHandle>(null);

  React.useEffect(() => {
    if (!videoId) return;
    fetchVideoInfo(videoId)
      .then((info) => {
        setVideoTitle(info.title);
        setChannelTitle(info.channelTitle ?? "");
      })
      .catch(() => {
        setVideoTitle("无法获取视频信息");
        setChannelTitle("");
      });
  }, [videoId]);

  React.useEffect(() => {
    if (!videoId) {
      setTranscriptLines(null);
      setTranslations({});
      translationsRef.current = {};
      setTranscriptError(null);
      setTranscriptStatus("loading");
      setElapsed(0);
      setMindmapNodes(null);
      setMindmapEdges(null);
      setMindmapLoading(false);
      setCurrentTime(0);
      return;
    }
    setTranscriptStatus("loading");
    setElapsed(0);
    setTranscriptError(null);
    setMindmapNodes(null);
    setMindmapEdges(null);
    setMindmapLoading(false);
    setTranslations({});
    translationsRef.current = {};
    setTranscriptLines(null);
    setCurrentTime(0);
    fetchTranscript(videoId)
      .then((result) => {
        // 严格判断：只有明确有字幕数据才算成功，空对象 {} 或空 transcript 不算成功
        if (result.transcript && result.transcript.length > 0) {
          const segments = result.transcript as TranscriptSegment[];
          const merged = mergeSegments(segments);
          const lines: SubtitleLine[] = merged.map((g) => ({
            timestamp: formatTimestamp(g.start),
            timestampSeconds: g.start,
            en: g.en,
            zh: "",
          }));
          setTranscriptLines(lines);
          setTranscriptError(null);
          setTranscriptStatus("success");

          // 异步生成脑图，不阻塞字幕显示（优先 localStorage）
          const cachedMind = getCachedMindmap(videoId);
          if (cachedMind) {
            setMindmapNodes(cachedMind.nodes);
            setMindmapEdges(cachedMind.edges);
          } else {
            setMindmapLoading(true);
            fetch("/api/generate-mindmap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transcript: segments,
                videoTitle:
                  videoTitleRef.current !== "加载中..."
                    ? videoTitleRef.current
                    : undefined,
                channelTitle: channelTitleRef.current ?? "",
              }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data?.mindmap?.root) {
                  const { nodes, edges } = treeToFlow(data.mindmap.root);
                  setMindmapNodes(nodes);
                  setMindmapEdges(edges);
                  setCachedMindmap(videoId, { nodes, edges });
                }
              })
              .catch((err) => console.error("脑图生成失败:", err))
              .finally(() => setMindmapLoading(false));
          }

          // 触发中文翻译（不会阻塞英文字幕显示）；分批并行，尽快返回首批结果
          const cachedTranslations = getCachedTranslations(videoId);
          const mergedLineCount = lines.length;
          const translationsCacheComplete =
            cachedTranslations &&
            isTranslationsComplete(cachedTranslations, mergedLineCount);

          if (translationsCacheComplete && cachedTranslations) {
            translationsRef.current = { ...cachedTranslations };
            setTranslations({ ...cachedTranslations });
          } else if (mergedLineCount > 0) {
            const splitIntoBatches = (
              subs: SubtitleLine[],
              targetBatchSize = 20
            ) => {
              const batches: SubtitleLine[][] = [];
              let current: SubtitleLine[] = [];
              for (let i = 0; i < subs.length; i++) {
                const item = subs[i];
                current.push(item);
                if (current.length >= targetBatchSize) {
                  batches.push(current);
                  current = [];
                }
              }
              if (current.length > 0) batches.push(current);
              return batches;
            };

            const batches = splitIntoBatches(lines, 20);

            const fetchBatchTranslations = async (
              batch: SubtitleLine[],
              batchStart: number
            ) => {
              const res = await fetch("/api/translate-subtitles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subtitles: batch.map((line, localIdx) => ({
                    id: batchStart + localIdx,
                    text: line.en,
                  })),
                }),
              });
              if (!res.ok) {
                throw new Error("翻译接口错误");
              }
              const data = (await res.json().catch(() => ({}))) as {
                translations?: { id?: number; translated?: string }[];
              };
              return data.translations ?? [];
            };

            const applyBatchTranslations = (
              batchStart: number,
              batchLength: number,
              items: { id?: number; translated?: string }[]
            ) => {
              setTranslations((prev) => {
                const next = { ...prev };
                items.forEach((item, index) => {
                  const id =
                    typeof item.id === "number" ? item.id : batchStart + index;
                  next[id] = item.translated ?? "";
                });
                // 补全本批次内未返回的 id，防止永远停在“翻译中...”
                for (let i = 0; i < batchLength; i++) {
                  const id = batchStart + i;
                  if (next[id] === undefined) next[id] = "";
                }
                translationsRef.current = next;
                return next;
              });
            };

            const markBatchFailed = (batchStart: number, batchLength: number) => {
              if (batchLength <= 0) return;
              setTranslations((prev) => {
                const next = { ...prev };
                for (let i = 0; i < batchLength; i++) {
                  next[batchStart + i] = "";
                }
                translationsRef.current = next;
                return next;
              });
            };

            let startIndex = 0;
            const batchPromiseConfigs = batches.map((batch) => {
              const currentStart = startIndex;
              startIndex += batch.length;
              return {
                batch,
                startIndex: currentStart,
                batchLength: batch.length,
              };
            });

            const CONCURRENCY = 3;
            const queue = [...batchPromiseConfigs];

            (async () => {
              const workers = Array.from({ length: CONCURRENCY }, async () => {
                while (queue.length > 0) {
                  const item = queue.shift()!;
                  const { batch, startIndex: batchStart, batchLength } = item;
                  try {
                    const batchTranslations = await fetchBatchTranslations(
                      batch,
                      batchStart
                    );
                    applyBatchTranslations(
                      batchStart,
                      batchLength,
                      batchTranslations
                    );
                  } catch {
                    try {
                      const batchTranslations = await fetchBatchTranslations(
                        batch,
                        batchStart
                      );
                      applyBatchTranslations(
                        batchStart,
                        batchLength,
                        batchTranslations
                      );
                    } catch {
                      markBatchFailed(batchStart, batchLength);
                    }
                  }
                }
              });
              await Promise.all(workers);
              setCachedTranslations(videoId, { ...translationsRef.current });
            })();
          }
        } else if (result.error === "no_subtitle") {
          setTranscriptStatus("no_subtitle");
          setTranscriptError("该视频暂无英文字幕");
          setTranscriptLines([]);
        } else {
          setTranscriptStatus("error");
          setTranscriptError(result?.error ?? "获取字幕失败，请稍后重试");
          setTranscriptLines(null);
        }
      })
      .catch(() => {
        setTranscriptStatus("error");
        setTranscriptError("获取字幕失败，请稍后重试");
        setTranscriptLines(null);
      })
  }, [videoId]);

  const renderedLines = React.useMemo<SubtitleLine[] | null>(() => {
    if (!transcriptLines) return null;
    return transcriptLines.map((line, idx) => ({
      ...line,
      zh:
        translations[idx] === undefined
          ? "翻译中..."
          : (translations[idx] ?? ""),
    }));
  }, [transcriptLines, translations]);

  // 加载中时每秒更新 elapsed，用于字幕面板「已等待 N 秒」提示
  React.useEffect(() => {
    if (transcriptStatus !== "loading") return;
    const timer = window.setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [transcriptStatus]);

  const updateVideoPosition = React.useCallback(() => {
    const wrapper = wrapperRef.current;
    const slot = mode === "nav" ? slotNavRef.current : slotFocusRef.current;
    if (!wrapper || !slot) return;
    const wr = wrapper.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();
    setVideoSlotRect({
      top: sr.top - wr.top,
      left: sr.left - wr.left,
      width: sr.width,
      height: sr.height,
    });
  }, [mode]);

  React.useLayoutEffect(() => {
    updateVideoPosition();
    const onResize = () => updateVideoPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateVideoPosition]);

  const toggleMode = () => setMode((m) => (m === "nav" ? "focus" : "nav"));

  React.useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);

  const chatTranscript =
    transcriptLines?.map((l) => ({
      text: l.en,
      start: l.timestampSeconds ?? 0,
    })) ?? [];

  const handleChatSeekTo = React.useCallback((time: string) => {
    videoPlayerRef.current?.seekTo(parseTimestampToSeconds(time));
  }, []);

  return (
    <div ref={wrapperRef} className="relative flex h-screen overflow-hidden bg-background">
      {/* 导航模式布局：始终在 DOM 中，用 hidden / flex 控制显隐 */}
      <div
        className={`h-full w-full overflow-hidden ${mode === "nav" ? "flex" : "hidden"}`}
        aria-hidden={mode !== "nav"}
      >
        <div className="flex min-w-0 min-h-0 flex-[1] flex-col border-r">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-background px-3 py-2">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              返回首页
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleMode}
              aria-label="切换到专注观看模式"
            >
              ▶ 专注观看
            </Button>
          </header>
          <div className="relative flex-1 overflow-hidden">
            <MindMap
              className="h-full w-full overflow-hidden"
              loading={mindmapLoading}
              initialNodes={mindmapNodes}
              initialEdges={mindmapEdges}
              onNodeClick={(seconds) => videoPlayerRef.current?.seekTo(seconds)}
            />
          </div>
        </div>
        <div className="flex min-w-0 min-h-0 flex-[1] flex-col">
          <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
            <div ref={slotNavRef} className="min-h-0 flex-1" />
            <div className="h-[40%] min-h-0 shrink-0">
              <SubtitlePanel
                mode={subtitleMode}
                onModeChange={setSubtitleMode}
                currentTimeSeconds={currentTime}
                lines={renderedLines}
                transcriptStatus={transcriptStatus}
                onLineClick={(seconds) => videoPlayerRef.current?.seekTo(seconds)}
                loading={
                  transcriptStatus === "loading" ||
                  (transcriptLines == null &&
                    transcriptStatus !== "error" &&
                    transcriptStatus !== "no_subtitle")
                }
                error={
                  transcriptStatus === "no_subtitle" || transcriptStatus === "error"
                    ? transcriptError
                    : null
                }
                elapsedSeconds={elapsed}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 专注模式：左侧视频+字幕，右侧 AI 固定栏 */}
      <div
        className={`h-full w-full min-h-0 overflow-hidden ${mode === "focus" ? "flex" : "hidden"}`}
        aria-hidden={mode !== "focus"}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* 视频容器：黑底 + 16:9 画面居中，左右黑边上的控制 */}
          <div
            className="relative w-full shrink-0 bg-black"
            style={{ height: "60vh" }}
          >
            <div
              ref={slotFocusRef}
              className="mx-auto h-full"
              style={{
                aspectRatio: "16/9",
                maxWidth: "calc(60vh * 16 / 9)",
              }}
            />
            <div className="absolute left-0 top-0 z-20 flex h-full w-10 flex-col items-center justify-between py-4">
              <Link
                href="/"
                className="text-white/60 transition-colors hover:text-white"
                title="返回首页"
                aria-label="返回首页"
              >
                <ArrowLeft size={18} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={toggleMode}
                className="text-white/60 transition-colors hover:text-white"
                title="导航模式"
                aria-label="切换到导航模式"
              >
                <Map size={18} aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="text-white/60 transition-colors hover:text-white"
                title={isFullscreen ? "退出全屏" : "全屏"}
                aria-label={isFullscreen ? "退出全屏" : "全屏"}
              >
                {isFullscreen ? (
                  <Minimize size={18} aria-hidden />
                ) : (
                  <Maximize size={18} aria-hidden />
                )}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden border-t">
            <SubtitlePanel
              mode="bilingual"
              hideHeader
              hideModeToggle
              className="border-l-0"
              currentTimeSeconds={currentTime}
              lines={renderedLines}
              transcriptStatus={transcriptStatus}
              onLineClick={(seconds) => videoPlayerRef.current?.seekTo(seconds)}
              loading={
                transcriptStatus === "loading" ||
                (transcriptLines == null &&
                  transcriptStatus !== "error" &&
                  transcriptStatus !== "no_subtitle")
              }
              error={
                transcriptStatus === "no_subtitle" || transcriptStatus === "error"
                  ? transcriptError
                  : null
              }
              elapsedSeconds={elapsed}
            />
          </div>
        </div>
        <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
          <AIChatPanel
            variant="dock"
            transcript={chatTranscript}
            onSeekTo={handleChatSeekTo}
          />
        </div>
      </div>

      {/* 唯一一个播放器实例：绝对定位到当前模式的“槽位”，不随模式切换销毁 */}
      {videoSlotRect && (
        <div
          className="absolute z-10 flex flex-col gap-3 overflow-hidden"
          style={{
            top: videoSlotRect.top,
            left: videoSlotRect.left,
            width: videoSlotRect.width,
            height: videoSlotRect.height,
          }}
        >
          <VideoPlayer
            ref={videoPlayerRef}
            videoId={videoId}
            className="h-full min-h-0"
            onTimeUpdate={setCurrentTime}
          />
        </div>
      )}

      {mode === "nav" && (
        <AIChatPanel
          variant="fab"
          transcript={chatTranscript}
          onSeekTo={handleChatSeekTo}
        />
      )}
    </div>
  );
}

function WorkspaceFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div
          className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="加载中"
        />
        <p className="text-sm">页面加载中...</p>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <React.Suspense fallback={<WorkspaceFallback />}>
      <WorkspaceClient />
    </React.Suspense>
  );
}
