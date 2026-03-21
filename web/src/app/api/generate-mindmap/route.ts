import { NextRequest, NextResponse } from "next/server";
import { deepseekStreamCompletion } from "@/lib/deepseek-stream";
import type { EdgeType, MindMapTreeNode } from "@/lib/mindmap";

export const maxDuration = 60;

interface TranscriptItem {
  text: string;
  start: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 按时间窗口合并字幕：窗口起始后累计满 windowSeconds 则推入一条窗口，最后一段也推入。
 */
function buildTimedWindows(
  transcript: TranscriptItem[],
  windowSeconds = 30
): { timestamp: string; text: string }[] {
  const result: { timestamp: string; text: string }[] = [];
  if (transcript.length === 0) return result;

  let windowStart = transcript[0].start;
  const buf: string[] = [];

  for (const seg of transcript) {
    if (buf.length > 0 && seg.start - windowStart >= windowSeconds) {
      result.push({
        timestamp: formatTime(windowStart),
        text: buf.join(" "),
      });
      buf.length = 0;
      windowStart = seg.start;
    }
    buf.push(seg.text);
  }

  if (buf.length > 0) {
    result.push({
      timestamp: formatTime(windowStart),
      text: buf.join(" "),
    });
  }

  return result;
}

const MINDMAP_SYSTEM_PROMPT = `你是专业的学习笔记与思维导图生成器。

输入格式：多行文本，每一行以 [MM:SS] 开头，表示该时间窗口内的字幕合并文本（可能跨越多条原始字幕）。时间戳来自视频时间轴，你必须严格依据这些时间戳，不得捏造。

请根据输入生成一棵思维导图，只输出一个 JSON 对象，不要输出任何其他文字或 markdown。

JSON 顶层结构：
{
  "root": {
    "id": "字符串，唯一",
    "label": "根节点标题",
    "timestamp": "MM:SS 或留空",
    "endTimestamp": "MM:SS 或留空",
    "important": false,
    "edgeType": "split",
    "children": [ ... ]
  }
}

每个节点字段说明：
- id：字符串，全树唯一
- label：节点标题（见下方命名规则）
- timestamp、endTimestamp：必须从输入行中的 [MM:SS] 中选取或推导，与内容对应；不能编造不存在的时间。父节点的时间范围必须覆盖其所有子节点的时间范围。
- important：布尔值。true 表示核心重点；每个一级模块（根的直接子节点及其子树为一「模块」）下，最多 3 个子节点可标为 true。
- edgeType：表示与父节点的关系，取值仅限：split（并列拆分，最常用）、parallel（并列方面）、causal（因果）、progressive（递进/步骤）
- children：子节点数组，无子节点则为 []

结构规则：
- 固定为 4 层（根为第 0 层，向下共 4 层可见主题；根下第一个一级子节点 label 固定为「视频简介」，用于概括整体）
- 一级节点：简短名词短语
- 二级节点：优先使用疑问句形式（能概括该支主题时）
- 三、四级：若单句超过约 20 字，使用「小标题：内容」形式；专业名词可在 label 中附英文（括号或斜杠）

内容原则：
- 只保留有信息价值的内容，跳过闲聊、过渡语、无实质信息的片段
- 时间戳只能来自输入中出现的 [MM:SS]，父节点时间范围覆盖子节点

只返回 JSON，不要代码块包裹。`;

interface ApiMindMapNode {
  id: string;
  label: string;
  timestamp?: string;
  endTimestamp?: string;
  important?: boolean;
  edgeType?: string;
  children?: ApiMindMapNode[];
}

function parseEdgeType(s: string | undefined): EdgeType | undefined {
  if (s === "split" || s === "parallel" || s === "causal" || s === "progressive") {
    return s;
  }
  return undefined;
}

function normalizeToTreeNode(n: ApiMindMapNode): MindMapTreeNode {
  return {
    id: String(n.id),
    label: n.label,
    timestamp: n.timestamp ?? "",
    endTimestamp: n.endTimestamp,
    important: n.important,
    edgeType: parseEdgeType(n.edgeType),
    detail: undefined,
    children: n.children?.map(normalizeToTreeNode),
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "缺少 DeepSeek API Key" },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      transcript?: TranscriptItem[];
      videoTitle?: string;
    } | null;
    const transcript = body?.transcript ?? [];
    const rawTitle =
      typeof body?.videoTitle === "string" ? body.videoTitle.trim() : "";
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json(
        { error: "transcript 为空或格式错误" },
        { status: 400 }
      );
    }

    const windows = buildTimedWindows(transcript, 30);
    const timedText = windows
      .map((w) => `[${w.timestamp}] ${w.text}`)
      .join("\n");

    let content: string;
    try {
      content = await deepseekStreamCompletion(apiKey, {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: MINDMAP_SYSTEM_PROMPT },
          {
            role: "user",
            content: timedText,
          },
        ],
        max_tokens: 6000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`DeepSeek 脑图请求失败: ${msg}`);
    }

    const clean = content.replace(/```json\n?|\n?```/g, "").trim();
    const mindmap = JSON.parse(clean) as {
      root?: ApiMindMapNode;
    };

    if (!mindmap?.root) {
      throw new Error("DeepSeek 返回的脑图格式无效");
    }

    const rootTree = normalizeToTreeNode(mindmap.root);

    const invalidTitles = ["加载中...", "loading", "undefined", ""];
    const titleToUse =
      typeof rawTitle === "string" ? rawTitle.trim() : "";
    if (
      titleToUse &&
      !invalidTitles.includes(titleToUse.toLowerCase())
    ) {
      rootTree.label = titleToUse;
    }

    return NextResponse.json({ mindmap: { root: rootTree } });
  } catch (error) {
    console.error("generate-mindmap 失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    );
  }
}
