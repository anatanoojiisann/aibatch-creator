import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { ReadResultManifestResult } from "@/lib/integrations/videofactory/videoFactoryTypes";
import { isRealMp4Url } from "@/lib/services/videoAssetValidation";

export async function parseVideoFactoryManifest(paths: {
  imageResultPath?: string;
  syncResultPath?: string;
  videoResultPath?: string;
  imageUrlMapPath?: string;
}): Promise<ReadResultManifestResult> {
  const items = new Map<string, ReadResultManifestResult["items"][number]>();

  if (paths.imageResultPath && existsSync(paths.imageResultPath)) {
    const data = await readJson(paths.imageResultPath);
    for (const submission of data.submissions || []) {
      const itemId = extractItemId(submission);
      if (!itemId) continue;
      upsert(items, itemId, {
        itemId,
        imageStatus: submission.ok === false ? "failed" : "submitted",
        errorCode: submission.ok === false ? "IMAGE_SUBMIT_FAILED" : undefined,
        errorMessage: submission.error || submission.message || submission.response?.message
      });
    }
  }

  if (paths.syncResultPath && existsSync(paths.syncResultPath)) {
    const data = await readJson(paths.syncResultPath);
    for (const filePath of data.downloadedFiles || []) {
      const itemId = String(filePath).match(/item[_-]\d{3,}/i)?.[0]?.replace("-", "_");
      if (!itemId) continue;
      upsert(items, itemId, { itemId, imageStatus: "ready_for_preview", imageLocalPath: filePath });
    }
  }

  if (paths.imageUrlMapPath && existsSync(paths.imageUrlMapPath)) {
    const data = await readJson(paths.imageUrlMapPath);
    for (const [key, value] of Object.entries(data)) {
      if (!/^item_\d+/.test(key)) continue;
      upsert(items, key, { itemId: key, imageStatus: "uploaded_public", imagePublicUrl: String(value) });
    }
  }

  if (paths.videoResultPath && existsSync(paths.videoResultPath)) {
    const data = await readJson(paths.videoResultPath);
    for (const submission of data.submissions || []) {
      const itemId = extractItemId(submission);
      if (!itemId) continue;
      const videoUrl = submission.response?.videoUrl || submission.response?.url || submission.videoUrl;
      upsert(items, itemId, {
        itemId,
        videoStatus: submission.ok === false ? "video_failed" : isRealMp4Url(videoUrl) ? "video_succeeded" : "waiting_for_real_video_output",
        videoJobId: submission.response?.providerJobId || submission.videoJobId,
        videoUrl,
        errorCode: submission.ok === false ? "VIDEO_SUBMIT_FAILED" : undefined,
        errorMessage: submission.error || submission.message || submission.response?.message
      });
    }
  }

  return { items: [...items.values()] };
}

function extractItemId(value: any): string | undefined {
  return value?.itemId
    || value?.metadata?.factory_item_id
    || value?.body?.metadata?.factory_item_id
    || String(value?.taskId || "").match(/item[_-]\d{3,}/i)?.[0]?.replace("-", "_");
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function upsert(items: Map<string, ReadResultManifestResult["items"][number]>, itemId: string, patch: ReadResultManifestResult["items"][number]) {
  items.set(itemId, { ...items.get(itemId), ...patch, itemId });
}
