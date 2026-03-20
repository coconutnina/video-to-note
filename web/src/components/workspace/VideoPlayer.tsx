"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  loadYouTubeIframeAPI,
  type YTPlayer,
} from "@/lib/youtube-iframe-api";

export interface VideoPlayerProps {
  videoId: string;
  title?: string;
  className?: string;
  /** 播放进度（约每秒一次，依赖轮询 getCurrentTime） */
  onTimeUpdate?: (seconds: number) => void;
}

const YT_PLAYING = 1;

export function VideoPlayer({
  videoId,
  title = "Machine Learning Fundamentals",
  className,
  onTimeUpdate,
}: VideoPlayerProps) {
  const containerId = React.useId().replace(/:/g, "");
  const onTimeUpdateRef = React.useRef(onTimeUpdate);
  React.useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  React.useEffect(() => {
    if (!videoId) return;

    let cancelled = false;
    let player: YTPlayer | null = null;
    let pollTimer: number | null = null;

    const emit = () => {
      try {
        const t = player?.getCurrentTime?.();
        if (typeof t === "number" && !Number.isNaN(t) && !cancelled) {
          onTimeUpdateRef.current?.(t);
        }
      } catch {
        /* iframe 未就绪等 */
      }
    };

    const stopPoll = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPoll = () => {
      stopPoll();
      pollTimer = window.setInterval(emit, 1000);
      emit();
    };

    loadYouTubeIframeAPI().then(() => {
      if (cancelled) return;
      const w = window as unknown as {
        YT: {
          Player: new (id: string, options: unknown) => YTPlayer;
          PlayerState?: { PLAYING: number };
        };
      };

      const playing = w.YT.PlayerState?.PLAYING ?? YT_PLAYING;

      player = new w.YT.Player(containerId, {
        videoId,
        height: "100%",
        width: "100%",
        playerVars: { rel: 0 },
        events: {
          onReady: () => {
            emit();
          },
          onStateChange: (e: { data: number }) => {
            stopPoll();
            if (e.data === playing) {
              startPoll();
            } else {
              emit();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopPoll();
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
      player = null;
    };
  }, [videoId, containerId]);

  if (!videoId) {
    return null;
  }

  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-label="视频播放器"
    >
      <div className="relative w-full overflow-hidden rounded-lg bg-black">
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <div id={containerId} className="absolute inset-0 h-full w-full" />
        </div>
      </div>
      <h2 className="line-clamp-2 text-sm font-medium text-foreground">
        {title}
      </h2>
    </section>
  );
}
