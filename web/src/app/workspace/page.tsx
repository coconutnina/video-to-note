"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { AIChatPanel } from "@/components/workspace/AIChatPanel";
import { LeftSidebar } from "@/components/workspace/LeftSidebar";
import { MindMap } from "@/components/workspace/MindMap";
import { SubtitlePanel } from "@/components/workspace/SubtitlePanel";
import type { SubtitleMode } from "@/components/workspace/SubtitlePanel";
import { VideoPlayer } from "@/components/workspace/VideoPlayer";
import type { FlowEdge, FlowNode } from "@/lib/mindmap";
import { treeToFlow } from "@/lib/mindmap";
import { fetchTranscript, formatTimestamp } from "@/lib/transcript";
import { fetchVideoInfo } from "@/lib/video-info";
import { getYouTubeVideoId } from "@/lib/youtube";
import type { SubtitleLine } from "@/components/workspace/subtitle-data";
import { ZH_PLACEHOLDER, ZH_UNAVAILABLE } from "@/components/workspace/subtitle-data";

type WorkspaceMode = "nav" | "focus";
type TranscriptStatus = "loading" | "success" | "no_subtitle" | "error";

function WorkspaceClient() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  const videoId = React.useMemo(() => getYouTubeVideoId(url), [url]);
  const [subtitleMode, setSubtitleMode] = React.useState<SubtitleMode>("bilingual");
  const [mode, setMode] = React.useState<WorkspaceMode>("nav");
  const [videoTitle, setVideoTitle] = React.useState<string>("加载中...");
  // 字幕加载状态：初始为 loading，只有 API 返回成功/失败后才改变，保证新视频加载时显示等待提示
  const [transcriptStatus, setTranscriptStatus] =
    React.useState<TranscriptStatus>("loading");
  const [elapsed, setElapsed] = React.useState(0);
  const [transcriptError, setTranscriptError] = React.useState<string | null>(null);
  const [transcriptLines, setTranscriptLines] = React.useState<SubtitleLine[] | null>(null);
  const [mindmapNodes, setMindmapNodes] = React.useState<FlowNode[] | null>(null);
  const [mindmapEdges, setMindmapEdges] = React.useState<FlowEdge[] | null>(null);
  const [mindmapLoading, setMindmapLoading] = React.useState(false);
  const [translations, setTranslations] = React.useState<
    Record<number, string | null | undefined>
  >({});
  const [videoSlotRect, setVideoSlotRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const slotNavRef = React.useRef<HTMLDivElement>(null);
  const slotFocusRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!videoId) return;
    fetchVideoInfo(videoId)
      .then((info) => setVideoTitle(info.title))
      .catch(() => setVideoTitle("无法获取视频信息"));
  }, [videoId]);

  React.useEffect(() => {
    if (!videoId) {
      setTranscriptLines(null);
      setTranscriptError(null);
      setTranscriptStatus("loading");
      setElapsed(0);
      setMindmapNodes(null);
      setMindmapEdges(null);
      setMindmapLoading(false);
      setTranslations({});
      return;
    }
    setTranscriptStatus("loading");
    setElapsed(0);
    setTranscriptError(null);
    setMindmapNodes(null);
    setMindmapEdges(null);
    setMindmapLoading(false);
    setTranslations({});
    fetchTranscript(videoId)
      .then((result) => {
        // 严格判断：只有明确有字幕数据才算成功，空对象 {} 或空 transcript 不算成功
        if (result.transcript && result.transcript.length > 0) {
          const segments = result.transcript;
          const lines: SubtitleLine[] = segments.map((seg) => ({
            timestamp: formatTimestamp(seg.start),
            timestampSeconds: seg.start,
            en: seg.text,
            zh: "",
          }));
          setTranscriptLines(lines);
          setTranscriptError(null);
          setTranscriptStatus("success");

          // 异步生成脑图，不阻塞字幕显示
          setMindmapLoading(true);
          fetch("/api/generate-mindmap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: segments,
              videoTitle: videoTitle !== "加载中..." ? videoTitle : undefined,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data?.mindmap?.root) {
                const { nodes, edges } = treeToFlow(data.mindmap.root);
                setMindmapNodes(nodes);
                setMindmapEdges(edges);
              }
            })
            .catch((err) => console.error("脑图生成失败:", err))
            .finally(() => setMindmapLoading(false));

          // 触发中文翻译（不会阻塞英文字幕显示）
          // 分句 + 分批并行翻译，避免断句且尽快返回首批结果
          if (segments.length > 0) {
            const splitIntoBatches = (
              subs: typeof segments,
              targetBatchSize = 20
            ) => {
              const batches: typeof segments[] = [];
              let current: typeof segments = [];
              for (let i = 0; i < subs.length; i++) {
                const item = subs[i];
                current.push(item);
                const text = (item.text ?? "").trim();
                const isSentenceEnd = /[.?!]$/.test(text);
                if (current.length >= targetBatchSize && isSentenceEnd) {
                  batches.push(current);
                  current = [];
                }
              }
              if (current.length > 0) batches.push(current);
              return batches;
            };

            const batches = splitIntoBatches(segments, 20);

            let startIndex = 0;
            const batchPromises = batches.map((batch) => {
              const currentStart = startIndex;
              startIndex += batch.length;

              const promise = (async () => {
                const res = await fetch("/api/translate-subtitles", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    subtitles: batch.map((seg, localIdx) => ({
                      id: currentStart + localIdx,
                      text: seg.text,
                      start: seg.start,
                      duration: seg.duration,
                    })),
                  }),
                });
                if (!res.ok) {
                  throw new Error("翻译接口错误");
                }
                const data = (await res.json().catch(() => ({}))) as {
                  translations?: { id: number; translated: string }[];
                };
                const translations = data.translations ?? [];
                if (!translations.length) {
                  throw new Error("翻译结果为空");
                }
                return translations;
              })();

              return { promise, startIndex: currentStart, batchLength: batch.length };
            });

            (async () => {
              for (const { promise, startIndex: batchStart, batchLength } of batchPromises) {
                try {
                  const translations = await promise;

                  setTranslations((prev) => {
                    const next: Record<number, string | null | undefined> = {
                      ...prev,
                    };
                    // 先将这一批所有 index 置为 null（表示已处理但可能无翻译）
                    for (let j = 0; j < batchLength; j++) {
                      next[batchStart + j] = null;
                    }
                    // 再用 DeepSeek 实际返回的结果覆盖
                    translations.forEach((item) => {
                      if (typeof item.id === "number" && item.translated) {
                        next[item.id] = item.translated;
                      }
                    });
                    return next;
                  });
                } catch (e) {
                  // 该批失败则仅将该批对应行标记为已处理但无翻译（null）
                  setTranslations((prev) => {
                    const next: Record<number, string | null | undefined> = {
                      ...prev,
                    };
                    for (let j = 0; j < batchLength; j++) {
                      next[batchStart + j] = null;
                    }
                    return next;
                  });
                }
              }
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
  }, [videoId, videoTitle]);

  // 依赖 transcriptLines + translations，transcript 更新后 transcriptLines 会变，此处会重算
  const renderedLines = React.useMemo<SubtitleLine[] | null>(() => {
    if (!transcriptLines) return null;
    return transcriptLines.map((line, idx) => {
      const t = translations[idx];
      const zh =
        t === undefined
          ? "翻译中..."
          : t ?? ""; // null -> 空白, string -> 翻译
      return { ...line, zh };
    });
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
                activeIndex={2}
                lines={renderedLines}
                transcriptStatus={transcriptStatus}
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

      {/* 专注模式布局：始终在 DOM 中，用 hidden / flex 控制显隐 */}
      <div
        className={`h-full w-full overflow-hidden ${mode === "focus" ? "flex" : "hidden"}`}
        aria-hidden={mode !== "focus"}
      >
        <LeftSidebar onNavModeClick={toggleMode} />
        <div className="flex min-w-0 flex-[7] flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-2">
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
              aria-label="切换到导航模式"
            >
              🗺 导航模式
            </Button>
          </div>
          <div ref={slotFocusRef} className="min-h-0 flex-1" />
        </div>
        <aside className="flex min-w-0 min-h-0 flex-[3] flex-col">
          <SubtitlePanel
            mode={subtitleMode}
            onModeChange={setSubtitleMode}
            activeIndex={2}
            lines={renderedLines}
            transcriptStatus={transcriptStatus}
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
        </aside>
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
            videoId={videoId}
            title={videoTitle}
            className="h-full min-h-0"
          />
        </div>
      )}

      <AIChatPanel
        transcript={
          transcriptLines?.map((l) => ({
            text: l.en,
            start: l.timestampSeconds ?? 0,
          })) ?? []
        }
      />
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
