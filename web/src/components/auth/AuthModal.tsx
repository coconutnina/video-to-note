"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { AvatarImage } from "@/components/avatars";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  onAuthSuccess: (profile?: { nickname?: string; avatar_id?: number }) => Promise<void> | void;
  /** When the modal opens, show this tab first (default: login). */
  initialTab?: "login" | "register";
};

const AVATAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const GENDER_OPTIONS = [
  { id: "male", label: "男" },
  { id: "female", label: "女" },
  { id: "other", label: "其他" },
] as const;

type RegisterState = {
  email: string;
  password: string;
  nickname: string;
  gender: (typeof GENDER_OPTIONS)[number]["id"];
  avatar: number;
  inviteCode: string;
};

export default function AuthModal({
  open,
  onClose,
  onAuthSuccess,
  initialTab = "login",
}: AuthModalProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const [tab, setTab] = React.useState<"login" | "register">(initialTab);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [loginPwdVisible, setLoginPwdVisible] = React.useState(false);

  const [registerPwdVisible, setRegisterPwdVisible] = React.useState(false);
  const [register, setRegister] = React.useState<RegisterState>({
    email: "",
    password: "",
    nickname: "",
    gender: "other",
    avatar: 1,
    inviteCode: "",
  });

  React.useEffect(() => {
    if (!open) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open, tab]);

  React.useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (signInError) throw signInError;
      await onAuthSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = register.email.trim();
    const inviteCode = register.inviteCode.trim();
    const nickname = register.nickname.trim();
    if (!email) return setError("请输入邮箱");
    if (register.password.length < 8) return setError("密码至少 8 位");
    if (!nickname) return setError("请输入昵称");
    if (!inviteCode) return setError("请输入邀请码");

    setLoading(true);
    try {
      const inviteValidateRes = await fetch(
        `/api/auth/register?validateCode=${encodeURIComponent(inviteCode)}`
      );
      const inviteValidateJson = (await inviteValidateRes.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!inviteValidateRes.ok) {
        throw new Error(inviteValidateJson?.error ?? "邀请码无效或已失效");
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: register.password,
        options: {
          data: {
            nickname,
            gender: register.gender,
            avatar_id: register.avatar,
          },
        },
      });
      if (signUpError) throw signUpError;
      const signedUser = signUpData.user;
      if (!signedUser) throw new Error("注册失败，请重试");

      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: signedUser.id,
          email,
          nickname,
          gender: register.gender,
          avatar_id: register.avatar,
          invite_code: inviteCode,
        }),
      });
      const registerJson = (await registerRes.json().catch(() => null)) as
        | { error?: string; profile?: { nickname?: string; avatar_id?: number } }
        | null;
      if (!registerRes.ok) {
        throw new Error(registerJson?.error ?? "注册资料保存失败");
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: register.password,
      });
      if (loginError) throw loginError;

      await onAuthSuccess(registerJson?.profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  const inputClassName =
    "w-full rounded-[6px] border border-[#E8E8E8] bg-white px-3 py-2.5 text-[14px] text-[#111111] outline-none transition-[border-color,box-shadow] focus:border-[rgba(168,136,42,0.55)] focus:shadow-[0_0_0_3px_rgba(168,136,42,0.12)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(17,17,17,0.45)] backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="关闭登录弹窗"
      />
      <div className="relative z-10 w-full max-w-[560px] rounded-xl border border-[#E8E8E8] bg-[#FBFBFB] p-6 shadow-[0_14px_40px_rgba(0,0,0,0.14)]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-[28px] text-[#111111]">欢迎使用</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#777777] transition-colors hover:text-[#111111]"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex rounded-lg border border-[#E8E8E8] bg-white p-1 text-[13px]">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 rounded-md px-3 py-2 transition-colors ${
              tab === "login" ? "bg-[#111111] text-white" : "text-[#666666]"
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`flex-1 rounded-md px-3 py-2 transition-colors ${
              tab === "register" ? "bg-[#A8882A] text-white" : "text-[#666666]"
            }`}
          >
            注册
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              className={inputClassName}
              placeholder="邮箱"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              autoComplete="email"
            />
            <div className="relative">
              <input
                className={`${inputClassName} pr-12`}
                placeholder="密码"
                type={loginPwdVisible ? "text" : "password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setLoginPwdVisible((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#777777]"
              >
                {loginPwdVisible ? "隐藏" : "显示"}
              </button>
            </div>
            <button
              disabled={loading}
              className="w-full rounded-[6px] bg-[#A8882A] py-2.5 text-[14px] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "登录中..." : "登录"}
            </button>
            <p className="text-center text-[13px] text-[#666666]">
              还没有账号？
              <button
                type="button"
                onClick={() => setTab("register")}
                className="ml-1 text-[#A8882A] hover:underline"
              >
                立即注册
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <input
              className={inputClassName}
              placeholder="邮箱"
              type="email"
              value={register.email}
              onChange={(e) =>
                setRegister((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
              autoComplete="email"
            />

            <div className="relative">
              <input
                className={`${inputClassName} pr-12`}
                placeholder="密码（至少8位）"
                type={registerPwdVisible ? "text" : "password"}
                value={register.password}
                onChange={(e) =>
                  setRegister((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setRegisterPwdVisible((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#777777]"
              >
                {registerPwdVisible ? "隐藏" : "显示"}
              </button>
            </div>

            <input
              className={inputClassName}
              placeholder="昵称"
              value={register.nickname}
              onChange={(e) =>
                setRegister((prev) => ({
                  ...prev,
                  nickname: e.target.value,
                }))
              }
            />

            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((gender) => (
                <button
                  key={gender.id}
                  type="button"
                  onClick={() =>
                    setRegister((prev) => ({
                      ...prev,
                      gender: gender.id,
                    }))
                  }
                  className={`rounded-[8px] border px-3 py-2 text-[13px] transition-colors ${
                    register.gender === gender.id
                      ? "border-[#A8882A] bg-[rgba(168,136,42,0.14)] text-[#111111]"
                      : "border-[#E8E8E8] bg-white text-[#666666]"
                  }`}
                >
                  {gender.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  onClick={() =>
                    setRegister((prev) => ({
                      ...prev,
                      avatar,
                    }))
                  }
                  className={`flex items-center justify-center rounded-[8px] border px-2 py-2 transition-colors ${
                    register.avatar === avatar
                      ? "border-[#A8882A] bg-[rgba(168,136,42,0.14)]"
                      : "border-[#E8E8E8] bg-white"
                  }`}
                >
                  <AvatarImage avatarId={avatar} size={36} />
                </button>
              ))}
            </div>

            <input
              className={inputClassName}
              placeholder="邀请码（必填）"
              value={register.inviteCode}
              onChange={(e) =>
                setRegister((prev) => ({
                  ...prev,
                  inviteCode: e.target.value,
                }))
              }
            />

            <button
              disabled={loading}
              className="w-full rounded-[6px] bg-[#111111] py-2.5 text-[14px] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "提交中..." : "完成注册"}
            </button>
          </form>
        )}

        {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
