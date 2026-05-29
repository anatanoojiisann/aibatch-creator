import { NextResponse } from "next/server";
import { loadBatch, saveBatch } from "@/lib/services/batchService";
import { sendSuccessfulVideosToWatermark } from "@/lib/services/watermarkConnector";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const withMockVideo = body.mockSuccess === true
      ? await saveBatch({
        ...batch,
        status: "video_ready",
        items: batch.items.map((item, index) => index === 0
          ? {
            ...item,
            generation: {
              ...item.generation,
              status: "video_succeeded" as const,
              videoJobId: item.generation.videoJobId || `mock_video_${item.id}`,
              videoUrl: item.generation.videoUrl || `https://your-domain.example/videos/${batch.id}/${item.id}.mp4`
            }
          }
          : item)
      })
      : batch;
    const updated = await sendSuccessfulVideosToWatermark(withMockVideo, body.mock !== false);
    return NextResponse.json({ ok: true, batch: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
