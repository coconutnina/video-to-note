"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Maximize, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { readGenerateMindmapStream } from "@/lib/read-generate-mindmap-stream";
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

type LoadingBootstrapPayload = {
  transcript?: TranscriptSegment[];
  videoTitle?: string;
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
  const [downloadOpen, setDownloadOpen] = React.useState(false);
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenPrompt, setRegenPrompt] = React.useState("");
  const [regenCount, setRegenCount] = React.useState(0);
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
  const downloadRef = React.useRef<HTMLDivElement>(null);
  const mindmapDownloadImageRef = React.useRef<(() => void) | null>(null);
  const mindmapDownloadMarkdownRef = React.useRef<(() => void) | null>(null);
  const backfillFiredRef = React.useRef<Set<string>>(new Set());
  const handleDownloadImage = React.useCallback(() => {
    if (mindmapDownloadImageRef.current) {
      mindmapDownloadImageRef.current();
      return;
    }
    console.log("download image hd");
  }, []);
  const handleDownloadMarkdown = React.useCallback(() => {
    if (mindmapDownloadMarkdownRef.current) {
      mindmapDownloadMarkdownRef.current();
      return;
    }
    console.log("download markdown");
  }, []);

  React.useEffect(() => {
    if (!videoId) return;
    fetchVideoInfo(videoId)
      .then((info) => {
        setVideoTitle(info.title);
        setChannelTitle(info.channelTitle ?? "");
        const metadataKey = `${videoId}:metadata`;
        if (backfillFiredRef.current.has(metadataKey)) return;
        backfillFiredRef.current.add(metadataKey);
        fetch("/api/cache/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "metadata",
            videoId,
            data: {
              title: info.title ?? "",
              channelTitle: info.channelTitle ?? "",
              durationSeconds:
                typeof info.durationSeconds === "number"
                  ? info.durationSeconds
                  : 0,
            },
          }),
        }).catch(() => {});
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
    let bootstrap: LoadingBootstrapPayload | null = null;
    try {
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem(`workspace:loading-bootstrap:${videoId}`);
        if (raw) {
          bootstrap = JSON.parse(raw) as LoadingBootstrapPayload;
        }
      }
    } catch {
      bootstrap = null;
    }

    if (bootstrap?.videoTitle && bootstrap.videoTitle.trim()) {
      setVideoTitle(bootstrap.videoTitle.trim());
    }

    const applyTranscriptAndContinue = (segments: TranscriptSegment[]) => {
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
        const mindmapKey = `${videoId}:mindmap`;
        if (!backfillFiredRef.current.has(mindmapKey)) {
          backfillFiredRef.current.add(mindmapKey);
          fetch("/api/cache/backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "mindmap",
              videoId,
              data: cachedMind,
            }),
          }).catch(() => {});
        }
      } else {
        setMindmapLoading(true);
        fetch("/api/generate-mindmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoId ?? "",
            transcript: segments,
            videoTitle:
              videoTitleRef.current !== "加载中..."
                ? videoTitleRef.current
                : undefined,
            channelTitle: channelTitleRef.current ?? "",
          }),
        })
          .then(async (res) => {
            const root = await readGenerateMindmapStream(res);
            const { nodes, edges } = treeToFlow(root);
            setMindmapNodes(nodes);
            setMindmapEdges(edges);
            setCachedMindmap(videoId, { nodes, edges });
          })
          .catch((err) => console.error("脑图生成失败:", err))
          .finally(() => setMindmapLoading(false));
      }

      // 触发中文翻译（不会阻塞英文字幕显示）；分批并行，尽快返回首批结果
      const cachedTranslations = getCachedTranslations(videoId);
      const mergedLineCount = lines.length;

      // 只要有缓存就先展示（即使不完整），再只翻译缺失行
      if (cachedTranslations) {
        translationsRef.current = { ...cachedTranslations };
        setTranslations({ ...cachedTranslations });
        const translationsKey = `${videoId}:translations`;
        if (!backfillFiredRef.current.has(translationsKey)) {
          backfillFiredRef.current.add(translationsKey);
          fetch("/api/cache/backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "translations",
              videoId,
              data: cachedTranslations,
            }),
          }).catch(() => {});
        }
      }

      if (mergedLineCount > 0) {
        (async () => {
          if (!cachedTranslations) {
            const remoteRes = await fetch(
              `/api/cache/get-translations?videoId=${encodeURIComponent(videoId)}`
            ).catch(() => null);
            const remoteData = (await remoteRes?.json().catch(() => ({}))) as {
              translations?: Record<number, string> | null;
            };
            if (
              remoteData?.translations &&
              typeof remoteData.translations === "object"
            ) {
              translationsRef.current = { ...remoteData.translations };
              setTranslations({ ...remoteData.translations });
              setCachedTranslations(videoId, { ...remoteData.translations });
            }
          }

          const missingIndices: number[] = [];
          for (let i = 0; i < mergedLineCount; i++) {
            if (translationsRef.current[i] === undefined) {
              missingIndices.push(i);
            }
          }

          // 缓存已完整覆盖，跳过翻译 API
          if (missingIndices.length === 0) {
            return;
          }

          const linesToTranslate = missingIndices.map((i) => lines[i]);

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

          const batches = splitIntoBatches(linesToTranslate, 20);

          const fetchBatchTranslations = async (
            batch: SubtitleLine[],
            batchStart: number
          ) => {
            const res = await fetch("/api/translate-subtitles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subtitles: batch.map((line, localIdx) => ({
                  id: missingIndices[batchStart + localIdx],
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
              setCachedTranslations(videoId, translationsRef.current);
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
          const translationsRecord: Record<number, string> = {};
          Object.entries(translationsRef.current).forEach(([id, translated]) => {
            const numericId = Number(id);
            if (Number.isFinite(numericId)) {
              translationsRecord[numericId] = translated;
            }
          });
          const translationsKey = `${videoId}:translations`;
          if (!backfillFiredRef.current.has(translationsKey)) {
            backfillFiredRef.current.add(translationsKey);
            fetch("/api/cache/backfill", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "translations",
                videoId,
                data: translationsRecord,
              }),
            }).catch(() => {});
          }
        })();
      }
    };

    if (Array.isArray(bootstrap?.transcript) && bootstrap.transcript.length > 0) {
      applyTranscriptAndContinue(bootstrap.transcript);
      return;
    }

    fetchTranscript(videoId)
      .then((result) => {
        // 严格判断：只有明确有字幕数据才算成功，空对象 {} 或空 transcript 不算成功
        if (result.transcript && result.transcript.length > 0) {
          applyTranscriptAndContinue(result.transcript as TranscriptSegment[]);
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

  React.useEffect(() => {
    if (!downloadOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (downloadRef.current && target && !downloadRef.current.contains(target)) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [downloadOpen]);

  React.useEffect(() => {
    if (!videoId || typeof window === "undefined") return;
    const raw = localStorage.getItem(`workspace:regen-count:${videoId}`);
    const count = raw ? Number(raw) : 0;
    setRegenCount(Number.isFinite(count) ? Math.max(0, Math.min(3, count)) : 0);
  }, [videoId]);

  React.useEffect(() => {
    if (!videoId || typeof window === "undefined") return;
    localStorage.setItem(`workspace:regen-count:${videoId}`, String(regenCount));
  }, [videoId, regenCount]);

  return (
    <div ref={wrapperRef} className="relative flex h-screen overflow-hidden bg-[#FBFBFB]">
      {/* 导航模式布局：始终在 DOM 中，用 hidden / flex 控制显隐 */}
      <div
        className={`h-full w-full overflow-hidden ${mode === "nav" ? "flex" : "hidden"}`}
        aria-hidden={mode !== "nav"}
      >
        <div
          className="flex min-h-0 min-w-0 flex-[1] flex-col bg-[#FBFBFB]"
          style={{ boxShadow: "2px 0 14px rgba(0,0,0,0.06)", zIndex: 1, position: "relative" }}
        >
          <header
            className="flex h-[46px] shrink-0 items-center gap-2 bg-[#FBFBFB] px-[14px]"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
          >
            <Link
              href="/"
              className="group inline-flex items-center gap-2"
              aria-label="返回首页"
            >
              <svg
                className="size-7 shrink-0"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <circle cx="14" cy="14" r="3.5" fill="#111111" />
                <line x1="14" y1="10.5" x2="14" y2="5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="17" y1="11.5" x2="21.5" y2="7.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="17.5" y1="14.5" x2="23" y2="14.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="17" y1="17" x2="21.5" y2="21" stroke="#C8B870" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="17.5" x2="14" y2="23" stroke="#C8B870" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="11" y1="17" x2="6.5" y2="21" stroke="#C8B870" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="10.5" y1="14.5" x2="5" y2="14.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="11" y1="11.5" x2="6.5" y2="7.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="14" cy="4" r="1.8" fill="#A8882A" />
                <circle cx="22.5" cy="6.5" r="1.8" fill="#A8882A" />
                <circle cx="24" cy="14.5" r="1.8" fill="#A8882A" />
                <circle cx="22.5" cy="22" r="1.8" fill="#C8B870" />
                <circle cx="14" cy="24" r="1.8" fill="#C8B870" />
                <circle cx="5.5" cy="22" r="1.8" fill="#C8B870" />
                <circle cx="4" cy="14.5" r="1.8" fill="#A8882A" />
                <circle cx="5.5" cy="6.5" r="1.8" fill="#A8882A" />
              </svg>
              <span
                className="text-[16px] font-medium text-[#111111] group-hover:text-[#111111]"
                style={{ fontFamily: '"EB Garamond", serif' }}
              >
                video-to-note
              </span>
            </Link>
            <span className="mx-1 h-[18px] w-px bg-[rgba(0,0,0,0.08)]" />
            <button
              type="button"
              onClick={() => setRegenOpen(true)}
              className="flex h-[30px] items-center gap-1.5 rounded-md border border-[#E4E4E4] px-3 text-[12.5px] text-[#444444] transition-all hover:border-[#AAAAAA] hover:text-[#111111]"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M10.5 2.5A5 5 0 1 0 10.5 9" />
                <path d="M10.5 2.5V5.5H7.5" />
              </svg>
              重新生成
              <span className="ml-0.5 text-[10px] font-normal normal-case tracking-wide text-[#888888]">
                开发中
              </span>
            </button>
            <div ref={downloadRef} className="relative">
              <button
                type="button"
                onClick={() => setDownloadOpen((v) => !v)}
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-[#E4E4E4] px-3 text-[12.5px] text-[#444444] transition-all hover:border-[#AAAAAA] hover:text-[#111111]"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 13 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M6.5 2v7M3 9l3.5 3 3.5-3" />
                  <path d="M2 11.5h9" />
                </svg>
                下载
                <span className="text-[10px] opacity-60">▾</span>
              </button>
              {downloadOpen && (
                <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[136px] overflow-hidden rounded-lg border border-[#E4E4E4] bg-[#FBFBFB] shadow-[0_4px_20px_rgba(0,0,0,0.10)]">
                  <button
                    type="button"
                    className="block w-full border-b border-[#F0F0F0] px-3 py-2 text-left text-[12.5px] text-[#444444] hover:bg-[#F0F0F0] hover:text-[#111111]"
                    onClick={() => {
                      handleDownloadMarkdown();
                      setDownloadOpen(false);
                    }}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-[12.5px] text-[#444444] hover:bg-[#F0F0F0] hover:text-[#111111]"
                    onClick={() => {
                      handleDownloadImage();
                      setDownloadOpen(false);
                    }}
                  >
                    高清图片
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setMode("focus")}
              aria-label="切换到专注观看模式"
              className="flex h-[30px] items-center gap-1.5 rounded-md border border-[#111111] bg-[#111111] px-3 text-[12.5px] text-white transition-all hover:bg-[#333333]"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden
              >
                <rect x="2" y="3.5" width="9" height="6" rx="1" />
                <path d="M2 6h9" />
              </svg>
              专注模式
            </button>
          </header>
          <div className="relative flex-1 overflow-hidden">
            <MindMap
              className="h-full w-full overflow-hidden"
              loading={mindmapLoading}
              initialNodes={mindmapNodes}
              initialEdges={mindmapEdges}
              onNodeClick={(seconds) => videoPlayerRef.current?.seekTo(seconds)}
              onDownloadImage={(download) => {
                mindmapDownloadImageRef.current = download;
              }}
              onDownloadMarkdown={(download) => {
                mindmapDownloadMarkdownRef.current = download;
              }}
            />
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-[1] flex-col bg-[#FBFBFB]">
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={slotNavRef} className="min-h-0 flex-1" />
            <div
              className="h-[42%] min-h-0 shrink-0"
              style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
            >
              <SubtitlePanel
                mode={subtitleMode}
                onModeChange={setSubtitleMode}
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
        </div>
      </div>

      {/* 专注模式：左侧视频+字幕，右侧 AI 固定栏 */}
      <div
        className={`h-full w-full min-h-0 ${mode === "focus" ? "flex" : "hidden"}`}
        aria-hidden={mode !== "focus"}
      >
        <Tooltip.Provider delayDuration={300}>
        <aside
          className="flex h-full w-[46px] shrink-0 flex-col items-center bg-[#FBFBFB] py-3"
          style={{
            boxShadow: "2px 0 8px rgba(0,0,0,0.05)",
            zIndex: 2,
            position: "relative",
            overflow: "visible",
          }}
        >
          <Link href="/" className="mb-3 block" title="返回首页" aria-label="返回首页">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden>
              <circle cx="14" cy="14" r="3.5" fill="#111111" />
              <line x1="14" y1="10.5" x2="14" y2="5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="17" y1="11.5" x2="21.5" y2="7.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="17.5" y1="14.5" x2="23" y2="14.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="17" y1="17" x2="21.5" y2="21" stroke="#C8B870" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="14" y1="17.5" x2="14" y2="23" stroke="#C8B870" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="11" y1="17" x2="6.5" y2="21" stroke="#C8B870" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="10.5" y1="14.5" x2="5" y2="14.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="11" y1="11.5" x2="6.5" y2="7.5" stroke="#A8882A" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="14" cy="4" r="1.8" fill="#A8882A" />
              <circle cx="22.5" cy="6.5" r="1.8" fill="#A8882A" />
              <circle cx="24" cy="14.5" r="1.8" fill="#A8882A" />
              <circle cx="22.5" cy="22" r="1.8" fill="#C8B870" />
              <circle cx="14" cy="24" r="1.8" fill="#C8B870" />
              <circle cx="5.5" cy="22" r="1.8" fill="#C8B870" />
              <circle cx="4" cy="14.5" r="1.8" fill="#A8882A" />
              <circle cx="5.5" cy="6.5" r="1.8" fill="#A8882A" />
            </svg>
          </Link>
          <div className="my-2 h-px w-[22px] bg-[#E4E4E4]" />
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => setMode("nav")}
                className="group relative flex size-[34px] items-center justify-center rounded-md text-[#777777] transition hover:bg-[#F0F0F0] hover:text-[#111111]"
                aria-label="切换到导航模式"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="2.5" cy="7.5" r="1.5" />
                  <circle cx="12.5" cy="3.5" r="1.5" />
                  <circle cx="12.5" cy="7.5" r="1.5" />
                  <circle cx="12.5" cy="11.5" r="1.5" />
                  <path d="M4 7.5L11 3.5M4 7.5L11 7.5M4 7.5L11 11.5" />
                </svg>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={10}
                className="bg-[#111111] text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-[999]"
              >
                导航模式
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="group relative mt-1 flex size-[34px] items-center justify-center rounded-md text-[#777777] transition hover:bg-[#F0F0F0] hover:text-[#111111]"
                aria-label={isFullscreen ? "退出全屏" : "全屏"}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M2 5.5V2.5H5M10 2.5H13V5.5M13 9.5V12.5H10M5 12.5H2V9.5" />
                </svg>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={10}
                className="bg-[#111111] text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-[999]"
              >
                全屏观看
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <div className="flex-1" />
          <div className="my-2 h-px w-[22px] bg-[#E4E4E4]" />
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Link
                href="/"
                className="group relative flex size-[34px] items-center justify-center rounded-md text-[#777777] transition hover:bg-[#F0F0F0] hover:text-[#111111]"
                aria-label="返回首页"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9.5 11.5L5.5 7.5l4-4" />
                </svg>
              </Link>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={10}
                className="bg-[#111111] text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-[999]"
              >
                返回首页
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </aside>
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          style={{ boxShadow: "2px 0 14px rgba(0,0,0,0.06)", zIndex: 1, position: "relative" }}
        >
          <div ref={slotFocusRef} className="flex-1 min-h-0" />
          <div
            className="h-[25vh] min-h-0 shrink-0 overflow-hidden"
            style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
          >
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
        <div className="flex h-full w-[360px] shrink-0 flex-col bg-[#FBFBFB]">
          <AIChatPanel
            variant="dock"
            transcript={chatTranscript}
            onSeekTo={handleChatSeekTo}
          />
        </div>
        </Tooltip.Provider>
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

      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-[480px] p-0">
          <DialogHeader className="border-b px-6 pb-4 pt-5">
            <DialogTitle
              className="text-[20px] font-medium text-[#111111]"
              style={{ fontFamily: '"EB Garamond", serif' }}
            >
              重新生成思维导图
            </DialogTitle>
            <DialogDescription className="pt-1 text-[12.5px] text-[#777777]">
              可补充说明，引导 AI 生成更符合你需要的结构
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2 pt-5">
            <label className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              补充提示词（可选）
            </label>
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              className="h-[100px] w-full resize-none rounded-md border px-3 py-2 text-sm outline-none transition focus:border-[#A8882A]"
              placeholder="例如：请把「实操案例」单独作为一级节点展开..."
            />
            <p className="mt-2 text-xs text-muted-foreground">
              留空则按默认方式重新生成。提示词将与原视频内容一起送入 AI。
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <div className="flex gap-1">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-[6px] w-[22px] rounded ${
                      idx < regenCount ? "bg-[#A8882A]" : "bg-[#E4E4E4]"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-[#777777]">
                本视频已使用 <strong className="font-medium text-[#111111]">{regenCount} / 3</strong> 次
              </p>
            </div>
          </div>
          <DialogFooter className="px-6 pb-5 pt-3">
            <Button type="button" variant="outline" onClick={() => setRegenOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-[#111111] text-white hover:bg-[#333333]"
              onClick={() => {
                if (regenCount >= 3) return;
                setRegenOpen(false);
                setRegenCount((c) => c + 1);
                console.log("regenerate", regenPrompt);
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M10.5 2.5A5 5 0 1 0 10.5 9" />
                <path d="M10.5 2.5V5.5H7.5" />
              </svg>
              开始重新生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
