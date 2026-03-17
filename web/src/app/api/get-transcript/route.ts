import { NextRequest, NextResponse } from "next/server";
import { transcriptCache } from "@/lib/api-cache";

const SUPADATA_URL = "https://api.supadata.ai/v1/youtube/transcript";
const ERROR_MESSAGE = "无法获取字幕";
const TIMEOUT_MS = 15000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (error) {
      clearTimeout(timeout);
      if (i === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  // 理论上不会到这里
  throw new Error(ERROR_MESSAGE);
}

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

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId")?.trim();
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

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: ERROR_MESSAGE }, { status: 500 });
  }

  try {
    const res = await fetchWithRetry(
      `${SUPADATA_URL}?videoId=${encodeURIComponent(videoId.trim())}&lang=en`,
      {
        headers: { "x-api-key": apiKey },
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json({ error: ERROR_MESSAGE }, { status: 400 });
    }

    const content = data?.content;
    if (!Array.isArray(content)) {
      // content 不是数组，可能是网络问题或格式异常，抛出错误让重试逻辑处理
      throw new Error(
        `Supadata 返回格式异常: ${JSON.stringify(data).substring(0, 100)}`
      );
    }
    if (content.length === 0) {
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
    console.error("Supadata error:", err);
    const message = err instanceof Error ? err.message : ERROR_MESSAGE;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
