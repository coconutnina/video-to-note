import type { MindMapTreeNode } from "@/lib/mindmap";

/**
 * 读取 /api/generate-mindmap 的 NDJSON 流，返回最终脑图根节点。
 */
export async function readGenerateMindmapStream(
  res: Response,
  onProgress?: (message: string) => void
): Promise<MindMapTreeNode> {
  if (!res.body) {
    throw new Error("思维导图生成失败");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let mindRoot: MindMapTreeNode | null = null;

  const handleLine = (line: string) => {
    const t = line.trim();
    if (!t) return;
    let data: {
      type?: string;
      message?: string;
      mindmap?: { root?: MindMapTreeNode };
      error?: string;
    };
    try {
      data = JSON.parse(t) as typeof data;
    } catch {
      return;
    }
    if (data.type === "progress" && typeof data.message === "string") {
      onProgress?.(data.message);
    }
    if (data.type === "error") {
      throw new Error(
        typeof data.error === "string" ? data.error : "思维导图生成失败"
      );
    }
    if (data.type === "done" && data.mindmap?.root) {
      mindRoot = data.mindmap.root;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const p of parts) handleLine(p);
  }
  if (buffer.trim()) handleLine(buffer.trim());

  if (!res.ok && !mindRoot) {
    throw new Error("思维导图生成失败");
  }
  if (!mindRoot) {
    throw new Error("思维导图生成失败");
  }
  return mindRoot;
}
