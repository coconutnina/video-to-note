import type { FlowEdge, FlowNode } from "@/lib/mindmap";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type TranscriptItem = { text: string; start: number; duration: number };
export type VideoMetadata = {
  title: string;
  channelTitle: string;
  durationSeconds: number;
};

const MINDMAP_VERSION = "v2";
const TRANSLATION_VERSION = "v1";

export async function getTranscriptCache(
  videoId: string
): Promise<TranscriptItem[] | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("video_transcripts")
      .select("transcript")
      .eq("video_id", videoId)
      .maybeSingle();
    if (!data?.transcript || !Array.isArray(data.transcript)) return null;
    return data.transcript as TranscriptItem[];
  } catch (error) {
    console.warn("supabase transcript cache read failed", error);
    return null;
  }
}

export async function setTranscriptCache(
  videoId: string,
  transcript: TranscriptItem[]
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("video_transcripts").upsert(
      { video_id: videoId, transcript },
      { onConflict: "video_id", ignoreDuplicates: true }
    );
  } catch (error) {
    console.warn("supabase transcript cache write failed", error);
  }
}

export async function getTranslationCache(
  videoId: string
): Promise<Record<number, string> | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("video_translations")
      .select("translations")
      .eq("video_id", videoId)
      .eq("translation_version", TRANSLATION_VERSION)
      .maybeSingle();
    if (!data?.translations || typeof data.translations !== "object") return null;
    return data.translations as Record<number, string>;
  } catch (error) {
    console.warn("supabase translation cache read failed", error);
    return null;
  }
}

export async function setTranslationCache(
  videoId: string,
  translations: Record<number, string>
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("video_translations").upsert(
      {
        video_id: videoId,
        translations,
        translation_version: TRANSLATION_VERSION,
      },
      { onConflict: "video_id" }
    );
    if (error) console.warn("supabase translation cache write failed", error);
  } catch (error) {
    console.warn("supabase translation cache write failed", error);
  }
}

export async function getMindmapCache(
  videoId: string
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] } | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("video_mindmaps")
      .select("mindmap")
      .eq("video_id", videoId)
      .is("user_id", null)
      .eq("mindmap_version", MINDMAP_VERSION)
      .limit(1)
      .maybeSingle();
    const mindmap = data?.mindmap as { nodes?: FlowNode[]; edges?: FlowEdge[] } | null;
    if (!mindmap?.nodes || !mindmap?.edges) return null;
    return { nodes: mindmap.nodes, edges: mindmap.edges };
  } catch (error) {
    console.warn("supabase mindmap cache read failed", error);
    return null;
  }
}

export async function setMindmapCache(
  videoId: string,
  mindmap: { nodes: FlowNode[]; edges: FlowEdge[] }
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("video_mindmaps")
      .select("id")
      .eq("video_id", videoId)
      .is("user_id", null)
      .eq("mindmap_version", MINDMAP_VERSION)
      .maybeSingle();
    if (existing) return;
    const { error } = await supabase.from("video_mindmaps").insert({
      video_id: videoId,
      user_id: null,
      mindmap,
      mindmap_version: MINDMAP_VERSION,
    });
    if (error) console.warn("supabase mindmap cache write failed", error);
  } catch (error) {
    console.warn("supabase mindmap cache write failed", error);
  }
}

export async function getMetadataCache(
  videoId: string
): Promise<VideoMetadata | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("video_metadata")
      .select("title, channel_title, duration_seconds")
      .eq("video_id", videoId)
      .maybeSingle();
    if (!data || !data.title) return null;
    return {
      title: data.title as string,
      channelTitle:
        typeof data.channel_title === "string" ? data.channel_title : "",
      durationSeconds:
        typeof data.duration_seconds === "number" ? data.duration_seconds : 0,
    };
  } catch (error) {
    console.warn("supabase metadata cache read failed", error);
    return null;
  }
}

export async function setMetadataCache(
  videoId: string,
  metadata: VideoMetadata
): Promise<void> {
  try {
    if (!metadata.title) return;
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("video_metadata")
      .select("video_id")
      .eq("video_id", videoId)
      .maybeSingle();
    if (existing) return;
    const { error } = await supabase.from("video_metadata").insert({
      video_id: videoId,
      title: metadata.title,
      channel_title: metadata.channelTitle,
      duration_seconds: metadata.durationSeconds,
    });
    if (error) console.warn("supabase metadata cache write failed", error);
  } catch (error) {
    console.warn("supabase metadata cache write failed", error);
  }
}
