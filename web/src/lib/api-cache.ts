/**
 * 使用 globalThis 保存缓存，避免 Next.js 开发模式下路由热重载时清空，
 * 使同一 videoId 的字幕与翻译在刷新后仍能命中缓存。
 */

export interface CachedTranscript {
  transcript: { text: string; start: number; duration: number }[];
}

export interface CachedTranslation {
  translations: { id: number; translated: string }[];
}

const g = globalThis as unknown as {
  __transcriptCache?: Map<string, CachedTranscript>;
  __translationCache?: Map<string, CachedTranslation>;
};

export const transcriptCache =
  g.__transcriptCache ?? (g.__transcriptCache = new Map<string, CachedTranscript>());

export const translationCache =
  g.__translationCache ?? (g.__translationCache = new Map<string, CachedTranslation>());
