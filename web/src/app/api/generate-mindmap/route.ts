import { NextRequest, NextResponse } from "next/server";
import { deepseekStreamCompletion } from "@/lib/deepseek-stream";
import { treeToFlow, type EdgeType, type FlowEdge, type FlowNode, type MindMapTreeNode } from "@/lib/mindmap";
import { getMindmapCache, setMindmapCache } from "@/lib/supabase-cache";

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

const MINDMAP_SKELETON_PROMPT = `你是一个专业的学习笔记生成器。
输入是带时间戳的视频字幕，格式为 [MM:SS] 内容。

只输出缩进文本格式的思维导图骨架，不要 JSON，不要任何其他内容。

【输出格式】
- 每行一个节点
- 用2个空格缩进表示层级（根节点无缩进，一级节点2空格，二级节点4空格，以此类推）
- 每行格式：「节点标题 [开始时间~结束时间]」，重要节点末尾加 *
- 时间格式 MM:SS（不足100分钟）或 MMM:SS（超过99分钟，分钟数直接写实际数字，如185:30），
  不要转换为 HH:MM:SS 格式，直接从输入的 [MM:SS] 中取，不可捏造

第一行是根节点（视频标题，无缩进），之后所有一级节点都有2空格缩进。
示例输出：
提示工程 (Prompt Engineering) 最佳实践 [00:05~24:24]
  视频简介 [00:05~02:49]
    视频内容摘要 [00:05~01:14]
    主讲人 / 作者 [00:05~00:39]
  提示词结构与迭代方法 [02:49~20:35]
    案例背景与任务设定 [02:49~05:33] *

【结构规则】
第一个一级节点固定为「视频简介」，固定包含以下子节点（均为叶子节点）：
1. 视频内容摘要
2. 主讲人 / 作者
3. 涉及产品或平台（可选，仅视频着重演示某产品时才加）

其余一级节点数量根据视频时长控制（含视频简介）：
- 30分钟以内：最多4个
- 30~60分钟：最多5个
- 1~2小时：最多6个
- 2小时以上：最多8个

【节点命名规则】
- 一级节点：名词短语，不超过15字
  ✅ 「提示词结构与迭代方法」
  ❌ 「要点一：设定任务与语气」（禁止"要点X"命名）
- 二级节点：名词短语或疑问句，在有助于引导思考时才用疑问句
- 专业名词必须附英文：「中文名 (English Term)」
- 同一概念在整棵脑图中只出现一次

【内容规则】
- 严禁省略视频中出现的任何编号序列节点。
  如果视频演示了 V1、V2、V3、V4、V5，脑图中必须出现全部5个节点，
  缺少任何一个都是错误的输出。
- 在生成骨架前，先在脑图中为所有编号序列节点占位，再填充其他内容。
- 视频中明确说"有X个技巧/方法/步骤"时，脑图中该模块下必须有 X 个子节点一一对应
- 只跳过无实质内容的闲聊、过渡语
- 同一父节点下子节点必须在同一颗粒度
- 只跳过闲聊、过渡语、重复内容
- 若一个节点下只有唯一子节点，将两层合并为一层

【时间戳规则】
- 只从输入的 [MM:SS] 中取值，不可捏造
- 父节点时间范围必须覆盖所有子节点
- 同一父节点下子节点时间大致递增`;

interface ApiMindMapNode {
  id: string;
  label: string;
  timestamp?: string;
  endTimestamp?: string;
  important?: boolean;
  edgeType?: string;
  detail?: string;
  children?: ApiMindMapNode[];
}

