"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 地图/导航图标，占位用 */
function MapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-5", className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}

export interface LeftSidebarProps {
  /** 当前章节名称（mock 或后续从 API 来） */
  chapterName?: string;
  onNavModeClick?: () => void;
  className?: string;
}

export function LeftSidebar({
  chapterName = "什么是机器学习",
  onNavModeClick,
  className,
}: LeftSidebarProps) {
  const handleNavClick = () => {
    if (onNavModeClick) {
      onNavModeClick();
    }
  };

  return (
    <aside
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-6 bg-zinc-900 py-4",
        className
      )}
      aria-label="左侧边栏"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleNavClick}
        className="size-9 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        aria-label="切换导航模式"
      >
        <MapIcon />
      </Button>
      <div className="flex flex-1 flex-col justify-center">
        <div
          className="break-all text-xs font-medium text-zinc-400"
          style={{
            writingMode: "vertical-lr",
            textOrientation: "mixed",
          }}
        >
          {chapterName}
        </div>
      </div>
    </aside>
  );
}
