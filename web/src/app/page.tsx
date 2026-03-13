"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function isValidYouTubeUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;

  try {
    const url = new URL(value);
    const href = url.href;
    return (
      href.includes("youtube.com/watch?v=") || href.includes("youtu.be/")
    );
  } catch {
    // 允许用户直接粘贴不带协议的链接，简单用字符串兜底
    return (
      value.includes("youtube.com/watch?v=") || value.includes("youtu.be/")
    );
  }
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function validate(current: string): string | null {
    const trimmed = current.trim();
    if (!trimmed) {
      return "请先输入链接";
    }
    if (!isValidYouTubeUrl(trimmed)) {
      return "请输入有效的 YouTube 链接";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = validate(url);
    setError(message);
    if (message) return;

    const params = new URLSearchParams({ url: url.trim() });
    router.push(`/loading?${params.toString()}`);
  }

  const isEmpty = url.trim().length === 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 py-16">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="text-2xl font-semibold">Video to Note</div>
          <p className="text-sm text-muted-foreground">
            把 YouTube 视频变成可以快速浏览和复习的知识笔记
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col items-stretch gap-3"
        >
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="粘贴 YouTube 视频链接"
            inputMode="url"
            autoComplete="off"
            className="h-12 text-base"
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <Button type="submit" disabled={isEmpty} className="mt-2 h-11">
            开始学习
          </Button>
        </form>
      </main>
    </div>
  );
}
