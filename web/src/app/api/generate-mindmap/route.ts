import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const CHUNK_SIZE = 300;
const MAX_CHUNK_TEXT = 3000;

interface TranscriptItem {
  text: string;
  start: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface ChunkSummary {
  index: number;
  startTime: string;
  content: string;
}

interface SearchIndexEntry {
  text: string;
  timestamp: string;
}

function buildSearchIndex(
  transcript: TranscriptItem[]
): SearchIndexEntry[] {
  return transcript.map((s) => ({
    text: s.text.toLowerCase(),
    timestamp: formatTime(s.start),
  }));
}

function findTimestamp(
  quote: string | undefined,
  searchIndex: SearchIndexEntry[]
): { timestamp: string; index: number } {
  if (!quote || searchIndex.length === 0)
    return { timestamp: "00:00", index: 0 };
  const q = quote.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 3);

  let bestMatch = searchIndex[0];
  let bestMatchIndex = 0;
  let bestScore = 0;

  searchIndex.forEach((entry, i) => {
    let score = 0;
    let consecutiveBonus = 0;
    for (const word of words) {
      if (entry.text.includes(word)) {
        score += 1 + consecutiveBonus;
        consecutiveBonus += 0.5;
      } else {
        consecutiveBonus = 0;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
      bestMatchIndex = i;
    }
  });

  return { timestamp: bestMatch.timestamp, index: bestMatchIndex };
}

interface MindMapNodeRaw {
  quote?: string;
  children?: MindMapNodeRaw[];
  [key: string]: unknown;
}

function injectTimestamps(
  node: MindMapNodeRaw,
  searchIndex: SearchIndexEntry[],
  searchFromIndex = 0
): void {
  if (node.timestamp === null) {
    // 根节点跳过，直接处理子节点
    node.children?.forEach((child) =>
      injectTimestamps(child, searchIndex, 0)
    );
    return;
  }

  // 只在 searchFromIndex 之后的字幕里搜索
  const scopedIndex = searchIndex.slice(searchFromIndex);
  const { timestamp, index } = findTimestamp(
    typeof node.quote === "string" ? node.quote : undefined,
    scopedIndex
  );
  node.timestamp = timestamp;

  // 子节点从当前匹配位置之后开始搜索（全局 index）
  const childSearchFrom = searchFromIndex + index;
  node.children?.forEach((child) =>
    injectTimestamps(child, searchIndex, childSearchFrom)
  );
}

async function summarizeChunks(
  transcript: TranscriptItem[],
  apiKey: string
): Promise<ChunkSummary[]> {
  const chunks: TranscriptItem[][] = [];
  for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
    chunks.push(transcript.slice(i, i + CHUNK_SIZE));
  }

