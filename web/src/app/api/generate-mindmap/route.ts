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

const MINDMAP_SYSTEM_PROMPT = `你是一个专业的学习笔记生成器。输入是带时间戳的视频字幕片段，格式为：
[MM:SS] 该时间段内容

请生成一份结构化思维导图，帮助用户快速理解、复习和复述视频内容。

【输出格式】只返回 JSON，不要任何其他内容：
{
  "root": {
    "id": "1",
    "label": "视频核心主题",
    "detail": "",
    "timestamp": "00:00",
    "endTimestamp": "59:59",
    "important": false,
    "children": [
      {
        "id": "1.1.1",
        "label": "视频内容摘要",
        "detail": "本视频介绍提示工程的核心概念与最佳实践，通过汽车保险理赔案例演示如何逐步迭代优化提示词，帮助开发者构建更准确的 AI 应用。",
        "timestamp": "00:05",
        "endTimestamp": "01:14",
        "important": false,
        "children": []
      }
    ]
  }
}

每个节点字段：id / label / detail / timestamp / endTimestamp / important / children
- important：boolean，核心重点标为 true，每个一级模块下最多标注 2~3 个

【detail 字段规则】
detail 字段在以下两种情况下必须填写，其他节点可以留空字符串：

1. 叶子节点（children 为空数组或没有 children 的节点）：
   必须在 detail 中写 1~3 句话，说明该节点的具体内容、方法、作用或示例。
   不可为空字符串。

2. label 中包含专业名词的节点：
   必须在 detail 中写：英文原词 + 一句话定义 + 为什么重要/有什么用。
   格式示例："Extended Thinking 是让模型在回答前进行深度推理的机制，适合复杂分析任务，能显著提升判断准确率。"

其他中间节点（有 children 且 label 不含专业名词）的 detail 可以留空字符串 ""。

【第一个一级节点：视频简介（固定结构）】
- label 固定为「视频简介」
- 固定包含以下二级节点，按顺序；三个固定二级节点均须有实质内容，不可留空：
  1. 视频内容摘要：detail 字段必须填写 2~4 句话，概括视频核心内容和目标，不可为空字符串，不拆子节点
  2. 主讲人 / 作者：detail 字段必须填写演讲者姓名、所在机构、背景及为何值得信任，不可为空字符串，不拆子节点
  3. 涉及产品或平台（可选）：仅当视频着重介绍或演示了某个产品/平台时才增加该节点；一旦增加，detail 字段必须填写该产品/平台的简要介绍，并说明视频中如何使用它，不可为空字符串，不拆子节点
- 视频简介节点下不要有其他二级节点

【其余一级节点】
- 数量控制：视频时长 1 小时以内最多 4 个（含视频简介），1 小时以上最多 6 个（含视频简介）
- 颗粒度要粗，代表视频中真正独立的大主题，不要因为话题相近就拆成多个一级节点
- label 用名词短语；专业名词写法见【节点命名】

【节点命名】
- label 中出现的专业名词必须同时附上英文原词，格式为「中文名 (English Term)」，例如「扩展思考 (Extended Thinking)」「少样本学习 (Few-shot Learning)」

【二级及以下节点】
- 二级节点 label：在有助于引导思考、探索子话题时才用疑问句；如果直接用名词短语更清晰，就用名词短语
- 三级及以下节点：超过 20 字用「小标题：内容」格式
- 同一父节点下的子节点必须在同一颗粒度上，不要把「概念定义」和「某个具体小技巧」并列放在一起
- 如果某个话题的内容简单、不需要再拆子话题，直接把内容写在该节点的 detail 字段，不要强行增加层级

【时间戳规则】
- timestamp / endTimestamp 直接从输入的 [MM:SS] 取，不要捏造
- 父节点时间范围必须覆盖其所有子节点的时间范围
- 子节点 timestamp 不能早于父节点 timestamp

【内容完整性】
- 视频中明确列举的技巧、步骤、方法等，必须全部保留，不可因为数量多就省略。例如视频提到「10 个技巧」，脑图中必须体现全部 10 个
- 宁可增加节点层级，也不要遗漏视频中明确提及的内容

【结构精简规则】
- 如果一个节点下只有唯一一个子节点，且该子节点本身还有多个子节点，则将这两层合并：删除中间那层，把最深那层的所有子节点直接挂到最浅那层节点下，并将被删除节点的 label 信息合并进父节点的 label 或 detail 中
- 例如：「优秀提示的结构框架」→「推荐结构（单次调用）」→「1.任务描述、2.提供内容…」，应合并为：「优秀提示的结构框架：单次调用推荐结构」→「1.任务描述、2.提供内容…」

【内容原则】
- 只保留有信息价值的内容，跳过闲聊、过渡语、重复内容
- 每个节点必须有独立信息价值，宁少勿滥
- 语言要能「直接讲给别人听」，不要教科书式摘抄`;

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
