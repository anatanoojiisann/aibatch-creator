import { saveBatch } from "@/services/batchService";
import { VideoBatch } from "@/schemas/videoBatch.schema";

export type WatermarkMode = "extra_fast" | "balance" | "quality";

export async function sendBatchToWatermark(batch: VideoBatch, mode: WatermarkMode = "extra_fast", mock = true): Promise<VideoBatch> {
  const items = await Promise.all(batch.items.map(async (item) => {
    if (item.generation.status !== "video_succeeded" || !item.generation.videoUrl) {
      return item;
    }
    try {
      const processedVideoUrl = mock
        ? `${item.generation.videoUrl}${item.generation.videoUrl.includes("?") ? "&" : "?"}watermark=removed&mode=${mode}`
        : await sendVideo(item.generation.videoUrl, mode);
      return {
        ...item,
        postProcessing: {
          ...item.postProcessing,
          watermarkStatus: "done" as const,
          watermarkMode: mode,
          processedVideoUrl,
        },
      };
    } catch (error) {
      return {
        ...item,
        postProcessing: {
          ...item.postProcessing,
          watermarkStatus: "failed" as const,
          watermarkMode: mode,
          errorCode: "WATERMARK_FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown watermark failure",
        },
      };
    }
  }));

  const hasPending = items.some((item) => item.generation.status === "video_succeeded" && item.postProcessing.watermarkStatus !== "done");
  return saveBatch({
    ...batch,
    status: hasPending ? "watermark_processing" : "completed",
    items,
  });
}

async function sendVideo(videoUrl: string, mode: WatermarkMode): Promise<string> {
  const serviceUrl = process.env.WATERMARK_SERVICE_URL;
  if (!serviceUrl) {
    throw new Error("WATERMARK_SERVICE_URL is not configured.");
  }
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/remove-watermark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl, mode }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.processedVideoUrl) {
    throw new Error(data.error || data.message || `Watermark service returned HTTP ${response.status}`);
  }
  return String(data.processedVideoUrl);
}
