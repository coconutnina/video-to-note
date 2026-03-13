"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { fetchVideoInfo, type VideoInfo } from "@/lib/video-info";
import { getYouTubeVideoId } from "@/lib/youtube";

const MOCK_DURATION_MS = 3000;

function getStepLabel(percent: number): string {
  if (percent < 25) return "正在获取视频字幕...";
  if (percent < 60) return "正在生成思维导图...";
  if (percent < 85) return "正在分析视频结构...";
  return "即将完成...";
}

function LoadingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";
  const videoId = React.useMemo(() => getYouTubeVideoId(url), [url]);

  const [progress, setProgress] = React.useState(0);
  const [hasRedirected, setHasRedirected] = React.useState(false);
  const [videoInfo, setVideoInfo] = React.useState<VideoInfo | null>(null);
  const [videoInfoError, setVideoInfoError] = React.useState(false);
  const [videoInfoLoading, setVideoInfoLoading] = React.useState(true);

  React.useEffect(() => {
    if (!url.trim()) return;
    let cancelled = false;
    setVideoInfoLoading(true);
    setVideoInfoError(false);
    fetchVideoInfo(videoId)
      .then((info) => {
        if (!cancelled) setVideoInfo(info);
      })
      .catch(() => {
        if (!cancelled) setVideoInfoError(true);
      })
      .finally(() => {
        if (!cancelled) setVideoInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, videoId]);

  // 无 URL 参数则回首页
  React.useEffect(() => {
    if (!url.trim()) {
      router.replace("/");
      return;
    }
  }, [url, router]);

  // 进度条动画：3 秒内 0 → 100，到 100% 跳转 /workspace
  React.useEffect(() => {
    if (!url.trim()) return;

    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / MOCK_DURATION_MS) * 100);
      setProgress(p);

      if (p >= 100) {
        if (!hasRedirected) {
          setHasRedirected(true);
          router.replace(`/workspace?${new URLSearchParams({ url }).toString()}`);
        }
        return;
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [url, router, hasRedirected]);

  if (!url.trim()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">正在跳转...</p>
      </div>
    );
  }

  const stepLabel = getStepLabel(progress);
  const title = videoInfoError ? "无法获取视频信息" : (videoInfo?.title ?? "");
  const showThumbnail = !videoInfoLoading && !videoInfoError && videoInfo?.thumbnail;

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          取消
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 pt-8">
        <section className="flex gap-4 rounded-lg border bg-card p-4">
          <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-md bg-muted">
            {videoInfoLoading ? (
              <div className="h-full w-full animate-pulse bg-muted-foreground/20" />
            ) : showThumbnail ? (
              <img
                src={videoInfo!.thumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                暂无缩略图
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium">
              {videoInfoLoading ? (
                <span className="inline-block h-5 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
              ) : (
                title || "—"
              )}
            </h2>
            {videoInfo?.channelTitle && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {videoInfo.channelTitle}
              </p>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{url}</p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">{stepLabel}</p>
        </section>

        <footer className="mt-auto pt-8 text-center text-xs text-muted-foreground">
          通常需要 15-30 秒
        </footer>
      </main>
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
