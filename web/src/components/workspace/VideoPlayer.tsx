"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  videoId: string;
  title?: string;
  className?: string;
}

export function VideoPlayer({
  videoId,
  title = "Machine Learning Fundamentals",
  className,
}: VideoPlayerProps) {
  const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0`;

  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-label="视频播放器"
    >
      <div className="relative w-full overflow-hidden rounded-lg bg-black">
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={embedUrl}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
      <h2 className="line-clamp-2 text-sm font-medium text-foreground">
        {title}
      </h2>
    </section>
  );
}
