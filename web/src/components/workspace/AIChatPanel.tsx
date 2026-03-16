"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AIChatMode = "video" | "search";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: {
    video?: string[];
    web?: { title: string; url: string }[];
  };
}

export interface AIChatPanelProps {
  /** 当前视频字幕，用于上下文；空则仅用历史与问题 */
  transcript?: { text: string; start: number }[];
  /** 点击时间戳时跳转到视频对应位置 */
  onSeekTo?: (time: string) => void;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好！我已经读完这个视频，有什么想问的？",
};

const TIMESTAMP_REGEX = /\[(\d{2}:\d{2}(?::\d{2})?)\]/g;

function parseContentWithTimestamps(
  content: string,
  onSeekTo?: (time: string) => void
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TIMESTAMP_REGEX.source, "g");
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <React.Fragment key={`t-${lastIndex}`}>
          {content.slice(lastIndex, match.index)}
        </React.Fragment>
      );
    }
    const time = match[1];
    nodes.push(
      onSeekTo ? (
        <button
          key={`ts-${match.index}`}
          type="button"
          onClick={() => onSeekTo(time)}
          className="timestamp-btn mx-0.5 rounded px-1 font-medium text-primary underline decoration-primary/60 underline-offset-2 hover:decoration-primary"
        >
          {match[0]}
        </button>
      ) : (
        <span key={`ts-${match.index}`} className="font-medium text-muted-foreground">
          {match[0]}
        </span>
      )
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) {
    nodes.push(
      <React.Fragment key={`t-${lastIndex}`}>{content.slice(lastIndex)}</React.Fragment>
    );
  }
  return nodes.length > 0 ? nodes : [content];
}

export function AIChatPanel({ transcript = [], onSeekTo }: AIChatPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AIChatMode>("video");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [typing, setTyping] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
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

    const historyMessages = messages.filter((m) => m.id !== WELCOME_MESSAGE.id);
    const history: { role: "user" | "assistant"; content: string }[] = historyMessages.map(
      (m) => ({ role: m.role, content: m.content })
    );

    console.log("发送问答请求，transcript 长度:", transcript?.length);
    console.log("mode:", mode);

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text,
        transcript,
        history,
        mode,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((d) => Promise.reject(new Error(d?.error ?? "请求失败")));
        }
        return res.json();
      })
      .then((data: { answer?: string }) => {
        const answer = data?.answer ?? "回答生成失败，请重试";
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: answer,
        };
        setMessages((prev) => [...prev, aiMsg]);
        scrollToBottom();
      })
      .catch(() => {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: "回答生成失败，请重试",
        };
        setMessages((prev) => [...prev, aiMsg]);
        scrollToBottom();
      })
      .finally(() => {
        setTyping(false);
      });
  }, [input, mode, messages, transcript, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs",
                  mode === "search" ? "text-muted-foreground" : "font-medium text-foreground"
                )}
              >
                仅视频
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={mode === "search"}
                onClick={() => setMode((m) => (m === "video" ? "search" : "video"))}
                className={cn(
                  "relative h-5 w-10 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  mode === "search" ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 block h-4 w-4 rounded-full bg-background shadow transition-all duration-200",
                    mode === "search" ? "left-6" : "left-0.5"
                  )}
                />
              </button>
              <span
                className={cn(
                  "text-xs",
                  mode === "search" ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                联网搜索
              </span>
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

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3">
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
                    {msg.role === "assistant" ? (
                      <div className="whitespace-pre-wrap">
                        {parseContentWithTimestamps(msg.content, onSeekTo)}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
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
