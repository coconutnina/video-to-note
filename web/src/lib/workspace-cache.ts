import type { FlowEdge, FlowNode } from "@/lib/mindmap";

/** 版本升级：清空 workspace:* 并移除旧版 flush 标记（仅执行一次） */
const WORKSPACE_STORAGE_FLUSH_KEY = "video-to-note:workspace-storage-flush-v5";

function flushLegacyWorkspaceStorageOnce(): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(WORKSPACE_STORAGE_FLUSH_KEY)) return;
    localStorage.removeItem("video-to-note:workspace-storage-flush-v4");
    Object.keys(localStorage)
      .filter((k) => k.startsWith("workspace:"))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(WORKSPACE_STORAGE_FLUSH_KEY, "1");
  } catch {
    /* ignore */
  }
}

flushLegacyWorkspaceStorageOnce();

const CACHE_VERSION = "v5";

function cacheKey(videoId: string, type: "translations" | "mindmap") {
  return `workspace:${CACHE_VERSION}:${type}:${videoId}`;
}

/** 校验合并后字幕行 0..lineCount-1 是否都有条目（允许空字符串） */
export function isTranslationsComplete(
  translations: Record<number, string>,
  lineCount: number
): boolean {
  if (lineCount <= 0) return false;
  for (let i = 0; i < lineCount; i++) {
    if (translations[i] === undefined) return false;
  }
  return true;
}

export function getCachedTranslations(
  videoId: string
): Record<number, string> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(cacheKey(videoId, "translations"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const idx = Number(k);
      if (!Number.isFinite(idx) || typeof v !== "string") continue;
      out[idx] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function setCachedTranslations(
  videoId: string,
  data: Record<number, string>
): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      cacheKey(videoId, "translations"),
      JSON.stringify(data)
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function getCachedMindmap(
  videoId: string
): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(cacheKey(videoId, "mindmap"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      nodes?: FlowNode[];
      edges?: FlowEdge[];
    };
    if (
      !parsed?.nodes ||
      !parsed?.edges ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      parsed.nodes.length === 0
    ) {
      return null;
    }
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return null;
  }
}

export function setCachedMindmap(
  videoId: string,
  data: { nodes: FlowNode[]; edges: FlowEdge[] }
): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      cacheKey(videoId, "mindmap"),
      JSON.stringify(data)
    );
  } catch {
    /* ignore */
  }
}

export function clearCachedMindmap(videoId: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(cacheKey(videoId, "mindmap"));
  } catch {
    /* ignore */
  }
}
