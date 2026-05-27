import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { VideoFactoryReadManifestResult } from "./videoFactoryTypes";

export async function parseVideoFactoryResults(paths: {
  imageResultPath?: string;
  syncResultPath?: string;
  videoResultPath?: string;
  imageUrlMapPath?: string;
}): Promise<VideoFactoryReadManifestResult> {
  const items = new Map<string, VideoFactoryReadManifestResult["items"][number]>();

  if (paths.imageResultPath && existsSync(paths.imageResultPath)) {
    const imageResult = await readJson(paths.imageResultPath);
    for (const submission of imageResult.submissions || []) {
      const itemId = extractItemId(submission) || String(submission.taskId || "");
      if (!itemId) continue;
      upsert(items, itemId, {
        itemId,
        imageStatus: submission.ok === false ? "failed" : submission.dryRun ? "submitted" : "submitted",
        imageJobId: submission.response?.providerJobId,
        errorCode: submission.ok === false ? "IMAGE_SUBMIT_FAILED" : undefined,
        errorMessage: submission.error || submission.message || submission.response?.message,
      });
    }
  }

  if (paths.syncResultPath && existsSync(paths.syncResultPath)) {
    const syncResult = await readJson(paths.syncResultPath);
    for (const synced of syncResult.synced || []) {
      const files = await listFiles(path.dirname(synced.zipPath || paths.syncResultPath));
      for (const file of files.filter((filePath) => /\.(png|jpe?g|webp)$/i.test(filePath))) {
        const itemId = findItemIdInPath(file);
        if (!itemId) continue;
        upsert(items, itemId, {
          itemId,
          imageStatus: "ready_for_preview",
          imageLocalPath: file,
        });
      }
    }
  }

  if (paths.imageUrlMapPath && existsSync(paths.imageUrlMapPath)) {
    const urlMap = await readJson(paths.imageUrlMapPath);
    for (const [itemId, imagePublicUrl] of Object.entries(urlMap)) {
      if (!/^item_\d+/.test(itemId)) continue;
      upsert(items, itemId, {
        itemId,
        imageStatus: "uploaded_public",
        imagePublicUrl: String(imagePublicUrl),
      });
    }
  }

  if (paths.videoResultPath && existsSync(paths.videoResultPath)) {
    const videoResult = await readJson(paths.videoResultPath);
    for (const submission of videoResult.submissions || []) {
      const itemId = extractItemId(submission) || String(submission.taskId || "");
      if (!itemId) continue;
      const videoUrl = submission.response?.videoUrl || submission.response?.url || submission.response?.outputUrl;
      upsert(items, itemId, {
        itemId,
        videoStatus: submission.ok === false ? "video_failed" : videoUrl ? "video_succeeded" : "video_generating",
        videoJobId: submission.response?.providerJobId || submission.response?.id,
        videoUrl,
        errorCode: submission.ok === false ? "VIDEO_SUBMIT_FAILED" : undefined,
        errorMessage: submission.error || submission.message || submission.response?.message,
      });
    }
  }

  return { items: [...items.values()] };
}

export function extractItemId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, any>;
  return record.itemId
    || record.metadata?.factory_item_id
    || record.body?.metadata?.factory_item_id
    || record.response?.metadata?.factory_item_id;
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function upsert(
  items: Map<string, VideoFactoryReadManifestResult["items"][number]>,
  itemId: string,
  patch: VideoFactoryReadManifestResult["items"][number],
): void {
  items.set(itemId, { ...items.get(itemId), ...patch, itemId });
}

async function listFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const current = await stat(root);
  if (current.isFile()) return [root];
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => listFiles(path.join(root, entry.name))));
  return files.flat();
}

function findItemIdInPath(filePath: string): string | undefined {
  return filePath.match(/item[_-](\d{3,})/i)?.[0].replace("-", "_");
}
