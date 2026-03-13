const TRANSCRIPT_TIMEOUT_MS = 45000;
let isFetchingTranscript = false;

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptResponse {
  transcript?: TranscriptSegment[];
  error?: string;
}

/** 将秒数格式化为 [MM:SS] */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResponse> {
  if (isFetchingTranscript) {
    return {};
  }

  isFetchingTranscript = true;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSCRIPT_TIMEOUT_MS);

  try {
    const res = await fetch(
      `/api/get-transcript?videoId=${encodeURIComponent(videoId)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const data: TranscriptResponse & { error?: string } = await res.json();

    if (data.error) {
      const msg =
        data.error === "timeout" || res.status === 408
          ? "字幕获取超时，请刷新重试"
          : data.error;
      return { error: msg };
    }
    if (!res.ok) {
      return { error: "暂无字幕内容" };
    }
    return { transcript: data.transcript ?? [] };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      return { error: "字幕获取超时，请刷新重试" };
    }
    return { error: "暂无字幕内容" };
  } finally {
    isFetchingTranscript = false;
  }
}
