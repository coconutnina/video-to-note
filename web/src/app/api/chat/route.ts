import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";
const MAX_HISTORY_ROUNDS = 10;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildFullTranscriptContext(
  transcript: { text: string; start: number }[]
): string {
  if (!transcript.length) return "";
  return transcript
    .map((item) => `[${formatTime(item.start)}] ${item.text}`)
    .join("\n");
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

    const transcriptContext = buildFullTranscriptContext(transcript);

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
              ?.map(
                (r) =>
                  `标题：${r.title ?? ""}\n来源：${r.url ?? ""}\n${r.content ?? ""}`
              )
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
- 综合视频字幕和网络搜索结果回答，两者都要参考
- 回答控制在 200 字以内，简洁直接，不要展开所有细节
- 时间戳必须直接跟在句子末尾，和句子在同一行，中间不加换行，例如：这是一个要点 [00:06]。下一个要点 [00:24]。
- 引用网络内容时，必须在相关句子末尾用 Markdown 链接标注来源，格式为 [网站标题](URL)
- 回答语言：中文

视频字幕：
${transcriptContext}

网络搜索结果：
${searchContext}`
        : `你是一个视频学习助手。以下是视频的完整字幕内容，请认真阅读后回答用户问题。

规则：
- 必须基于字幕内容作答，尽量给出有价值的具体回答
- 回答要具体，不要泛泛而谈
- 时间戳必须直接跟在句子末尾，和句子在同一行，中间不加换行，例如：这是一个要点 [00:06]。下一个要点 [00:24]。
- 不要把时间戳堆在回答末尾
- 引用网络内容时，使用标准 Markdown 链接格式：[网站标题](URL)
- 不要单独列出完整 URL
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
