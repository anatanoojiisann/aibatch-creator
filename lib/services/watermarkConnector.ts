import { saveBatch } from "@/lib/services/batchService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

export async function sendSuccessfulVideosToWatermark(batch: VideoBatch, mock = true): Promise<VideoBatch> {
  const items = await Promise.all(batch.items.map(async (item) => {
    if (item.generation.status !== "video_succeeded" || !item.generation.videoUrl) return item;
    try {
      const processedVideoUrl = mock
        ? `${item.generation.videoUrl}${item.generation.videoUrl.includes("?") ? "&" : "?"}watermark=removed`
        : await requestWatermarkRemoval(item.generation.videoUrl);
      return {
        ...item,
        postProcessing: {
          ...item.postProcessing,
          watermarkStatus: "done" as const,
          processedVideoUrl
        }
      };
    } catch (error) {
      return {
        ...item,
        postProcessing: {
          ...item.postProcessing,
          watermarkStatus: "failed" as const,
          errorCode: "WATERMARK_FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown watermark error"
        }
      };
    }
  }));
  return saveBatch({ ...batch, status: "completed", items });
}

async function requestWatermarkRemoval(videoUrl: string): Promise<string> {
  const serviceUrl = process.env.WATERMARK_SERVICE_URL;
  if (!serviceUrl) throw new Error("WATERMARK_SERVICE_URL is not configured.");
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/remove-watermark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl, mode: "extra_fast" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.processedVideoUrl) {
    throw new Error(data.message || data.error || `Watermark service returned HTTP ${response.status}`);
  }
  return String(data.processedVideoUrl);
}
