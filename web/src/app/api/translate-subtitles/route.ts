import { NextRequest, NextResponse } from "next/server";
import { translationCache } from "@/lib/api-cache";
import { deepseekStreamCompletion } from "@/lib/deepseek-stream";

export const maxDuration = 60;

const BATCH_SIZE = 50;

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

  let content: string;
  try {
    content = await deepseekStreamCompletion(apiKey, {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(items.map(({ id, text }) => ({ id, text }))),
        },
      ],
      max_tokens: 4000,
    });
  } catch (e) {
    console.error("DeepSeek 请求失败:", e);
    throw new Error("翻译请求失败");
  }

  if (!content?.trim()) {
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
    const body = (await request.json().catch(() => null)) as
      | { subtitles?: SubtitleItem[]; videoId?: string }
      | null;

    const subtitles = body?.subtitles ?? [];
    const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : undefined;

    if (videoId && translationCache.has(videoId)) {
      return Response.json(translationCache.get(videoId));
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "缺少 DeepSeek API Key" }, { status: 500 });
    }

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

    const result = { translations: allTranslations };
    if (videoId) {
      translationCache.set(videoId, result);
    }
    return NextResponse.json(result);
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

