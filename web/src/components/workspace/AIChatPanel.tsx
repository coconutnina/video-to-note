"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  /**
   * fab：右下角悬浮气泡（导航模式）
   * dock：右侧固定栏（专注模式，宽度由外层容器控制，建议 360px）
   */
  variant?: "fab" | "dock";
  className?: string;
}

/** 与聊天时间戳解析一致：MM:SS（分钟 1–3 位）或 HH:MM:SS → 秒 */
export function parseTimestampToSeconds(time: string): number {
  const parts = time.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好！我已经读完这个视频，有什么想问的？",
};

function MarkdownMessage({ content, onSeekTo }: { content: string; onSeekTo?: (time: string) => void }) {
  const ts = "(?:\\d{1,2}:\\d{2}:\\d{2}|\\d{1,3}:\\d{2})";
  const tsCap = "(\\d{1,2}:\\d{2}:\\d{2}|\\d{1,3}:\\d{2})";
  const bracketGroup = `\\[${ts}(?:[,~]\\s*${ts})*\\]`;
  const reOrphanBeforePunct = new RegExp(
    `\n(${bracketGroup})\n\\s*([。，、.,])`,
    "g"
  );
  const reOrphanLine = new RegExp(`\n(${bracketGroup})`, "g");
  const reAdjacentTs = new RegExp(
    `\\[${tsCap}\\]((?:\\s*\\[${tsCap}\\])+)`,
    "g"
  );
  const reOneBracketedTs = new RegExp(`\\[${tsCap}\\]`, "g");
  const reCommaList = new RegExp(
    `\\[(${ts}(?:\\s*,\\s*${ts})*)\\]`,
    "g"
  );
  const reRange = new RegExp(
    `\\[(${ts})\\s*~\\s*(${ts})\\]`,
    "g"
  );

  // 第一步：把孤立的时间戳行合并到上一行
  const cleaned = content
    .replace(reOrphanBeforePunct, "$2 $1")
    .replace(reOrphanLine, " $1");

  const merged = cleaned.replace(reAdjacentTs, (_full, first, rest) => {
    const times = [
      first,
      ...Array.from(rest.matchAll(reOneBracketedTs), (m: RegExpMatchArray) => m[1]),
    ];
    return `[${times[0]} ~ ${times[times.length - 1]}]`;
  });

  // 第二步：把所有时间戳格式转换为 Markdown 行内代码 `%%TS:…%%`
  // 这样 ReactMarkdown 会把它保持在行内，不会另起段落
  const processed = merged
    .replace(reCommaList, (_full, list: string) =>
      list.split(/\s*,\s*/).map((t) => `\`%%TS:${t.trim()}%%\``).join(" ")
    )
    .replace(reRange, (_full, s: string, e: string) => `\`%%TS:${s}~${e}%%\``);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 text-[13px] leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="mt-3 mb-1 text-[13px] font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="mt-3 mb-1 text-[13px] font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-2 mb-0.5 text-[13px] font-semibold">{children}</h3>,
        ul: ({ children }) => <ul className="mb-1.5 list-disc pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 list-decimal pl-4">{children}</ol>,
        li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        a: ({ href, children }) => (
          <sup>
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="whitespace-nowrap text-[11px] text-[#A8882A] opacity-80 underline underline-offset-2 hover:opacity-100">
              ↗{String(children).slice(0, 20)}{String(children).length > 20 ? '…' : ''}
            </a>
          </sup>
        ),
        code: ({ children }) => {
          const raw = String(children);
          const match = raw.match(
            /^%%TS:(\d{1,2}:\d{2}:\d{2}|\d{1,3}:\d{2})(?:~(\d{1,2}:\d{2}:\d{2}|\d{1,3}:\d{2}))?%%$/
          );
          if (match) {
            const start = match[1];
            const end = match[2];
            const label = end ? `[${start} ~ ${end}]` : `[${start}]`;
            return onSeekTo ? (
              <button type="button" onClick={() => onSeekTo(start)}
                className="mx-0.5 inline-block cursor-pointer rounded-[3px] border border-[rgba(168,136,42,0.22)] bg-[rgba(168,136,42,0.07)] px-[5px] py-[1px] font-mono text-[10.5px] text-[#A8882A]">
                {label}
              </button>
            ) : (
              <span className="mx-0.5 inline-block rounded-[3px] border border-[rgba(168,136,42,0.22)] bg-[rgba(168,136,42,0.07)] px-[5px] py-[1px] font-mono text-[10.5px] text-[#A8882A]">
                {label}
              </span>
            );
          }
          return <code>{children}</code>;
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

export function AIChatPanel({
  transcript = [],
  onSeekTo,
  variant = "fab",
  className,
}: AIChatPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AIChatMode>("video");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [typing, setTyping] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const isDock = variant === "dock";
  const panelOpen = isDock || open;

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

  const panelInner = (
    <>
      <header className="flex h-[42px] shrink-0 items-center justify-between gap-2 border-b border-[#E4E4E4] px-[14px]">
        <h3 className="text-[15px] font-medium text-[#111111]" style={{ fontFamily: '"EB Garamond", serif' }}>
          AI 助手
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[5px] border border-[#E4E4E4]">
            <button
              type="button"
              onClick={() => setMode("video")}
              className={cn(
                "border-r border-[#E4E4E4] px-[10px] py-[3px] text-[11.5px] transition-colors",
                mode === "video"
                  ? "bg-[#111111] text-white"
                  : "bg-transparent text-[#777777] hover:text-[#111111]"
              )}
            >
              仅视频
            </button>
            <button
              type="button"
              onClick={() => setMode("search")}
              className={cn(
                "px-[10px] py-[3px] text-[11.5px] transition-colors",
                mode === "search"
                  ? "bg-[#111111] text-white"
                  : "bg-transparent text-[#777777] hover:text-[#111111]"
              )}
            >
              联网搜索
            </button>
          </div>
          {!isDock && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="关闭"
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-[14px]">
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
                  "max-w-[86%] px-[13px] py-[9px] text-[13px] leading-[1.6]",
                  msg.role === "user"
                    ? "rounded-[10px_3px_10px_10px] bg-[#111111] text-white"
                    : "rounded-[3px_10px_10px_10px] bg-[#F0F0F0] text-[#111111]"
                )}
                style={{ fontFamily: '"DM Sans", sans-serif' }}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <MarkdownMessage content={msg.content} onSeekTo={onSeekTo} />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </li>
          ))}
          {typing && (
            <li className="flex justify-start">
              <div className="rounded-[3px_10px_10px_10px] bg-[#F0F0F0] px-[13px] py-[9px] text-[13px] text-[#111111]">
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

      <footer className="flex shrink-0 items-end gap-[7px] border-t border-[#E4E4E4] p-[9px_11px]">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="问问视频里的内容..."
          className="min-w-0 flex-1 rounded-[8px] border-[#E4E4E4] text-[13px] focus-visible:border-[#A8882A] focus-visible:ring-0"
          disabled={typing}
        />
        <Button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || typing}
          size="icon"
          className="h-[34px] w-[34px] rounded-[7px] bg-[#111111] p-0 text-white hover:bg-[#333333]"
        >
          <svg viewBox="0 0 13 13" fill="none" className="size-[13px]" aria-hidden>
            <path
              d="M11 6.5H2M7 2l4 4.5L7 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </footer>
    </>
  );

  if (isDock) {
    return (
      <section
        className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#FBFBFB]", className)}
        aria-label="AI 助手问答面板"
      >
        {panelInner}
      </section>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[22px] right-[22px] z-[9998] flex h-[44px] w-[44px] items-center justify-center rounded-[12px] bg-[#111111] text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-all hover:bg-[#A8882A] hover:shadow-[0_6px_20px_rgba(168,136,42,0.35)]"
        aria-label={open ? "收起 AI 助手" : "打开 AI 助手"}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M10 2.5L11.2 7.8L16.5 9L11.2 10.2L10 15.5L8.8 10.2L3.5 9L8.8 7.8L10 2.5Z"
            fill="white"
          />
          <path
            d="M15.5 13L16.2 15.3L18.5 16L16.2 16.7L15.5 19L14.8 16.7L12.5 16L14.8 15.3L15.5 13Z"
            fill="white"
            opacity="0.7"
          />
          <path
            d="M4.5 3L5 4.8L6.8 5.3L5 5.8L4.5 7.5L4 5.8L2.2 5.3L4 4.8L4.5 3Z"
            fill="white"
            opacity="0.5"
          />
        </svg>
      </button>

      {panelOpen && (
        <section
          className={cn(
            "fixed bottom-[78px] right-[22px] z-[9999] flex h-[450px] w-[360px] flex-col overflow-hidden rounded-[14px] border border-[#E4E4E4] bg-[#FBFBFB] shadow-[0_8px_40px_rgba(0,0,0,0.13)]",
            className
          )}
          aria-label="AI 助手问答面板"
        >
          {panelInner}
        </section>
      )}
    </>
  );
}
