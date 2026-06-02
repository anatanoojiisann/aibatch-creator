import { writeFile } from "node:fs/promises";
import path from "node:path";
import { batchDir, saveBatch } from "@/lib/services/batchService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { isRealPublicHttpsUrl, realPublicImageUrlMessage } from "@/lib/services/videoAssetValidation";

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

export async function generateImageUrlMap(
  batch: VideoBatch,
  publicImageUrlOverrides: Record<string, string> = {}
): Promise<{ batch: VideoBatch } & ImageUrlMapResult> {
  const overridden = applyPublicImageUrlOverrides(batch, publicImageUrlOverrides);
  const itemMap = Object.fromEntries(overridden.items
    .filter((item) => item.referenceImage.publicUrl)
    .map((item) => [item.id, item.referenceImage.publicUrl as string]));
  const personaMap = Object.fromEntries(overridden.items
    .filter((item) => item.persona && item.referenceImage.publicUrl)
    .map((item) => [item.persona as string, item.referenceImage.publicUrl as string]));
  const firstCustom = overridden.items.find((item) => !item.persona && item.referenceImage.publicUrl);
  const map = { ...(firstCustom?.referenceImage.publicUrl ? { custom: firstCustom.referenceImage.publicUrl } : {}), ...personaMap, ...itemMap };
  const imageUrlMapPath = path.join(batchDir(overridden.id), "image-url-map.json");
  await writeFile(imageUrlMapPath, `${JSON.stringify(map, null, 2)}\n`);
  const updated = await saveBatch({
    ...overridden,
    videoFactory: { ...overridden.videoFactory, imageUrlMapPath }
  });
  return { batch: updated, imageUrlMapPath, map };
}

function applyPublicImageUrlOverrides(batch: VideoBatch, overrides: Record<string, string>): VideoBatch {
  const normalizedOverrides = Object.fromEntries(Object.entries(overrides)
    .map(([itemId, value]) => [itemId, String(value || "").trim()])
    .filter(([, value]) => Boolean(value))) as Record<string, string>;
  for (const [itemId, publicUrl] of Object.entries(normalizedOverrides)) {
    if (!batch.items.some((item) => item.id === itemId)) {
      throw new Error(`Unknown item for public image URL override: ${itemId}`);
    }
    if (!isRealPublicHttpsUrl(publicUrl)) {
      throw new Error(realPublicImageUrlMessage);
    }
  }
  return {
    ...batch,
    status: Object.keys(normalizedOverrides).length > 0 ? "image_public_url_ready" : batch.status,
    items: batch.items.map((item) => {
      const publicUrl = normalizedOverrides[item.id];
      if (!publicUrl) return item;
      return {
        ...item,
        referenceImage: { ...item.referenceImage, status: "uploaded_public" as const, publicUrl },
        generation: { ...item.generation, status: "ready_for_video" as const }
      };
    })
  };
}
