import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { transcriptCache } from "@/lib/api-cache";

const ERROR_MESSAGE = "无法获取字幕";

function mergeTranscriptIntoSentences(
  transcript: { text: string; start: number; duration: number }[]
) {
  const merged: { text: string; start: number; duration: number }[] = [];
  let current: { text: string; start: number; duration: number } | null = null;

  for (const item of transcript) {
    if (!current) {
      current = { ...item };
      continue;
    }

    const trimmed = current.text.trim();
    const lastChar = trimmed.slice(-1);
    const isSentenceEnd = [".", "?", "!", ",", ";"].includes(lastChar);
    const isTooShort = trimmed.length < 80;

    if (!isSentenceEnd && isTooShort) {
      current.text = `${trimmed} ${item.text.trim()}`;
      current.duration = item.start - current.start + item.duration;
    } else {
      merged.push(current);
      current = { ...item };
    }
  }

  if (current) merged.push(current);
  return merged;
}

async function handleGetTranscript(videoIdRaw: string | undefined) {
  const videoId = videoIdRaw?.trim();
  if (!videoId) {
    return NextResponse.json({ error: ERROR_MESSAGE }, { status: 400 });
  }

  if (transcriptCache.has(videoId)) {
    const cached = transcriptCache.get(videoId);
    if (cached?.transcript && cached.transcript.length > 0) {
      return NextResponse.json(cached);
    }
    transcriptCache.delete(videoId);
  }

  try {
    const content = await YoutubeTranscript.fetchTranscript(videoId);
    if (!Array.isArray(content) || content.length === 0) {
      // 明确返回空数组，才是真的没有字幕
      return NextResponse.json({ error: "no_subtitle" }, { status: 200 });
    }

    const transcript = content.map(
      (item: { text?: string; offset?: number; duration?: number }) => ({
        text: typeof item.text === "string" ? item.text : "",
        start: typeof item.offset === "number" ? item.offset / 1000 : 0,
        duration: typeof item.duration === "number" ? item.duration / 1000 : 0,
      })
    );

    const mergedTranscript = mergeTranscriptIntoSentences(
      transcript as { text: string; start: number; duration: number }[]
    );

    const result = { transcript: mergedTranscript };
    if (result.transcript && result.transcript.length > 0) {
      transcriptCache.set(videoId, result);
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "timeout" }, { status: 408 });
    }
    console.error("youtube-transcript error:", err);
    const message = err instanceof Error ? err.message : ERROR_MESSAGE;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleGetTranscript(request.nextUrl.searchParams.get("videoId") ?? undefined);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { videoId?: string }
    | null;
  return handleGetTranscript(body?.videoId);
}
