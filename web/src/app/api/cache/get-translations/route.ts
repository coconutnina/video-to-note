import { NextRequest, NextResponse } from "next/server";

import { getTranslationCache } from "@/lib/supabase-cache";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId")?.trim();
  if (!videoId) {
    return NextResponse.json({ translations: null });
  }

  const translations = await getTranslationCache(videoId);
  if (!translations) {
    return NextResponse.json({ translations: null });
  }

  return NextResponse.json({ translations });
}