/** MM:SS 或 HH:MM:SS → 秒数；无效则 0 */
function tsToSeconds(ts?: string): number {
  if (!ts?.trim()) return 0;
  const parts = ts.trim().split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** 自底向上：父节点 timestamp / endTimestamp 覆盖所有子节点时间范围 */
function fixNodeTimestamps(node: ApiMindMapNode): void {
  if (!node.children || node.children.length === 0) return;

  node.children.forEach((child) => fixNodeTimestamps(child));

  const allStarts = node.children
    .map((c) => tsToSeconds(c.timestamp))
    .filter((s) => s > 0);
  const allEnds = node.children
    .map((c) => tsToSeconds(c.endTimestamp ?? c.timestamp))
    .filter((s) => s > 0);

  if (allStarts.length > 0) {
    const minStart = Math.min(...allStarts);
    const maxEnd =
      allEnds.length > 0 ? Math.max(...allEnds) : minStart;
    node.timestamp = formatTime(minStart);
    node.endTimestamp = formatTime(maxEnd);
  }
}

function parseSkeletonText(text: string): ApiMindMapNode {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  // 解析单行：提取 label、timestamp、endTimestamp、important
  function parseLine(line: string): Omit<ApiMindMapNode, "children"> {
    const depth = (line.match(/^ */)?.[0].length ?? 0) / 2;
    const trimmed = line.trim();
    const important = trimmed.endsWith("*");
    const withoutStar = important ? trimmed.slice(0, -1).trim() : trimmed;

    const timeMatch = withoutStar.match(/\[(\d{2,3}:\d{2})~(\d{2,3}:\d{2})\]\s*$/);
    const timestamp = timeMatch?.[1] ?? "";
    const endTimestamp = timeMatch?.[2] ?? "";
    const label = timeMatch
      ? withoutStar.slice(0, withoutStar.lastIndexOf("[")).trim()
      : withoutStar;

    return {
      id: String(depth) + "_" + Math.random().toString(36).slice(2, 7),
      label,
      timestamp,
      endTimestamp,
      important,
    };
  }

  // 构建树
  const stack: { node: ApiMindMapNode; depth: number }[] = [];
  let root: ApiMindMapNode | null = null;

  lines.forEach((line, index) => {
    const depth = (line.match(/^ */)?.[0].length ?? 0) / 2;
    const node: ApiMindMapNode = {
      ...parseLine(line),
      id: String(index + 1),
      children: [],
    };

    if (stack.length === 0) {
      root = node;
      stack.push({ node, depth });
      return;
    }

    // 找到当前节点的父节点
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    parent.children = parent.children ?? [];
    parent.children.push(node);
    stack.push({ node, depth });
  });

  if (!root) throw new Error("骨架文本解析失败：无法找到根节点");
  return root;
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
    detail: n.detail ?? "",
    children: n.children?.map(normalizeToTreeNode),
  };
}

function flowToTreeRoot(nodes: FlowNode[], edges: FlowEdge[]): MindMapTreeNode | null {
  if (!nodes.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  const targets = new Set<string>();
  for (const e of edges) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
    targets.add(e.target);
  }
  const root =
    nodes.find((n) => (n.data.depth ?? 0) === 0) ??
    nodes.find((n) => !targets.has(n.id)) ??
    nodes[0];

  const build = (id: string): MindMapTreeNode | null => {
    const node = byId.get(id);
    if (!node) return null;
    const childIds = childrenMap.get(id) ?? [];
    const children = childIds
      .map((cid) => build(cid))
      .filter((x): x is MindMapTreeNode => x !== null);
    return {
      id: node.id,
      label: node.data.label ?? "",
      timestamp: node.data.timestamp ?? "",
      endTimestamp: node.data.endTimestamp ?? "",
      important: node.data.important,
      detail: node.data.detail ?? "",
      children,
    };
  };

  return build(root.id);
}

function collectDetailTargets(
  node: ApiMindMapNode,
  out: ApiMindMapNode[],
  depth = 0
): void {
  const children = node.children ?? [];
  const isLeaf = children.length === 0;
  const hasEnglishTerm = /\([A-Za-z][^)]*\)/.test(node.label);
  const isFixedIntroNode = ["视频内容摘要", "主讲人 / 作者"].some((name) =>
    node.label.includes(name)
  );
  if (depth > 0 && (isLeaf || hasEnglishTerm || isFixedIntroNode)) out.push(node);
  children.forEach((c) => collectDetailTargets(c, out, depth + 1));
}

function extractRelevantContext(
  timedText: string,
  targets: ApiMindMapNode[],
  maxChars = 6000
): string {
  // 找出所有目标节点的时间范围
  const lines = timedText.split("\n");

  // 收集所有目标节点涉及的时间戳（timestamp 和 endTimestamp）
  const targetTimes = new Set<string>();
  targets.forEach((n) => {
    if (n.timestamp) targetTimes.add(n.timestamp.slice(0, 2)); // 取分钟部分
    if (n.endTimestamp) targetTimes.add(n.endTimestamp.slice(0, 2));
  });

  // 筛选出与目标节点时间相关的字幕行（前后各保留2分钟缓冲）
  const minSeconds = Math.min(...targets.map((n) => tsToSeconds(n.timestamp))) - 120;
  const maxSeconds =
    Math.max(
      ...targets.map((n) => tsToSeconds(n.endTimestamp ?? n.timestamp))
    ) + 120;

  const relevantLines = lines.filter((line) => {
    const match = line.match(/^\[(\d{2}:\d{2})\]/);
    if (!match) return false;
    const sec = tsToSeconds(match[1]);
    return sec >= minSeconds && sec <= maxSeconds;
  });

  // 如果相关行太少，补充全文前后各一部分
  if (targetTimes.size === 0 || relevantLines.join("\n").length < 500) {
    return timedText.slice(0, 3000) + "\n...\n" + timedText.slice(-3000);
  }

  return relevantLines.join("\n").slice(0, maxChars);
}

