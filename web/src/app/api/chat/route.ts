import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";
const MAX_HISTORY_ROUNDS = 10;
const MAX_TRANSCRIPT_CONTEXT = 20000;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildChunks(transcript: { text: string; start: number }[]) {
  const chunks: {
    startTime: string;
    endTime: string;
    text: string;
    lines: string;
  }[] = [];
  let current: { text: string; start: number }[] = [];

  for (let i = 0; i < transcript.length; i++) {
    const item = transcript[i];
    current.push(item);
    const text = (item.text ?? "").trim();

    const isSentenceEnd = /[.?!]$/.test(text);
    const isTooLong = current.length >= 15;

    if (isSentenceEnd || isTooLong) {
      chunks.push({
        startTime: formatTime(current[0].start),
        endTime: formatTime(current[current.length - 1].start),
        text: current.map((s) => s.text).join(" "),
        lines: current
          .map((s) => `[${formatTime(s.start)}] ${s.text}`)
          .join("\n"),
      });
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push({
      startTime: formatTime(current[0].start),
      endTime: formatTime(current[current.length - 1].start),
      text: current.map((s) => s.text).join(" "),
      lines: current
        .map((s) => `[${formatTime(s.start)}] ${s.text}`)
        .join("\n"),
    });
  }

  return chunks;
}

function retrieveRelevantChunks(
  transcript: { text: string; start: number }[],
  question: string,
  maxChars = 8000
): string {
  if (!transcript.length) return "";

  const chunks = buildChunks(transcript);

  const questionWords = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scored = chunks.map((chunk, index) => {
    const text = chunk.text.toLowerCase();
    const score = questionWords.reduce(
      (sum, word) => sum + (text.includes(word) ? 1 : 0),
      0
    );
    return { ...chunk, score, index };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);

  const topIndices = sorted
    .filter((c) => c.score > 0)
    .slice(0, 5)
    .map((c) => c.index);

  const expandedIndices = new Set<number>();
  topIndices.forEach((i) => {
    if (i > 0) expandedIndices.add(i - 1);
    expandedIndices.add(i);
    if (i < chunks.length - 1) expandedIndices.add(i + 1);
  });

  // 如果所有 score 都是 0，退化为首尾各一个 chunk
  if (expandedIndices.size === 0 && chunks.length > 0) {
    expandedIndices.add(0);
    if (chunks.length > 1) expandedIndices.add(chunks.length - 1);
  }

  const combined = Array.from(expandedIndices)
    .sort((a, b) => a - b)
    .map((i) => chunks[i]);

  let result = "";
  for (const chunk of combined) {
    if (result.length + chunk.lines.length > maxChars) break;
    result += chunk.lines + "\n";
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      question?: string;
      transcript?: { text: string; start: number }[];
      history?: { role: "user" | "assistant"; content: string }[];
      mode?: "video" | "search";
    } | null;

    const question =
      typeof body?.question === "string" ? body.question.trim() : "";
    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    const mode = body?.mode === "search" ? "search" : "video";

    if (!question) {
      return NextResponse.json({ error: "缺少 question" }, { status: 400 });
    }

    const transcriptContext = retrieveRelevantChunks(
      transcript,
      question,
      Math.min(MAX_TRANSCRIPT_CONTEXT, 8000)
    );

    let searchContext = "";
    if (mode === "search") {
      try {
        const apiKey = process.env.TAVILY_API_KEY;
        if (apiKey) {
          const tavilyRes = await fetch(TAVILY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: apiKey,
              query: question,
              max_results: 3,
              search_depth: "basic",
            }),
          });
          const tavilyData = (await tavilyRes.json().catch(() => ({}))) as {
            results?: Array<{ url?: string; content?: string; title?: string }>;
          };
          searchContext =
            tavilyData.results
              ?.map((r) => `来源：${r.url ?? ""}\n${r.content ?? ""}`)
              .join("\n\n") ?? "";
        }
      } catch {
        // Tavily 失败时降级为仅视频内容，不报错
      }
    }

    const systemPrompt =
      mode === "search"
        ? `你是一个视频学习助手。以下是视频的完整字幕内容和网络搜索结果，请综合回答用户问题。

规则：
- 优先基于视频字幕内容回答，可以用网络搜索结果补充
- 回答要具体有价值，不要泛泛而谈
- 如果用了视频内容，在末尾注明：📍 视频来源：[MM:SS]
- 如果用了网络内容，在末尾注明：🔗 网络来源：[网站名](URL)
- 回答语言：中文

视频字幕：
${transcriptContext}

网络搜索结果：
${searchContext}`
        : `你是一个视频学习助手。以下是视频的完整字幕内容，请认真阅读后回答用户问题。

规则：
- 必须基于字幕内容作答，尽量给出有价值的具体回答
- 回答要具体，不要泛泛而谈
- 在回答末尾注明来源：📍 视频来源：[MM:SS]
- 只有字幕中完全没有任何相关内容时，才回复「视频中未提及」
- 回答语言：中文

视频字幕：
${transcriptContext}`;

    const history = rawHistory.slice(-MAX_HISTORY_ROUNDS * 2);

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question },
    ];

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "缺少 DeepSeek API Key" },
        { status: 500 }
      );
    }

    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("DeepSeek chat 失败:", response.status, errText);
      return NextResponse.json(
        { error: "回答生成失败，请重试" },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: unknown;
    } | null;

    const answer =
      data?.choices?.[0]?.message?.content?.trim() ?? "回答生成失败，请重试";

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("chat API 失败:", error);
    return NextResponse.json(
      { error: "回答生成失败，请重试" },
      { status: 500 }
    );
  }
}
