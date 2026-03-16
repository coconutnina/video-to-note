/**
 * 从 URL 参数或完整 YouTube 链接中解析出视频 ID。
 * 后续可替换为服务端/API 返回的 ID。
 */
const MOCK_VIDEO_ID = "dQw4w9WgXcQ";

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function getYouTubeVideoId(urlOrId: string): string {
  const raw = (urlOrId ?? "").trim();
  if (!raw) return MOCK_VIDEO_ID;
  // 裸视频 ID（11 位）直接返回，保证与 API 缓存 key 一致
  if (VIDEO_ID_PATTERN.test(raw)) return raw;

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      return id || MOCK_VIDEO_ID;
    }
    if (host.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      return v || MOCK_VIDEO_ID;
    }
  } catch {
    if (VIDEO_ID_PATTERN.test(raw)) return raw;
  }
  return MOCK_VIDEO_ID;
}
