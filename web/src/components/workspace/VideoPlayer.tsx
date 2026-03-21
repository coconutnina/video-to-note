"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  loadYouTubeIframeAPI,
  type YTPlayer,
} from "@/lib/youtube-iframe-api";

export interface VideoPlayerProps {
  videoId: string;
  className?: string;
  /** 播放进度（约每秒一次，依赖轮询 getCurrentTime） */
  onTimeUpdate?: (seconds: number) => void;
}

export type VideoPlayerHandle = {
  seekTo: (seconds: number) => void;
};

const YT_PLAYING = 1;

export const VideoPlayer = React.forwardRef<
  VideoPlayerHandle,
  VideoPlayerProps
>(function VideoPlayer({ videoId, className, onTimeUpdate }, ref) {
  const containerId = React.useId().replace(/:/g, "");
  const playerInstanceRef = React.useRef<YTPlayer | null>(null);
  const onTimeUpdateRef = React.useRef(onTimeUpdate);
  React.useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  React.useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number) {
        try {
          playerInstanceRef.current?.seekTo?.(seconds, true);
        } catch {
          /* Player 未就绪 */
        }
      },
    }),
    []
  );

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
            playerInstanceRef.current = player;
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
      playerInstanceRef.current = player;
    });

    return () => {
      cancelled = true;
      stopPoll();
      playerInstanceRef.current = null;
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
      className={cn("flex h-full min-h-0 w-full flex-col", className)}
      aria-label="视频播放器"
    >
      <div className="relative h-full w-full min-h-0 overflow-hidden rounded-lg bg-black">
        <div
          id={containerId}
          className="absolute inset-0 h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:object-contain"
        />
      </div>
    </section>
  );
});
