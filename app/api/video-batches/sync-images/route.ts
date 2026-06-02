import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { batchDir, loadBatch, saveBatch, videoBatchStorageRoot } from "@/lib/services/batchService";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function GET(request: Request) {
  const fileParam = new URL(request.url).searchParams.get("file") || "";
  const filePath = path.resolve(fileParam);
  const root = path.resolve(videoBatchStorageRoot);
  const extension = path.extname(filePath).toLowerCase();
  if (!fileParam || !(filePath === root || filePath.startsWith(`${root}${path.sep}`))) return new NextResponse("Invalid preview path", { status: 400 });
  if (!contentTypes[extension]) return new NextResponse("Unsupported preview file type", { status: 400 });
  if (!existsSync(filePath)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await readFile(filePath), {
    headers: { "Content-Type": contentTypes[extension], "Cache-Control": "private, max-age=60" }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const canSync = batch.items.some((item) => item.referenceImage.status === "submitted" || item.referenceImage.status === "ready_for_preview" || item.referenceImage.status === "uploaded_public");
    if (!canSync) {
      return NextResponse.json({
        ok: false,
        errorCode: "NO_IMAGE_OUTPUT_FOUND",
        message: "No generated images were found. Run Generate Reference Images first.",
        missingRequirements: ["Images submitted"]
      }, { status: 400 });
    }
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
          previewUrl: `/api/video-batches/image-preview?file=${encodeURIComponent(localPath)}`
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
    return NextResponse.json({
      ok: true,
      batch: updated,
      batchId: batch.id,
      synced: items.length,
      items: items.map((item) => ({
        itemId: item.id,
        status: item.referenceImage.status,
        localPath: item.referenceImage.localPath,
        previewUrl: item.referenceImage.previewUrl
      })),
      message: "Reference images ready for preview.",
      outputDir,
      downloadedFiles
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "SYNC_IMAGES_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      missingRequirements: []
    }, { status: 400 });
  }
}
