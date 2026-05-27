import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchRunDir, saveBatch } from "@/services/batchService";
import { VideoBatch } from "@/schemas/videoBatch.schema";

export type PublicAssetUploadResult = {
  ok: boolean;
  imageUrlMapPath: string;
  uploaded: Array<{ itemId: string; publicUrl: string }>;
  failed: Array<{ itemId: string; error: string }>;
};

export async function uploadPublicImages(batch: VideoBatch): Promise<PublicAssetUploadResult> {
  const provider = process.env.PUBLIC_ASSET_PROVIDER || "mock";
  const baseUrl = (process.env.PUBLIC_ASSET_BASE_URL || "https://your-domain.example/assets").replace(/\/$/, "");
  const uploaded: Array<{ itemId: string; publicUrl: string }> = [];
  const failed: Array<{ itemId: string; error: string }> = [];

  for (const item of batch.items) {
    if (item.referenceImage.status !== "approved") {
      continue;
    }
    if (!item.referenceImage.localPath && provider !== "mock") {
      failed.push({ itemId: item.id, error: "Missing local image path for non-mock upload." });
      continue;
    }
    uploaded.push({
      itemId: item.id,
      publicUrl: `${baseUrl}/${encodeURIComponent(batch.id)}/${encodeURIComponent(item.id)}.png`,
    });
  }

  const itemMap = Object.fromEntries(uploaded.map((entry) => [entry.itemId, entry.publicUrl]));
  const personaMap = Object.fromEntries(batch.items
    .filter((item) => item.persona && itemMap[item.id])
    .map((item) => [item.persona as string, itemMap[item.id]]));
  const imageUrlMapPath = path.join(batchRunDir(batch.id), "image-url-map.json");
  await mkdir(path.dirname(imageUrlMapPath), { recursive: true });
  await writeFile(imageUrlMapPath, `${JSON.stringify({ ...personaMap, ...itemMap }, null, 2)}\n`);

  await saveBatch({
    ...batch,
    status: uploaded.length > 0 ? "image_public_url_ready" : batch.status,
    videoFactory: {
      ...batch.videoFactory,
      imageUrlMapPath,
    },
    items: batch.items.map((item) => {
      const found = uploaded.find((entry) => entry.itemId === item.id);
      if (!found) return item;
      return {
        ...item,
        referenceImage: {
          ...item.referenceImage,
          status: "uploaded_public",
          publicUrl: found.publicUrl,
        },
        generation: {
          ...item.generation,
          status: "ready_for_video",
        },
      };
    }),
  });

  return { ok: failed.length === 0, imageUrlMapPath, uploaded, failed };
}
