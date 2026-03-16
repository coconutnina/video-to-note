import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";
const MAX_HISTORY_ROUNDS = 10;
const MAX_TRANSCRIPT_CONTEXT = 10000;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      question?: string;
      transcript?: { text: string; start: number }[];
      history?: { role: "user" | "assistant"; content: string }[];
      mode?: "video" | "search";
    } | null;

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    const mode = body?.mode === "search" ? "search" : "video";

    if (!question) {
      return NextResponse.json({ error: "缺少 question" }, { status: 400 });
    }

    const transcriptContext = transcript
      .map((s) => `[${formatTime(s.start)}] ${s.text}`)
      .join("\n")
      .substring(0, MAX_TRANSCRIPT_CONTEXT);

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
        ? `你是一个视频学习助手。回答时优先基于视频字幕内容，必要时结合网络搜索结果补充。
回答结构：
1. 正文回答
2. 如果答案来自视频，在末尾加：📍 视频来源：[MM:SS]（从字幕时间戳提取）
3. 如果用了网络搜索，在末尾加：🔗 网络来源：[网站名](URL)
回答语言：中文`
        : `你是一个视频学习助手。只基于以下视频字幕内容回答问题，不要使用外部知识。
如果视频中没有提及，直接说「视频中未提及此内容」。
回答末尾加：📍 视频来源：[MM:SS]（从字幕时间戳提取）
回答语言：中文`;

    const history = rawHistory.slice(-MAX_HISTORY_ROUNDS * 2);

    const messages: { role: string; content: string }[] = [
      {
        role: "system",
        content:
          systemPrompt +
          `\n\n视频字幕：\n${transcriptContext}` +
          (searchContext ? `\n\n网络搜索结果：\n${searchContext}` : ""),
      },
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
