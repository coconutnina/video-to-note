import type { FlowEdge, FlowNode } from "@/lib/mindmap";

const CACHE_VERSION = "v1";

function cacheKey(videoId: string, type: "translations" | "mindmap") {
  return `workspace:${CACHE_VERSION}:${type}:${videoId}`;
}

export function getCachedTranslations(
  videoId: string
): Record<number, string> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(cacheKey(videoId, "translations"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[Number(k)] = v;
    }
    return out;
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
