import { NextRequest, NextResponse } from "next/server";
import { transcriptCache } from "@/lib/api-cache";

const ERROR_MESSAGE = "无法获取字幕";
const ANDROID_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
} as const;

type TranscriptItem = { text: string; start: number; duration: number };

function extractInnertubeApiKey(html: string) {
  const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  return match?.[1] ?? null;
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      (_, hex: string) => String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseTranscriptXml(xml: string): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const textTagRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = textTagRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const rawText = match[2] ?? "";
    const startMatch = attrs.match(/\bstart="([^"]+)"/);
    const durationMatch = attrs.match(/\bdur="([^"]+)"/);
    const start = Number(startMatch?.[1] ?? 0);
    const duration = Number(durationMatch?.[1] ?? 0);

    items.push({
      text: decodeHtmlEntities(rawText).trim(),
      start: Number.isFinite(start) ? start : 0,
      duration: Number.isFinite(duration) ? duration : 0,
    });
  }

  return items;
}

async function fetchTranscriptFromInnertube(videoId: string): Promise<TranscriptItem[]> {
  const watchResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  if (!watchResponse.ok) {
    throw new Error(`watch_page_error_${watchResponse.status}`);
  }
  const watchHtml = await watchResponse.text();
  const apiKey = extractInnertubeApiKey(watchHtml);
  if (!apiKey) {
    throw new Error("innertube_api_key_not_found");
  }

  const playerResponse = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        context: { client: ANDROID_CLIENT },
      }),
    }
  );
  if (!playerResponse.ok) {
    throw new Error(`player_api_error_${playerResponse.status}`);
  }
  const playerData = (await playerResponse.json()) as {
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: Array<{
          languageCode?: string;
          kind?: string;
          baseUrl?: string;
        }>;
      };
    };
  };

  const captionTracks =
    playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (captionTracks.length === 0) {
    console.log("youtube captions empty:", playerData.captions);
  }

  const trackByPriority =
    captionTracks.find((track) => track.languageCode === "en") ??
    captionTracks.find((track) =>
      (track.languageCode ?? "").toLowerCase().startsWith("en")
    ) ??
    captionTracks.find((track) => track.kind === "asr") ??
    captionTracks[0];

  if (!trackByPriority?.baseUrl) {
    return [];
  }

  const transcriptResponse = await fetch(trackByPriority.baseUrl);
  if (!transcriptResponse.ok) {
    throw new Error(`transcript_xml_error_${transcriptResponse.status}`);
  }
  const transcriptXml = await transcriptResponse.text();

  return parseTranscriptXml(transcriptXml);
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
    const content = await fetchTranscriptFromInnertube(videoId);

    if (!Array.isArray(content) || content.length === 0) {
      // 明确返回空数组，才是真的没有字幕
      return NextResponse.json({ error: "no_subtitle" }, { status: 200 });
    }

    const transcript = content.map((item: TranscriptItem) => ({
      text: typeof item.text === "string" ? item.text : "",
      start: typeof item.start === "number" ? item.start : 0,
      duration: typeof item.duration === "number" ? item.duration : 0,
    }));

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
