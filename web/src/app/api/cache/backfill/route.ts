import { NextRequest, NextResponse } from "next/server";
import type { FlowEdge, FlowNode } from "@/lib/mindmap";
import {
  getMetadataCache,
  getMindmapCache,
  getTranslationCache,
  setMetadataCache,
  setMindmapCache,
  setTranslationCache,
  type VideoMetadata,
} from "@/lib/supabase-cache";

type BackfillBody =
  | {
      type: "mindmap";
      videoId: string;
      data: { nodes: FlowNode[]; edges: FlowEdge[] };
    }
  | {
      type: "translations";
      videoId: string;
      data: Record<number, string>;
    }
  | {
      type: "metadata";
      videoId: string;
      data: VideoMetadata;
    };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as BackfillBody | null;
    const videoId =
      typeof body?.videoId === "string" ? body.videoId.trim() : "";
    if (!body || !videoId) {
      return NextResponse.json({ ok: true });
    }

    if (body.type === "mindmap") {
      const cached = await getMindmapCache(videoId);
      if (!cached) {
        await setMindmapCache(videoId, body.data);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.type === "translations") {
      const cached = await getTranslationCache(videoId);
      if (!cached) {
        await setTranslationCache(videoId, body.data);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.type === "metadata") {
      const cached = await getMetadataCache(videoId);
      if (!cached) {
        await setMetadataCache(videoId, body.data);
      }
      return NextResponse.json({ ok: true });
    }
  } catch {
    // Silent by design
  }

  return NextResponse.json({ ok: true });
}
