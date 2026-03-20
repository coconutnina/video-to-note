/** DeepSeek Chat Completions 流式响应（SSE）拼接为完整文本 */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function tryAppendDelta(
  jsonStr: string,
  fullContent: { value: string }
): boolean {
  if (jsonStr === "[DONE]") return true;
  try {
    const parsed = JSON.parse(jsonStr) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
    };
    const delta =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content;
    if (delta) fullContent.value += delta;
  } catch {
    /* 半行或非法 JSON，等待更多 chunk */
  }
  return false;
}

async function collectStreamFullContent(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("DeepSeek 流式响应无 body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const fullContent = { value: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 最后一行可能不完整，留到下次

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "").trimEnd();
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (tryAppendDelta(jsonStr, fullContent)) {
        return fullContent.value;
      }
    }
  }

  // 流结束：刷出 TextDecoder 内部残留字节
  buffer += decoder.decode();

  const tailLines = buffer.split("\n");
  for (const rawLine of tailLines) {
    const line = rawLine.replace(/\r$/, "").trimEnd();
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (tryAppendDelta(jsonStr, fullContent)) {
      return fullContent.value;
    }
  }

  return fullContent.value;
}

/**
 * 使用原生 fetch 调用 DeepSeek（stream: true），返回拼接后的完整 assistant 文本。
 */
export async function deepseekStreamCompletion(
  apiKey: string,
  payload: Record<string, unknown>
): Promise<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...payload,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${res.status} ${errText}`);
  }

  return collectStreamFullContent(res);
}