  const summaries = await Promise.all(
    chunks.map(async (chunk, i) => {
      if (chunk.length === 0) return { index: i, startTime: "00:00", content: "" };
      const startTime = formatTime(chunk[0].start);
      const text = chunk
        .map((s) => s.text)
        .join(" ")
        .substring(0, MAX_CHUNK_TEXT);

      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "用2-3句话概括以下视频片段的核心内容，突出关键概念和重要信息，不要遗漏重点。只返回摘要文字，不要其他内容。",
            },
            {
              role: "user",
              content: `时间段：${startTime}\n\n${text}`,
            },
          ],
          max_tokens: 200,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`DeepSeek 摘要请求失败: ${res.status} ${errText}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
      return { index: i, startTime, content };
    })
  );

  return summaries.filter((s) => s.content.length > 0);
}

const MINDMAP_SYSTEM_PROMPT = `你是一个专业的学习笔记生成器。输入是视频各时间段的摘要。
请生成一个详细的思维导图，帮助用户用自己的话复述内容并做复习。

返回格式为JSON：
{
  "root": {
    "id": "1",
    "label": "视频核心主题",
    "detail": "",
    "children": [
      {
        "id": "2",
        "label": "一级主题（简短标题）",
        "quote": "the core idea of prompt engineering is",
        "detail": "用1-2句话说明这个主题的核心内容或目的",
        "children": [
          {
            "id": "3",
            "label": "具体知识点",
            "quote": "specific phrase from later in the video",
            "detail": "详细解释：是什么、为什么、怎么做",
            "children": []
          }
        ]
      }
    ]
  }
}

要求：
- 层级不限制，根据内容复杂度自然展开，3小时视频可以有4-5层
- 一级节点数量根据视频主题数量决定，不强制限制为5个
- label 是简短标题（10字以内）
- detail 是该节点的详细说明，越具体越好；detail 只在三级及以下节点填写，一二级节点 detail 留空字符串
- 每个节点填写 quote 字段，值为该知识点在视频字幕中出现的一句原文（英文，5-10个单词），尽量选择该知识点首次被明确提及时的原句。例如："quote": "the core idea of prompt engineering is"。根节点不需要 quote。不需要填 timestamp 字段，由系统自动匹配。
- 时间戳规则：父节点的 quote 必须来自该主题最早被提及的位置；子节点的 quote 必须来自父节点之后的字幕内容；同一父节点下的子节点，quote 对应的时间应该依次递增。
- 只返回JSON，不要任何其他内容

筛选原则：
- 只保留视频中有实质内容的知识点，跳过闲聊、过渡语、重复内容
- 每个节点必须有独立的信息价值，不要为了结构完整而硬凑节点
- 宁可节点少而精，不要多而杂`;

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

    const searchIndex = buildSearchIndex(transcript);

    console.log("收到参数:", {
      transcriptLength: transcript.length,
      videoTitle: rawTitle,
    });

    const summaries = await summarizeChunks(transcript, apiKey);
    const summaryText = summaries
      .map((s) => `[CHUNK_${s.index}|${s.startTime}] ${s.content}`)
      .join("\n\n");

    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: MINDMAP_SYSTEM_PROMPT },
          {
            role: "user",
            content: `请根据以下视频分段摘要生成思维导图：\n\n${summaryText}`,
          },
        ],
        max_tokens: 6000,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`DeepSeek 脑图请求失败: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content ?? "";
    const clean = content.replace(/```json\n?|\n?```/g, "").trim();
    const mindmap = JSON.parse(clean) as { root?: MindMapNodeRaw };

    if (!mindmap?.root) {
      throw new Error("DeepSeek 返回的脑图格式无效");
    }

    console.log("根节点覆盖前:", (mindmap.root as { label?: unknown }).label);

    // 根节点不参与时间匹配，先置 null 再注入子节点时间戳（子节点只在父节点之后搜索）
    (mindmap.root as { timestamp?: string | null }).timestamp = null;
    injectTimestamps(mindmap.root, searchIndex);

    // 过滤掉明显是占位符的值，只有有效标题才覆盖
    const invalidTitles = ["加载中...", "loading", "undefined", ""];
    const titleToUse =
      typeof rawTitle === "string" ? rawTitle.trim() : "";
    if (
      titleToUse &&
      !invalidTitles.includes(titleToUse.toLowerCase())
    ) {
      mindmap.root.label = titleToUse;
      console.log("根节点覆盖后:", (mindmap.root as { label?: unknown }).label);
    }

    function toSeconds(ts?: string | unknown): number {
      if (!ts || typeof ts !== "string") return 0;
      const parts = ts.split(":").map((n) => Number(n) || 0);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    }

    function sortByTimestamp(node: MindMapNodeRaw): void {
      if (!node.children || node.children.length === 0) return;
      node.children.sort(
        (a, b) => toSeconds(a.timestamp) - toSeconds(b.timestamp)
      );
      node.children.forEach((child) => sortByTimestamp(child));
    }

    sortByTimestamp(mindmap.root);

    return NextResponse.json({ mindmap });
  } catch (error) {
    console.error("generate-mindmap 失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    );
  }
}
