export interface VideoInfo {
  title: string;
  channelTitle: string;
  thumbnail: string;
  durationSeconds: number;
}

const ERROR_MESSAGE = "视频不存在或无法访问";

export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(ERROR_MESSAGE);
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId.trim())}&key=${apiKey}`;
  const parseIsoDurationToSeconds = (iso: string | undefined): number => {
    if (!iso) return 0;
    const m = iso.match(
      /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
    );
    if (!m) return 0;
    const days = Number(m[1] ?? 0);
    const hours = Number(m[2] ?? 0);
    const minutes = Number(m[3] ?? 0);
    const seconds = Number(m[4] ?? 0);
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  };

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(ERROR_MESSAGE);
  }

  const items = data?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(ERROR_MESSAGE);
  }
  const contentDetails = items[0]?.contentDetails;

  const snippet = items[0]?.snippet;
  if (!snippet) {
    throw new Error(ERROR_MESSAGE);
  }

  const title = typeof snippet.title === "string" ? snippet.title : "";
  const channelTitle = typeof snippet.channelTitle === "string" ? snippet.channelTitle : "";
  const thumbnail =
    snippet.thumbnails?.high?.url ??
    snippet.thumbnails?.medium?.url ??
    snippet.thumbnails?.default?.url ??
    "";

  return {
    title,
    channelTitle,
    thumbnail,
    durationSeconds: parseIsoDurationToSeconds(
      typeof contentDetails?.duration === "string"
        ? contentDetails.duration
        : undefined
    ),
  };
}

export const getVideoInfo = fetchVideoInfo;
