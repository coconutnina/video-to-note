import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

type RegisterBody = {
  userId?: string;
  email?: string;
  nickname?: string;
  gender?: string;
  avatar_id?: number;
  invite_code?: string;
};

export async function GET(request: NextRequest) {
  try {
    const inviteCode = request.nextUrl.searchParams.get("validateCode")?.trim();
    if (!inviteCode) {
      return NextResponse.json({ error: "missing_invite_code" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: inviteData, error: inviteError } = await supabase
      .from("invite_codes")
      .select("default_quota, channel")
      .eq("code", inviteCode)
      .eq("is_active", true)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
    if (!inviteData) {
      return NextResponse.json({ valid: false, error: "邀请码无效或已失效" }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RegisterBody | null;
    if (!body) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const userId = body.userId?.trim();
    const email = body.email?.trim();
    const nickname = body.nickname?.trim();
    const gender = body.gender?.trim();
    const avatarId = typeof body.avatar_id === "number" ? body.avatar_id : null;
    const inviteCode = body.invite_code?.trim();

    if (!userId || !email || !nickname || !gender || !avatarId || !inviteCode) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: inviteData, error: inviteError } = await supabase
      .from("invite_codes")
      .select("default_quota, channel")
      .eq("code", inviteCode)
      .eq("is_active", true)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
    if (!inviteData) {
      return NextResponse.json({ error: "邀请码无效或已失效" }, { status: 400 });
    }

    const { error: upsertError } = await supabase.from("users").upsert(
      {
        id: userId,
        email,
        nickname,
        gender,
        avatar_id: avatarId,
        invite_code: inviteCode,
        channel: inviteData.channel ?? "invite",
        monthly_quota: inviteData.default_quota ?? 0,
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      profile: { nickname, avatar_id: avatarId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "register_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
