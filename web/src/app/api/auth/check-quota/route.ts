import { NextRequest, NextResponse } from "next/server";

import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const MINDMAP_VERSION = "v2";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const videoId = request.nextUrl.searchParams.get("videoId")?.trim();
    if (!videoId) {
      return NextResponse.json({ error: "missing_video_id" }, { status: 400 });
    }

    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { allowed: false, reason: "unauthorized" },
        { status: 401 }
      );
    }

    const admin = createServiceRoleClient();

    const { data: cachedMindmap } = await admin
      .from("video_mindmaps")
      .select("id")
      .eq("video_id", videoId)
      .is("user_id", null)
      .eq("mindmap_version", MINDMAP_VERSION)
      .limit(1)
      .maybeSingle();

    if (cachedMindmap) {
      return NextResponse.json({ allowed: true, isCached: true });
    }

    const { data: row, error: userErr } = await admin
      .from("users")
      .select("monthly_quota, monthly_used, monthly_reset_at")
      .eq("id", user.id)
      .maybeSingle();

    if (userErr) {
      console.warn("check-quota users read failed", userErr);
      return NextResponse.json({ allowed: true, isCached: false });
    }

    if (!row) {
      return NextResponse.json({ allowed: true, isCached: false });
    }

    const now = new Date();
    let monthlyUsed = Number(row.monthly_used ?? 0);
    const monthlyQuota = Number(row.monthly_quota ?? 0);
    const resetRaw = row.monthly_reset_at as string | null | undefined;

    if (resetRaw) {
      const resetAt = new Date(resetRaw);
      const periodEnd = new Date(resetAt.getTime() + THIRTY_DAYS_MS);
      if (now.getTime() > periodEnd.getTime()) {
        await admin
          .from("users")
          .update({
            monthly_used: 0,
            monthly_reset_at: now.toISOString(),
          })
          .eq("id", user.id);
        monthlyUsed = 0;
      }
    } else {
      await admin
        .from("users")
        .update({
          monthly_used: 0,
          monthly_reset_at: now.toISOString(),
        })
        .eq("id", user.id);
      monthlyUsed = 0;
    }

    if (monthlyUsed >= monthlyQuota) {
      return NextResponse.json({ allowed: false, reason: "quota_exceeded" });
    }

    return NextResponse.json({ allowed: true, isCached: false });
  } catch (e) {
    console.warn("check-quota failed", e);
    return NextResponse.json({ allowed: true, isCached: false });
  }
}
