"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AIChatMode = "video-only" | "video-and-web";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: {
    video?: string[];
    web?: { title: string; url: string }[];
  };
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好！我已经读完这个视频，有什么想问的？",
};

const MOCK_VIDEO_SOURCES = ["00:02:15", "00:05:43"];
const MOCK_WEB_SOURCE = { title: "机器学习简介", url: "https://wikipedia.org" };

export function AIChatPanel() {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AIChatMode>("video-only");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [typing, setTyping] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const handleSend = React.useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setInput("");
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);
    scrollToBottom();

    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: "这是一个关于你问题的模拟回答，实际接入 API 后会替换。",
        sources: {
          video: MOCK_VIDEO_SOURCES,
          web: mode === "video-and-web" ? [MOCK_WEB_SOURCE] : undefined,
        },
      };
      setMessages((prev) => [...prev, aiMsg]);
      setTyping(false);
      scrollToBottom();
    }, 1500);
  }, [input, mode, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTimestampClick = (timestamp: string) => {
    console.log("跳转到时间戳：" + timestamp);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[9998] flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label={open ? "收起 AI 助手" : "打开 AI 助手"}
      >
        <span className="text-xl" aria-hidden>
          💬
        </span>
      </button>

      {open && (
        <section
          className="fixed bottom-24 right-6 z-[9999] flex h-[60vh] w-[380px] flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
          aria-label="AI 助手问答面板"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <h3 className="text-sm font-semibold">AI 助手</h3>
            <div className="flex items-center gap-1">
              <div className="flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("video-only")}
                  className={cn(
                    "rounded px-2 py-1 text-xs",
                    mode === "video-only"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  仅视频内容
                </button>
                <button
                  type="button"
                  onClick={() => setMode("video-and-web")}
                  className={cn(
                    "rounded px-2 py-1 text-xs",
                    mode === "video-and-web"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  视频+网络搜索
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto p-3"
          >
            <ul className="flex flex-col gap-3">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-muted text-foreground"
                        : "border bg-card text-foreground"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.role === "assistant" && msg.sources && (
                      <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                        {msg.sources.video && msg.sources.video.length > 0 && (
                          <div>
                            📍 视频来源：
                            {msg.sources.video.map((ts) => (
                              <button
                                key={ts}
                                type="button"
                                onClick={() => handleTimestampClick(ts)}
                                className="ml-1 underline hover:text-foreground"
                              >
                                [{ts}]
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.sources.web &&
                          msg.sources.web.length > 0 &&
                          mode === "video-and-web" && (
                            <div>
                              🔗 网络来源：
                              {msg.sources.web.map((s, i) => (
                                <a
                                  key={i}
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 underline hover:text-foreground"
                                >
                                  {s.title} ({new URL(s.url).hostname})
                                </a>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {typing && (
                <li className="flex justify-start">
                  <div className="rounded-lg border bg-card px-3 py-2 text-sm">
                    <span className="inline-flex gap-0.5">
                      <span className="animate-bounce [animation-delay:0ms]">.</span>
                      <span className="animate-bounce [animation-delay:150ms]">.</span>
                      <span className="animate-bounce [animation-delay:300ms]">.</span>
                    </span>
                  </div>
                </li>
              )}
            </ul>
          </div>

          <footer className="flex shrink-0 gap-2 border-t p-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="问问视频里的内容..."
              className="min-w-0 flex-1"
              disabled={typing}
            />
            <Button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || typing}
              size="default"
            >
              发送
            </Button>
          </footer>
        </section>
      )}
    </>
  );
}
