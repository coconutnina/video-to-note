import { NextRequest, NextResponse } from "next/server";

const BATCH_SIZE = 50;
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

interface SubtitleItem {
  id?: number;
  text: string;
  start: number;
  duration: number;
}

interface TranslateInputItem {
  id: number;
  text: string;
}

interface TranslateOutputItem {
  id: number;
  translated: string;
}

async function translateBatch(
  items: TranslateInputItem[],
  apiKey: string
): Promise<TranslateOutputItem[]> {
  const systemPrompt =
    "你是专业字幕翻译员。用户给你的每条字幕都带有编号（id字段）。请将每条字幕翻译成自然流畅的中文，返回JSON数组，每个元素必须包含 id 和 translated 两个字段。id 必须和输入完全一致，不能改变。只返回JSON，不要任何其他内容。";

  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(items.map(({ id, text }) => ({ id, text }))),
        },
      ],
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("DeepSeek 请求失败:", response.status, errText);
    throw new Error("翻译请求失败");
  }

  const data = await response.json().catch((e) => {
    console.error("DeepSeek JSON 解析失败:", e);
    return null;
  });
  const content: string | undefined =
    data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content;

  if (!content) {
    throw new Error("翻译结果为空");
  }

  let parsed: unknown;
  try {
    const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(cleanContent);
  } catch (e) {
    console.error("DeepSeek 返回内容 JSON.parse 失败:", e, content);
    throw new Error("翻译结果解析失败");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("翻译结果格式错误");
  }

  // 期望格式：[{ id: number, translated: string }, ...]
  const outputs: TranslateOutputItem[] = (parsed as any[])
    .filter(
      (item) =>
        item &&
        typeof item.id === "number" &&
        typeof item.translated === "string"
    )
    .map((item) => ({
      id: item.id as number,
      translated: item.translated as string,
    }));

  return outputs;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "缺少 DeepSeek API Key" }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as
      | { subtitles?: SubtitleItem[] }
      | null;

    const subtitles = body?.subtitles ?? [];
    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    const allTranslations: TranslateOutputItem[] = [];

    for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
      const batch = subtitles.slice(i, i + BATCH_SIZE);
      const items: TranslateInputItem[] = batch.map((s, localIdx) => ({
        id:
          typeof s.id === "number"
            ? s.id
            : i + localIdx, // 如果没传 id，就用全局索引兜底
        text: s.text ?? "",
      }));
      const translations = await translateBatch(items, apiKey);
      allTranslations.push(...translations);
    }

    return NextResponse.json({ translations: allTranslations });
  } catch (error) {
    console.error("字幕翻译失败:", error);
    return NextResponse.json(
      { error: "翻译失败" },
      {
        status: 500,
      }
    );
  }
}

