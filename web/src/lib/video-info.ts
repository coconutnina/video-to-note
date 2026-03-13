export interface VideoInfo {
  title: string;
  channelTitle: string;
  thumbnail: string;
}

const ERROR_MESSAGE = "视频不存在或无法访问";

export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(ERROR_MESSAGE);
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId.trim())}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(ERROR_MESSAGE);
  }

  const items = data?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(ERROR_MESSAGE);
  }

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

  return { title, channelTitle, thumbnail };
}
