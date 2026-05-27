import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, mirrorResultFile } from "@/integrations/videofactory/videoFactoryAdapter";
import { batchRunDir, loadBatch, saveBatch } from "@/services/batchService";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    await saveBatch({ ...batch, status: "image_syncing" });

    if (body.mock !== false) {
      const outputDir = path.join(batchRunDir(batch.id), "video-factory-output");
      await mkdir(outputDir, { recursive: true });
      const items = await Promise.all(batch.items.map(async (item) => {
        const filePath = path.join(outputDir, `${item.id}.png`);
        await writeFile(filePath, tinyPng);
        return {
          ...item,
          referenceImage: {
            ...item.referenceImage,
            status: "ready_for_preview" as const,
            localPath: filePath,
            previewUrl: `/api/video-batches/import?path=${encodeURIComponent(filePath)}`,
          },
        };
      }));
      const updated = await saveBatch({
        ...batch,
        status: "image_ready_for_preview",
        videoFactory: { ...batch.videoFactory, outputDir },
        items,
      });
      const manifestPath = path.join(batchRunDir(batch.id), "video_factory_sync_result.json");
      await writeFile(manifestPath, `${JSON.stringify({ mock: true, outputDir, downloadedFiles: items.map((item) => item.referenceImage.localPath) }, null, 2)}\n`);
      return NextResponse.json({ ok: true, batch: updated, outputDir });
    }

    if (body.deleteRemote === true && body.confirmDeleteRemote !== true) {
      throw new Error("Remote batch deletion requires explicit confirmation after sync validation.");
    }
    const adapter = createVideoFactoryAdapter();
    const result = await adapter.syncRelaxImages({
      date: body.date || "today",
      deleteRemote: Boolean(body.deleteRemote),
      batchId: batch.id,
      outputDir: path.join(batchRunDir(batch.id), "video-factory-output"),
    });
    const target = path.join(batchRunDir(batch.id), "video_factory_sync_result.json");
    await mirrorResultFile(result.manifestPath, target);
    const current = await loadBatch(batch.id);
    const updated = await saveBatch({
      ...current,
      status: result.ok ? "image_ready_for_preview" : "failed",
      videoFactory: { ...current.videoFactory, outputDir: result.outputDir },
      items: current.items.map((item) => {
        const imagePath = result.downloadedFiles.find((filePath) => /\.(png|jpe?g|webp)$/i.test(filePath) && filePath.includes(item.id));
        if (!imagePath) return item;
        return {
          ...item,
          referenceImage: {
            ...item.referenceImage,
            status: "ready_for_preview",
            localPath: imagePath,
            previewUrl: `/api/video-batches/import?path=${encodeURIComponent(imagePath)}`,
          },
        };
      }),
    });
    return NextResponse.json({ ok: result.ok, batch: updated, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
