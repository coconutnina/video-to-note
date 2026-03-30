"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { getVideoInfo } from "@/lib/video-info";
import { getYouTubeVideoId } from "@/lib/youtube";
import { setCachedMindmap } from "@/lib/workspace-cache";
import { treeToFlow, type MindMapTreeNode } from "@/lib/mindmap";

function LogoMark() {
  return (
    <svg
      className="h-7 w-7 shrink-0"
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
  );
}

const STEPS = [
  { index: 1, label: "获取视频字幕", status: "done" as const },
  { index: 2, label: "字幕预处理", status: "done" as const },
  { index: 3, label: "AI 生成思维导图骨架", status: "active" as const },
  { index: 4, label: "进入学习空间，译文及导图细节将持续加载", status: "pending" as const },
];

type TranscriptItem = {
  text: string;
  start: number;
  duration: number;
};

function buildTimedWindows(
  transcript: TranscriptItem[],
  windowSeconds = 30
): { timestamp: string; text: string }[] {
  if (transcript.length === 0) return [];
  const out: { timestamp: string; text: string }[] = [];
  let windowStart = transcript[0].start;
  const buf: string[] = [];

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  for (const seg of transcript) {
    if (buf.length > 0 && seg.start - windowStart >= windowSeconds) {
      out.push({ timestamp: formatTime(windowStart), text: buf.join(" ") });
      buf.length = 0;
      windowStart = seg.start;
    }
    buf.push(seg.text);
  }
  if (buf.length > 0) {
    out.push({ timestamp: formatTime(windowStart), text: buf.join(" ") });
  }
  return out;
}

function LoadingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawVideoParam = (searchParams.get("url") || searchParams.get("videoId") || "").trim();
  const videoId = React.useMemo(() => getYouTubeVideoId(rawVideoParam), [rawVideoParam]);
  const urlParam = searchParams.get("url")?.trim() ?? "";
  const canonicalUrl = React.useMemo(() => {
    if (urlParam) return urlParam;
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    return "";
  }, [urlParam, videoId]);
  const [videoTitle, setVideoTitle] = React.useState("");
  const [titleState, setTitleState] = React.useState<"loading" | "success" | "error">("loading");
  const [currentStep, setCurrentStep] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isTimerRunning, setIsTimerRunning] = React.useState(false);
  const [retryTick, setRetryTick] = React.useState(0);
  const hasNavigatedRef = React.useRef(false);
  const videoTitleRef = React.useRef("");
  const routerRef = React.useRef(router);
  routerRef.current = router;
  const canonicalUrlRef = React.useRef(canonicalUrl);
  canonicalUrlRef.current = canonicalUrl;

  React.useEffect(() => {
    if (!videoId) {
      setTitleState("error");
      return;
    }
    let cancelled = false;
    setTitleState("loading");
    getVideoInfo(videoId)
      .then((info) => {
        if (cancelled) return;
        setVideoTitle(info.title);
        videoTitleRef.current = info.title;
        setTitleState("success");
      })
      .catch(() => {
        if (cancelled) return;
        setTitleState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  React.useEffect(() => {
    if (!isTimerRunning) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isTimerRunning]);

  React.useEffect(() => {
    if (!videoId) return;
    const controller = new AbortController();
    const signal = controller.signal;

    const run = async () => {
      try {
        setErrorMessage(null);
        setCurrentStep(1);
        setProgress(0);
        setElapsedSeconds(0);
        setIsTimerRunning(true);

        let transcriptData: { transcript?: TranscriptItem[]; error?: string } = {};
        let lastError = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          if (signal.aborted) return;
          try {
            const res = await fetch("/api/get-transcript", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoId }),
              signal,
            });
            transcriptData = (await res.json().catch(() => ({}))) as {
              transcript?: TranscriptItem[];
              error?: string;
            };
            if (
              res.ok &&
              Array.isArray(transcriptData.transcript) &&
              transcriptData.transcript.length > 0
            ) {
              break;
            }
            lastError = transcriptData.error || "字幕获取失败";
          } catch (err) {
            if (signal.aborted) return;
            lastError = err instanceof Error ? err.message : "字幕获取失败";
          }
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }

        if (
          !Array.isArray(transcriptData.transcript) ||
          transcriptData.transcript.length === 0
        ) {
          throw new Error(lastError || "字幕获取失败");
        }
        const transcript = transcriptData.transcript;
        if (signal.aborted) return;
        setProgress(25);

        setCurrentStep(2);
        const preprocessed = buildTimedWindows(transcript, 30);
        if (preprocessed.length === 0) {
          throw new Error("字幕预处理失败");
        }
        if (signal.aborted) return;
        setProgress(40);

        setCurrentStep(3);
        const mindmapRes = await fetch("/api/generate-mindmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            videoTitle: videoTitleRef.current.trim() || undefined,
          }),
          signal,
        });
        if (signal.aborted) return;

        const mindmapData = (await mindmapRes.json().catch(() => ({}))) as {
          mindmap?: { root?: MindMapTreeNode };
          error?: string;
        };
        if (!mindmapRes.ok || mindmapData.error || !mindmapData.mindmap?.root) {
          throw new Error(mindmapData.error || "思维导图生成失败");
        }
        if (signal.aborted) return;
        setProgress(90);

        const flow = treeToFlow(mindmapData.mindmap.root);
        setCachedMindmap(videoId, flow);
        try {
          localStorage.setItem(
            `workspace:loading-bootstrap:${videoId}`,
            JSON.stringify({
              transcript,
              videoTitle: videoTitleRef.current,
            })
          );
        } catch {
          // ignore localStorage quota/private mode
        }

        // 存完 bootstrap 后，后台提前触发前 20 条翻译，让工作区打开时已有部分缓存
        if (transcript.length > 0) {
          const firstBatch = transcript.slice(0, 20).map((seg, i) => ({
            id: i,
            text: seg.text,
          }));
          void fetch("/api/translate-subtitles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subtitles: firstBatch }),
          }).catch(() => {
            // 静默失败
          });
        }

        setCurrentStep(4);
        setProgress(100);
        setIsTimerRunning(false);

        await new Promise((resolve) => setTimeout(resolve, 800));
        if (signal.aborted || hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;
        routerRef.current.push(
          `/workspace?videoId=${encodeURIComponent(videoId)}&url=${encodeURIComponent(canonicalUrlRef.current)}`
        );
      } catch (err) {
        if (signal.aborted) return;
        setIsTimerRunning(false);
        setErrorMessage(err instanceof Error ? err.message : "处理失败，请重试");
      }
    };

    void run();
    return () => {
      controller.abort();
    };
  }, [videoId, retryTick]);

  function handleRetry() {
    hasNavigatedRef.current = false;
    setCurrentStep(0);
    setProgress(0);
    setElapsedSeconds(0);
    setErrorMessage(null);
    setRetryTick((n) => n + 1);
  }

  function getVisualStatus(index: number): "done" | "active" | "pending" {
    if (index < currentStep) return "done";
    if (index === currentStep) return "active";
    return "pending";
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:repeating-linear-gradient(0deg,_#000_0px,_#000_1px,_transparent_1px,_transparent_56px),repeating-linear-gradient(90deg,_#000_0px,_#000_1px,_transparent_1px,_transparent_56px)]" />

      <nav className="relative z-[2] flex h-16 items-center justify-between border-b border-[var(--rule)] px-[72px]">
        <div className="lp-anim-1 flex items-center gap-2.5">
          <LogoMark />
          <span className="font-serif text-[17px] font-medium tracking-[-0.01em]">video-to-note</span>
        </div>
        <div className="lp-anim-2 max-w-[400px] truncate font-serif text-[13px] font-normal text-[#444444]">
          {titleState === "loading" ? "Loading..." : titleState === "success" ? videoTitle : ""}
        </div>
      </nav>

      <main className="relative z-[1] grid h-[calc(100vh-64px-46px)] grid-cols-2 overflow-hidden">
        <section className="flex flex-col justify-between border-r border-[var(--rule)] px-[72px] pb-[72px] pt-16">
          <div>
            <div className="lp-anim-1 mb-[14px] font-mono text-[10px] font-normal uppercase tracking-[0.22em] text-[var(--gold)]">
              PROCESSING
            </div>
            <h1 className="lp-anim-2 mb-[10px] whitespace-nowrap font-serif text-[48px] font-normal leading-[1.1] tracking-[-0.02em]">
              Connecting the dots...
            </h1>
            {errorMessage ? (
              <div className="lp-anim-3 mb-14">
                <p className="text-[15px] font-normal text-[#cc0000]">{errorMessage}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-2 text-[13px] font-normal text-[#A8882A] underline underline-offset-4"
                >
                  重试
                </button>
              </div>
            ) : (
              <p className="lp-anim-3 mb-14 text-[15px] font-normal text-[#444444]">
                AI 正在理解视频内容，根据视频的时长，通常需要 15 秒至 2 分钟
              </p>
            )}

            <div className="lp-anim-4 flex flex-col">
              {STEPS.map((step, idx) => {
                const status = getVisualStatus(step.index);
                const isDone = status === "done";
                const isActive = status === "active";
                const circleCls = isDone
                  ? "bg-[rgba(168,136,42,0.10)] border-[rgba(168,136,42,0.25)] text-[var(--gold)]"
                  : isActive
                    ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--paper)]"
                    : "border-[var(--rule)] text-[var(--faint)]";
                const labelCls = isDone
                  ? "text-[#555555]"
                  : isActive
                    ? "text-[#111111]"
                    : "text-[#777777]";

                return (
                  <div
                    key={step.index}
                    className={`flex items-center gap-4 border-t border-[var(--rule)] py-[15px] ${
                      idx === STEPS.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <div
                      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-all duration-300 ${circleCls}`}
                    >
                      {isDone ? "✓" : step.index}
                    </div>
                    <span className={`flex-1 text-[14px] font-normal ${labelCls}`}>{step.label}</span>
                    {isDone ? (
                      <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-[var(--gold)]">
                        完成
                      </span>
                    ) : isActive ? (
                      <span className="flex shrink-0 items-center gap-[3px]">
                        <span className="lp-dot" />
                        <span className="lp-dot [animation-delay:0.2s]" />
                        <span className="lp-dot [animation-delay:0.4s]" />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-between px-[72px] pb-[72px] pt-16">
          <div className="lp-anim-3">
            <div className="mb-2 font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-[#444444]">整体进度</div>
            <div className="flex items-baseline gap-1 font-serif text-[108px] font-medium leading-none tracking-[-0.04em] transition-all duration-500">
              <span>{progress}</span>
              <span className="text-[56px] font-normal italic text-[var(--gold)]">%</span>
            </div>
          </div>

          <div className="lp-anim-5">
            <div className="mb-[10px] flex items-baseline justify-between">
              <span className="font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[#444444]">
                当前步骤
              </span>
              <span className="font-serif text-[12px] italic text-[#A8882A]">
                步骤 {Math.min(Math.max(currentStep, 1), 4)} / 4
              </span>
            </div>
            <div className="mb-[10px] h-[2px] w-full overflow-hidden rounded-[1px] bg-[var(--rule)]">
              <div
                className="h-full rounded-[1px] bg-[var(--gold)] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[12px] font-normal text-[#555555]">已用时 {elapsedSeconds}s</div>
          </div>
        </section>
      </main>

      <footer className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] flex h-[46px] items-center justify-center border-t border-[var(--rule)] bg-[rgba(251,251,251,0.95)] px-[72px]">
        <div className="pointer-events-auto text-center font-serif text-[14px] italic tracking-[0.01em] text-[#888888]">
          <span className="mx-[2px] text-[18px] text-[var(--gold)] [vertical-align:-2px]">&quot;</span>
          If you can&apos;t explain it simply, you don&apos;t understand it well enough.
          <span className="mx-[2px] text-[18px] text-[var(--gold)] [vertical-align:-2px]">&quot;</span>
          <span className="ml-[10px] font-mono text-[11px] not-italic tracking-[0.06em] text-[rgba(168,136,42,0.7)]">
            — Albert Einstein
          </span>
        </div>
        <a
          href="https://github.com/coconutnina/video-to-note"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute right-[72px] flex items-center text-[var(--faint)] transition-colors duration-150 hover:text-[var(--ink)]"
          title="View on GitHub"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path
              d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
              fill="currentColor"
            />
          </svg>
        </a>
      </footer>
    </div>
  );
}

export default function LoadingPage() {
  return (
    <React.Suspense fallback={null}>
      <LoadingClient />
    </React.Suspense>
  );
}
