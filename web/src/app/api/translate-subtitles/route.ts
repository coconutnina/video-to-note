import { NextRequest, NextResponse } from "next/server";
import { translationCache } from "@/lib/api-cache";
import { deepseekStreamCompletion } from "@/lib/deepseek-stream";

export const maxDuration = 60;

const BATCH_SIZE = 20;

interface SubtitleItem {
  id: number;
  text: string;
}

const systemPrompt = `你是专业字幕翻译员。
输入是 JSON 数组，每条是一个完整句子。
将每条翻译成自然流畅的中文。
输出 JSON 数组，每个元素格式：{"id": 原id, "translated": "译文"}
条数必须和输入完全一致。只返回 JSON，不要其他内容。`;

async function translateBatch(
  items: SubtitleItem[],
  apiKey: string
): Promise<{ id: number; translated: string }[]> {
  if (items.length === 0) {
    return [];
  }

  const userPayload = items.map((x) => ({ id: x.id, text: x.text }));

  let content: string;
  try {
    content = await deepseekStreamCompletion(apiKey, {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
      max_tokens: 8000,
    });
  } catch (e) {
    console.error("DeepSeek 请求失败:", e);
    throw new Error("翻译请求失败");
  }

  const raw = (content ?? "")
    .replace(/```json\n?|\n?```/g, "")
    .trim();

  // 修复 JSON 字符串值内的非法字符
  // 策略：仅清理 translated 字段的值内容，不影响其它字段
  const fixedRaw = raw.replace(
    /"translated"\s*:\s*"([\s\S]*?)(?<!\\)"/g,
    (match, value: string) => {
      const cleaned = value
        .replace(/\\/g, "\\\\") // 先转义已有的反斜杠
        .replace(/"/g, '\\"') // 转义引号
        .replace(/\n/g, "\\n") // 转义换行
        .replace(/\r/g, "\\r") // 转义回车
        .replace(/\t/g, "\\t") // 转义制表符
        .replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
          ""
        ); // 删除其他控制字符
      return `"translated": "${cleaned}"`;
    }
  );
  if (!raw) {
    console.warn("DeepSeek 翻译结果为空，已用空字符串补齐");
    return items.map((i) => ({ id: i.id, translated: "" }));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fixedRaw);
  } catch (e) {
    console.warn("JSON 解析失败，尝试逐条提取:", e);
    const fallback: { id: number; translated: string }[] = [];
    const pattern =
      /"id"\s*:\s*(\d+)\s*,\s*"translated"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    for (const m of fixedRaw.matchAll(pattern)) {
      fallback.push({ id: Number(m[1]), translated: m[2] });
    }
    if (fallback.length > 0) {
      const map = new Map(fallback.map((f) => [f.id, f.translated]));
      return items.map((i) => ({
        id: i.id,
        translated: map.get(i.id) ?? "",
      }));
    }
    return items.map((i) => ({ id: i.id, translated: "" }));
  }

  if (!Array.isArray(parsed)) {
    console.warn("翻译结果非数组，已按 id 补空");
    return items.map((i) => ({ id: i.id, translated: "" }));
  }

  const byId = new Map<number, string>();
  for (const el of parsed) {
    if (
      el != null &&
      typeof el === "object" &&
      typeof (el as { id?: unknown }).id === "number" &&
      typeof (el as { translated?: unknown }).translated === "string"
    ) {
      byId.set(
        (el as { id: number }).id,
        (el as { translated: string }).translated
      );
    }
  }

  if (byId.size !== items.length) {
    console.warn(
      "翻译结果条数与输入不一致，已按 id 截断或补空:",
      byId.size,
      "vs",
      items.length
    );
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
