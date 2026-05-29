import { writeFile } from "node:fs/promises";
import path from "node:path";
import { batchDir, saveBatch } from "@/lib/services/batchService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

export type PublicUploadResult = {
  ok: boolean;
  uploaded: Array<{ itemId: string; publicUrl: string }>;
  failed: Array<{ itemId: string; error: string }>;
};

export type ImageUrlMapResult = {
  imageUrlMapPath: string;
  map: Record<string, string>;
};

export async function uploadApprovedImages(batch: VideoBatch): Promise<{ batch: VideoBatch } & PublicUploadResult> {
  const baseUrl = (process.env.PUBLIC_ASSET_BASE_URL || "https://your-domain.example/assets").replace(/\/$/, "");
  const uploaded: Array<{ itemId: string; publicUrl: string }> = [];
  const failed: Array<{ itemId: string; error: string }> = [];
  for (const item of batch.items) {
    if (item.referenceImage.status !== "approved") continue;
    uploaded.push({
      itemId: item.id,
      publicUrl: `${baseUrl}/${encodeURIComponent(batch.id)}/${encodeURIComponent(item.id)}.png`
    });
  }
  const updated = await saveBatch({
    ...batch,
    status: uploaded.length > 0 ? "image_public_url_ready" : batch.status,
    items: batch.items.map((item) => {
      const match = uploaded.find((entry) => entry.itemId === item.id);
      if (!match) return item;
      return {
        ...item,
        referenceImage: { ...item.referenceImage, status: "uploaded_public", publicUrl: match.publicUrl },
        generation: { ...item.generation, status: "ready_for_video" }
      };
    })
  });
  return { batch: updated, ok: failed.length === 0, uploaded, failed };
}

export async function generateImageUrlMap(batch: VideoBatch): Promise<{ batch: VideoBatch } & ImageUrlMapResult> {
  const itemMap = Object.fromEntries(batch.items
    .filter((item) => item.referenceImage.publicUrl)
    .map((item) => [item.id, item.referenceImage.publicUrl as string]));
  const personaMap = Object.fromEntries(batch.items
    .filter((item) => item.persona && item.referenceImage.publicUrl)
    .map((item) => [item.persona as string, item.referenceImage.publicUrl as string]));
  const firstCustom = batch.items.find((item) => !item.persona && item.referenceImage.publicUrl);
  const map = { ...(firstCustom?.referenceImage.publicUrl ? { custom: firstCustom.referenceImage.publicUrl } : {}), ...personaMap, ...itemMap };
  const imageUrlMapPath = path.join(batchDir(batch.id), "image-url-map.json");
  await writeFile(imageUrlMapPath, `${JSON.stringify(map, null, 2)}\n`);
  const updated = await saveBatch({
    ...batch,
    videoFactory: { ...batch.videoFactory, imageUrlMapPath }
  });
  return { batch: updated, imageUrlMapPath, map };
}
