import { NextRequest, NextResponse } from "next/server";
import { translationCache } from "@/lib/api-cache";
import { deepseekStreamCompletion } from "@/lib/deepseek-stream";
import { getTranslationCache } from "@/lib/supabase-cache";

export const maxDuration = 60;

const BATCH_SIZE = 10;

interface SubtitleItem {
  id: number;
  text: string;
}

function translationRecordToArray(
  translations: Record<number, string>
): { id: number; translated: string }[] {
  return Object.entries(translations)
    .map(([id, translated]) => ({ id: Number(id), translated }))
    .filter((x) => Number.isFinite(x.id))
    .sort((a, b) => a.id - b.id);
}

const systemPrompt = `你是专业字幕翻译员。
输入是编号的英文句子列表，将每句翻译成自然流畅的中文。
输出格式完全一致：每行 "{序号}. {译文}"，行数必须和输入完全相同，不能合并或跳过任何一行。只输出翻译结果，不要其他内容。`;

async function translateBatch(
  items: SubtitleItem[],
  apiKey: string
): Promise<{ id: number; translated: string }[]> {
  if (items.length === 0) {
    return [];
  }

  const userPayload = items.map((x, idx) => `${idx + 1}. ${x.text}`).join("\n");

  let content: string;
  try {
    content = await deepseekStreamCompletion(apiKey, {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userPayload,
        },
      ],
      max_tokens: 8000,
    });
  } catch (e) {
    console.error("DeepSeek 请求失败:", e);
    throw new Error("翻译请求失败");
  }

  const raw = (content ?? "").trim();
  if (!raw) {
    console.warn("DeepSeek 翻译结果为空，已用空字符串补齐");
    return items.map((i) => ({ id: i.id, translated: "" }));
  }

  const byId = new Map<number, string>();
  for (const item of items) {
    byId.set(item.id, "");
  }

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);
    if (!match) {
      continue;
    }
    const localIndex = Number(match[1]);
    if (!Number.isFinite(localIndex) || localIndex < 1 || localIndex > items.length) {
      continue;
    }
    const translated = match[2];
    byId.set(items[localIndex - 1].id, translated);
  }

  return items.map((it) => ({
    id: it.id,
    translated: byId.get(it.id) ?? "",
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { subtitles?: Partial<SubtitleItem>[]; videoId?: string }
      | null;

    const subtitles = body?.subtitles ?? [];
    const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : undefined;

    if (videoId && translationCache.has(videoId)) {
      return Response.json(translationCache.get(videoId));
    }

    if (videoId) {
      const shared = await getTranslationCache(videoId);
      if (shared) {
        const cachedResult = {
          translations: translationRecordToArray(shared),
        };
        translationCache.set(videoId, cachedResult);
        return NextResponse.json(cachedResult);
      }
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "缺少 DeepSeek API Key" }, { status: 500 });
    }

    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    const allTranslations: { id: number; translated: string }[] = [];

    for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
      const batch = subtitles.slice(i, i + BATCH_SIZE);
      const items: SubtitleItem[] = batch.map((s, j) => ({
        id: typeof s.id === "number" ? s.id : i + j,
        text: (s.text as string) ?? "",
      }));
      const batchTranslations = await translateBatch(items, apiKey);
      allTranslations.push(...batchTranslations);
    }

    const missingItems: SubtitleItem[] = allTranslations
      .filter((x) => x.translated === "")
      .map((x) => ({
        id: x.id,
        text:
          (
            subtitles.find(
              (s, idx) =>
                (typeof s.id === "number" ? s.id : idx) === x.id
            )?.text as string
          ) ?? "",
      }));
    if (missingItems.length > 0) {
      try {
        const retryTranslations = await translateBatch(missingItems, apiKey);
        const retryMap = new Map(retryTranslations.map((x) => [x.id, x.translated]));
        for (const item of allTranslations) {
          if (retryMap.has(item.id)) {
            item.translated = retryMap.get(item.id) ?? "";
          }
        }
      } catch {
        // 重试失败时保留原有空字符串
      }
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
