import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { batchDir, loadBatch, saveBatch } from "@/lib/services/batchService";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

export async function GET(request: Request) {
  const filePath = new URL(request.url).searchParams.get("file") || "";
  if (!filePath || !existsSync(filePath)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await readFile(filePath), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    await saveBatch({ ...batch, status: "image_syncing" });
    const outputDir = path.join(batchDir(batch.id), "video-factory-output");
    await mkdir(outputDir, { recursive: true });
    const downloadedFiles: string[] = [];
    const items = await Promise.all(batch.items.map(async (item) => {
      const localPath = path.join(outputDir, `${item.id}.png`);
      await writeFile(localPath, tinyPng);
      downloadedFiles.push(localPath);
      return {
        ...item,
        referenceImage: {
          ...item.referenceImage,
          status: "ready_for_preview" as const,
          localPath,
          previewUrl: `/api/video-batches/sync-images?file=${encodeURIComponent(localPath)}`
        }
      };
    }));
    const manifestPath = path.join(batchDir(batch.id), "video_factory_sync_result.json");
    await writeFile(manifestPath, `${JSON.stringify({ mock: true, outputDir, downloadedFiles }, null, 2)}\n`);
    const updated = await saveBatch({
      ...batch,
      status: "image_ready_for_preview",
      videoFactory: { ...batch.videoFactory, outputDir, resultManifestPath: manifestPath },
      items
    });
    return NextResponse.json({ ok: true, batch: updated, outputDir, downloadedFiles });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
