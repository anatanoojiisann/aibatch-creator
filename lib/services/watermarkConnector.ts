import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { saveBatch } from "@/lib/services/batchService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { isRealMp4Url } from "@/lib/services/videoAssetValidation";

export async function sendSuccessfulVideosToWatermark(batch: VideoBatch, mock = true): Promise<VideoBatch> {
  const items = await Promise.all(batch.items.map(async (item) => {
    if (!hasRealGeneratedVideoAsset(item)) return item;
    const videoUrl = item.generation.videoUrl || item.generation.previewUrl;
    if (!videoUrl) return item;
    try {
      const processedVideoUrl = mock
        ? `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}watermark=removed`
        : await requestWatermarkRemoval(videoUrl);
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
  const hasVideo = items.some(hasRealGeneratedVideoAsset);
  const hasWatermarkDone = items.some((item) => item.postProcessing.watermarkStatus === "done");
  return saveBatch({ ...batch, status: hasVideo && hasWatermarkDone ? "completed" : batch.status, items });
}

export function hasRealGeneratedVideoAsset(item: VideoBatch["items"][number]): boolean {
  if (item.generation.status !== "video_succeeded") return false;
  if (isRealMp4Url(item.generation.videoUrl)) return true;
  const localPath = item.generation.localPath;
  return Boolean(localPath
    && path.extname(localPath).toLowerCase() === ".mp4"
    && existsSync(localPath)
    && statSync(localPath).size > 0);
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
