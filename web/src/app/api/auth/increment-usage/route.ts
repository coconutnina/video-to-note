import { NextRequest, NextResponse } from "next/server";

import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const MINDMAP_VERSION = "v2";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { videoId?: string }
      | null;
    const videoId = body?.videoId?.trim();
    if (!videoId) {
      return NextResponse.json({ ok: true });
    }

    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: true });
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
      return NextResponse.json({ ok: true });
    }

    const { data: row } = await admin
      .from("users")
      .select("monthly_used")
      .eq("id", user.id)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ ok: true });
    }

    const nextUsed = Number(row.monthly_used ?? 0) + 1;
    await admin.from("users").update({ monthly_used: nextUsed }).eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