function batchTargetsByTime(
  targets: ApiMindMapNode[],
  gapSeconds = 180
): ApiMindMapNode[][] {
  const sorted = [...targets].sort(
    (a, b) => tsToSeconds(a.timestamp) - tsToSeconds(b.timestamp)
  );

  const batches: ApiMindMapNode[][] = [];
  let current: ApiMindMapNode[] = [];

  for (const t of sorted) {
    if (current.length === 0) {
      current.push(t);
      continue;
    }

    const prevSec = tsToSeconds(current[current.length - 1].timestamp);
    const curSec = tsToSeconds(t.timestamp);

    if (curSec - prevSec > gapSeconds) {
      batches.push(current);
      current = [t];
    } else {
      current.push(t);
    }
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function enrichDetails(
  apiKey: string,
  timedText: string,
  root: ApiMindMapNode,
  channelTitle: string
): Promise<void> {
  const targets: ApiMindMapNode[] = [];
  collectDetailTargets(root, targets);
  if (targets.length === 0) return;

  const introNodes = targets.filter(
    (n) =>
      n.label.includes("视频内容摘要") || n.label.includes("主讲人")
  );
  const otherNodes = targets.filter(
    (n) =>
      !n.label.includes("视频内容摘要") && !n.label.includes("主讲人")
  );

  const systemPrompt =
    "你是学习笔记助手。根据视频字幕内容，为以下节点补充 detail 说明。所有 detail 必须用中文输出。只返回 JSON 数组，不要其他内容。";

  async function enrichOneBatch(
    batch: ApiMindMapNode[],
    contextText: string,
    maxTokens: number
  ): Promise<void> {
    if (batch.length === 0) return;

    const targetPayload = batch.map((n) => ({ id: n.id, label: n.label }));

    try {
      const detailContent = await deepseekStreamCompletion(apiKey, {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `视频字幕（参考）：
${contextText}

请为以下节点补充 detail：
${JSON.stringify(targetPayload)}

返回格式：[{"id": "1.1", "detail": "说明内容"}, ...]

规则：
- 叶子节点：严格控制在 2~3 句话以内，不超过 80 字，说明核心内容、方法或作用
- 含专业名词的节点：英文原词 + 一句话定义（不超过30字）+ 一句话说明为什么重要
- 所有 detail 必须简洁，不要超过 100 字
- 必须基于视频内容，不要捏造
- 根节点（第一个节点，id 为最短的那个）不需要 detail，跳过
- 对于 label 为「视频内容摘要」的节点：用 2~4 句话概括视频的核心主题、主要内容、学习目标和适合人群
- 对于 label 为「主讲人 / 作者」或 label 包含「作者」「讲师」「主讲」的节点：必须包含：姓名、所在机构/公司、职位或身份、在该领域的背景经验，以及为什么他们讲这个话题有可信度；如果字幕中信息有限，把能找到的都写出来`,
          },
        ],
        max_tokens: maxTokens,
      });

      const firstBracket = detailContent.indexOf("[");
      const lastBracket = detailContent.lastIndexOf("]");
      if (firstBracket === -1 || lastBracket === -1) return;

      const clean = detailContent
        .slice(firstBracket, lastBracket + 1)
        .trim();
      const parsed = JSON.parse(clean) as Array<{
        id?: string;
        detail?: string;
      }>;

      const detailMap = new Map<string, string>();
      parsed.forEach((item) => {
        const id = typeof item.id === "string" ? item.id : "";
        const detail = typeof item.detail === "string" ? item.detail : "";
        if (id) detailMap.set(id, detail);
      });

      batch.forEach((n) => {
        const d = detailMap.get(n.id);
        if (d !== undefined && d.trim()) n.detail = d;
      });
    } catch {
      // 单批失败时跳过，不影响主流程与其它批次
    }
  }

  // 专属处理开头两个固定节点：字幕上下文固定取前 3000 字符
  await enrichOneBatch(introNodes, timedText.slice(0, 3000), 2000);

  // 主讲人 detail 兜底：如果生成质量不足，则用 Tavily + DeepSeek 进一步补充
  try {
    const speakerNodes = introNodes.filter(
      (n) => n.label.includes("主讲人 / 作者") || n.label.includes("主讲人")
    );

    const badMarkers = [
      "未明确",
      "未提及",
      "不确定",
      "未在字幕",
      "未透露",
      "推断",
      "可能来自",
      "字幕中",
    ];
    const needSearchNodes = speakerNodes.filter((n) => {
      const d = (n.detail ?? "").trim();
      if (!d) return true;
      if (d.length < 30) return true;
      // 包含任何不确定性表达，说明是推断而非事实
      if (badMarkers.some((m) => d.includes(m))) return true;
      // 如果 detail 里没有出现任何英文人名（大写字母开头的连续两个单词），说明没有找到真实姓名
      const hasRealName = /[A-Z][a-z]+ [A-Z][a-z]+/.test(d);
      // 如果 detail 里也没有中文人名特征（两个字以上的中文姓名通常跟着职位/机构）
      const hasChineseName = /[\u4e00-\u9fa5]{2,4}（|[\u4e00-\u9fa5]{2,4}，|[\u4e00-\u9fa5]{2,4}是/.test(d);
      if (!hasRealName && !hasChineseName) return true;
      return false;
    });

    if (needSearchNodes.length > 0) {
      const TAVILY_URL = "https://api.tavily.com/search";
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (!tavilyKey) return;

      const keywordSource = timedText.slice(0, 2000);
      const re = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
      const freq = new Map<string, number>();
      for (const match of keywordSource.matchAll(re)) {
        const name = match[0];
        if (!name) continue;
        freq.set(name, (freq.get(name) ?? 0) + 1);
      }

      const topNames = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
        .slice(0, 2);

      const videoTitleKeyword = (root.label ?? "").trim();
      const query =
        topNames.length > 0
          ? `${topNames.join(" ")} ${videoTitleKeyword} background`
          : channelTitle
            ? `${channelTitle} background who is`
            : `${videoTitleKeyword} presenter background`;

      const tavilyRes = await fetch(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: 2,
          search_depth: "basic",
        }),
      });

      const tavilyData = (await tavilyRes.json().catch(() => ({}))) as {
        results?: Array<{
          url?: string;
          content?: string;
          title?: string;
        }>;
      };

      const searchResultsText =
        tavilyData.results
          ?.map(
            (r) =>
              `来源：${r.url ?? ""}\n${r.content ?? ""}`.trim()
          )
          .filter(Boolean)
          .join("\n\n") ?? "";

      if (searchResultsText.trim()) {
        const prompt = `根据以下搜索结果，用2~3句中文介绍该人物的姓名、机构、职位和专业背景：\n${searchResultsText}`;
        const summary = await deepseekStreamCompletion(apiKey, {
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        });

        const finalDetail = summary.trim();
        if (finalDetail) {
          needSearchNodes.forEach((n) => {
            n.detail = finalDetail;
          });
        }
      }
    }
  } catch {
    // Tavily/DeepSeek 失败静默跳过，不影响主流程
  }

  // 其余节点按时间段分批并行处理
  const batches = batchTargetsByTime(otherNodes, 180);
  await Promise.all(
    batches.map((batch) =>
      enrichOneBatch(batch, extractRelevantContext(timedText, batch), 2000)
    )
  );
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
      channelTitle?: string;
      videoId?: string;
    } | null;
    const transcript = body?.transcript ?? [];
    const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : "";
    const rawTitle =
      typeof body?.videoTitle === "string" ? body.videoTitle.trim() : "";
    const channelTitle =
      typeof body?.channelTitle === "string" ? body.channelTitle.trim() : "";
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json(
        { error: "transcript 为空或格式错误" },
        { status: 400 }
      );
    }

    if (videoId) {
      const cachedMindmap = await getMindmapCache(videoId);
      if (cachedMindmap) {
        const root = flowToTreeRoot(cachedMindmap.nodes, cachedMindmap.edges);
        if (root) {
          return NextResponse.json({ mindmap: { root } });
        }
      }
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
          { role: "system", content: MINDMAP_SKELETON_PROMPT },
          {
            role: "user",
            content: timedText,
          },
        ],
        max_tokens: 4000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`DeepSeek 脑图请求失败: ${msg}`);
    }
    console.log("DeepSeek response length:", content.length);
    console.log("DeepSeek response tail:", content.substring(content.length - 200));
    const skeletonRoot = parseSkeletonText(content);
    // 用真实视频标题覆盖根节点 label
    const invalidTitles = ["加载中...", "loading", "undefined", ""];
    if (rawTitle && !invalidTitles.includes(rawTitle.toLowerCase())) {
      skeletonRoot.label = rawTitle;
    }
    const mindmap = { root: skeletonRoot };

    if (!mindmap?.root) {
      throw new Error("DeepSeek 返回的脑图格式无效");
    }

    fixNodeTimestamps(mindmap.root);
    await enrichDetails(apiKey, timedText, mindmap.root, channelTitle);
    const rootTree = normalizeToTreeNode(mindmap.root);
    if (videoId) {
      const flow = treeToFlow(rootTree);
      await setMindmapCache(videoId, { nodes: flow.nodes, edges: flow.edges });
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
