"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AvatarImage } from "@/components/avatars";

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
    return (
      value.includes("youtube.com/watch?v=") || value.includes("youtu.be/")
    );
  }
}

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
      <line
        x1="14"
        y1="10.5"
        x2="14"
        y2="5"
        stroke="#A8882A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="17"
        y1="11.5"
        x2="21.5"
        y2="7.5"
        stroke="#A8882A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="17.5"
        y1="14.5"
        x2="23"
        y2="14.5"
        stroke="#A8882A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="17"
        y1="17"
        x2="21.5"
        y2="21"
        stroke="#C8B870"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="17.5"
        x2="14"
        y2="23"
        stroke="#C8B870"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="11"
        y1="17"
        x2="6.5"
        y2="21"
        stroke="#C8B870"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="10.5"
        y1="14.5"
        x2="5"
        y2="14.5"
        stroke="#A8882A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="11"
        y1="11.5"
        x2="6.5"
        y2="7.5"
        stroke="#A8882A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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

const grainStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
} as const;

const featureCards = [
  {
    name: "交互式思维导图",
    desc: "点击节点跳转视频时间点",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]">
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    name: "实时双语字幕",
    desc: "原文译文同步高亮滚动",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]">
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    name: "AI 学习助手",
    desc: "基于视频内容深度问答",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]">
        <path
          d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
] as const;

export default function HomePage() {
  const router = useRouter();
  const { user, openAuthModal, signOut } = useAuth();
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

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

  const displayName = user?.nickname ?? "用户";

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#FBFBFB] text-[#111111]">
      <nav className="relative z-[2] flex h-16 shrink-0 items-center justify-between border-b border-[#E8E8E8] px-[72px]">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-serif text-[17px] font-medium tracking-[-0.01em] text-[#111111]">
            video-to-note
          </span>
        </div>

        <div className="flex items-center gap-9">
          <span className="cursor-default text-[13px] font-normal text-[#555555] transition-colors">
            功能介绍
          </span>
          <span className="cursor-default text-[13px] font-normal text-[#555555] transition-colors">
            建议反馈
          </span>
          <div className="h-4 w-px bg-[#E8E8E8]" />
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-[6px] border border-[#E8E8E8] bg-white px-3 py-1.5 text-[13px] text-[#111111] transition-colors hover:border-[#D9D9D9]"
              >
                <AvatarImage avatarId={user.avatar ?? 1} size={24} />
                <span>{displayName}</span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] w-[132px] rounded-[8px] border border-[#E8E8E8] bg-white p-1 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                  <button
                    type="button"
                    className="w-full rounded-[6px] px-3 py-2 text-left text-[13px] text-[#111111] transition-colors hover:bg-[#F5F5F5]"
                    onClick={async () => {
                      await signOut();
                      setMenuOpen(false);
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={openAuthModal}
              className="cursor-pointer rounded-[5px] bg-[#111111] px-[22px] py-[9px] text-[13px] font-normal tracking-[0.02em] text-[#FBFBFB] transition-opacity hover:opacity-[0.86]"
            >
              开始使用 →
            </button>
          )}
        </div>
      </nav>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.018]"
          style={grainStyle}
          aria-hidden
        />

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center px-[72px] pb-16 pt-0">
          <div className="hp-anim-eyebrow mb-3 font-mono text-[10px] font-normal uppercase tracking-[0.22em] text-[#A8882A]">
            Your Learning Studio
          </div>

          <div className="hp-anim-title mb-[18px] flex items-center justify-center gap-5 text-center font-serif text-[76px] font-medium leading-none tracking-[-0.03em] text-[#111111]">
            <span>video</span>
            <span className="text-[68px] font-normal italic text-[#A8882A]">to</span>
            <span>note</span>
          </div>

          <p className="hp-anim-sub mb-[52px] max-w-[440px] text-center text-[14px] font-light leading-[1.85] text-[#555555]">
            粘贴任意 YouTube 链接，AI 自动提炼视频核心脉络
            <br />
            生成交互式思维导图与双语字幕——
            <br />
            让每次观看，都在大脑里留下<strong className="font-normal text-[#111111]">真正的印记</strong>。
          </p>

          <div className="flex w-full max-w-[660px] flex-col items-stretch">
            <form onSubmit={handleSubmit} className="w-full">
              <div className="hp-anim-input flex w-full items-center overflow-hidden rounded-[6px] border border-[#E8E8E8] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[rgba(168,136,42,0.5)] focus-within:shadow-[0_0_0_3px_rgba(168,136,42,0.1)]">
                <div className="flex shrink-0 items-center py-0 pl-[18px] pr-3">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#BBBBBB"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <input
                  name="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="粘贴 YouTube 链接…"
                  inputMode="url"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 bg-transparent py-[14px] pr-0 text-[14px] font-light text-[#111111] outline-none placeholder:text-[#999999]"
                />
                <div className="mr-[5px] h-5 w-px shrink-0 bg-[#E8E8E8]" />
                <button
                  type="submit"
                  className="m-1 shrink-0 cursor-pointer whitespace-nowrap rounded-[4px] bg-[#A8882A] px-6 py-2.5 text-[13px] font-normal tracking-[0.04em] text-white transition-opacity hover:opacity-[0.85]"
                >
                  开始解析
                </button>
              </div>
              {error ? (
                <p className="mt-2 text-center text-[13px] text-red-600">{error}</p>
              ) : null}
            </form>

            <div className="h-4 w-full shrink-0" aria-hidden />

            <div className="hp-anim-features flex gap-3">
              {featureCards.map((card) => (
                <div
                  key={card.name}
                  className="group relative flex flex-1 cursor-default items-center gap-3 overflow-hidden rounded-lg border border-[rgba(168,136,42,0.28)] bg-[rgba(168,136,42,0.12)] px-[18px] py-[13px] transition-[border-color,transform,box-shadow,background-color] duration-200 hover:border-[#A8882A] hover:bg-[rgba(168,136,42,0.2)] hover:shadow-[0_6px_20px_rgba(168,136,42,0.12)] hover:-translate-y-0.5"
                >
                  <div className="pointer-events-none absolute right-[11px] top-[11px] h-[5px] w-[5px] rounded-full bg-[#A8882A] opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100" />
                  <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-[rgba(168,136,42,0.15)] text-[#A8882A] transition-colors group-hover:bg-[rgba(168,136,42,0.25)]">
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="mb-0.5 text-[12.5px] font-medium tracking-[0.01em] text-[#111111]">
                      {card.name}
                    </div>
                    <div className="whitespace-nowrap text-[11px] font-light text-[#555555]">
                      {card.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] flex h-[46px] items-center justify-center border-t border-[#E8E8E8] bg-[rgba(245,244,242,0.96)] px-[72px] backdrop-blur-[8px]">
        <div className="pointer-events-auto text-center font-serif text-[14px] italic leading-none tracking-[0.01em] text-[#888888]">
          <span className="text-[18px] text-[#A8882A] [vertical-align:-2px]">
            &quot;
          </span>
          If you can&apos;t explain it simply, you don&apos;t understand it well enough.
          <span className="text-[18px] text-[#A8882A] [vertical-align:-2px]">
            &quot;
          </span>
          <span className="ml-2.5 align-baseline font-mono text-[11px] not-italic tracking-[0.06em] text-[rgba(168,136,42,0.7)]">
            — Albert Einstein
          </span>
        </div>
        <a
          href="https://github.com/coconutnina/video-to-note"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute right-[72px] flex items-center text-[#999999] transition-colors hover:text-[#111111]"
          title="View on GitHub"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
              fill="currentColor"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
