import { NextResponse } from "next/server";
import { createVideoFactoryAdapter } from "@/integrations/videofactory/videoFactoryAdapter";
import { applyVideoFactoryManifest } from "@/integrations/videofactory/videoFactoryMapper";
import { loadBatch, saveBatch } from "@/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    if (body.mockSuccess === true) {
      const updated = await saveBatch({
        ...batch,
        status: "video_ready",
        items: batch.items.map((item) => item.generation.status === "video_submitted" || item.generation.status === "video_generating"
          ? {
            ...item,
            generation: {
              ...item.generation,
              status: "video_succeeded" as const,
              videoJobId: item.generation.videoJobId || `mock_video_${item.id}`,
              videoUrl: item.generation.videoUrl || `https://your-domain.example/videos/${batch.id}/${item.id}.mp4`,
            },
          }
          : item),
      });
      return NextResponse.json({ ok: true, batch: updated });
    }
    const manifest = await createVideoFactoryAdapter().readResultManifest(batch);
    const updated = await saveBatch(applyVideoFactoryManifest(batch, manifest));
    return NextResponse.json({ ok: true, batch: updated, manifest });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
