"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import AuthModal from "@/components/auth/AuthModal";

type CurrentUser = {
  id: string;
  email: string | null;
  nickname: string | null;
  avatar: number | null;
};

type AuthContextValue = {
  user: CurrentUser | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = React.useState(false);

  const refreshUser = React.useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const authUser = data.user;
    if (!authUser) {
      setUser(null);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("nickname, avatar_id")
      .eq("id", authUser.id)
      .maybeSingle();

    const parsedAvatar =
      typeof profile?.avatar_id === "number"
        ? profile.avatar_id
        : Number(profile?.avatar_id ?? 1);

    setUser({
      id: authUser.id,
      email: authUser.email ?? null,
      nickname: (profile?.nickname as string | null | undefined) ?? null,
      avatar: Number.isFinite(parsedAvatar) ? parsedAvatar : 1,
    });
  }, [supabase]);

  React.useEffect(() => {
    refreshUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshUser();
    });
    return () => subscription.unsubscribe();
  }, [refreshUser, supabase]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      openAuthModal: () => setAuthModalOpen(true),
      closeAuthModal: () => setAuthModalOpen(false),
      refreshUser,
      signOut: async () => {
        await supabase.auth.signOut();
        setUser(null);
      },
    }),
    [refreshUser, supabase, user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={async (profile) => {
          const { data } = await supabase.auth.getUser();
          const authUser = data.user;
          if (!authUser) {
            setUser(null);
            return;
          }

          if (profile?.nickname || profile?.avatar_id) {
            setUser({
              id: authUser.id,
              email: authUser.email ?? null,
              nickname: profile.nickname ?? null,
              avatar: profile.avatar_id ?? 1,
            });
            return;
          }

          await refreshUser();
        }}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
