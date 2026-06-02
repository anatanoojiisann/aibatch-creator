import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { batchDir, loadBatch, saveBatch } from "@/lib/services/batchService";

const waitingForRealImageOutputMessage = "Image job submitted. Waiting for generated image output. Try Sync Real Images Again in 30–60 seconds.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batchId = String(body.batchId || "");
    if (!batchId) return structuredError("BATCH_ID_MISSING", "batchId is required.");

    const batch = await loadBatch(batchId);
    if (!await hasSuccessfulImageSubmission(batchId)) {
      return structuredError("REAL_IMAGE_SUBMISSION_MISSING", "Run real VideoFactory image submission before syncing real image output.");
    }

    const retryableItemIds = new Set(batch.items
      .filter((item) =>
        item.referenceImage.status === "submitted"
        || item.referenceImage.status === "syncing"
        || item.referenceImage.status === "waiting_for_real_output"
        || item.referenceImage.errorCode === "NO_REAL_IMAGE_OUTPUT_FOUND"
        || item.referenceImage.errorCode === "WAITING_FOR_REAL_IMAGE_OUTPUT"
        || (body.existingOnly === true && item.referenceImage.status === "ready_for_preview")
      )
      .map((item) => item.id));
    if (retryableItemIds.size === 0) {
      return structuredError("NO_REAL_IMAGE_OUTPUT_PENDING", "No submitted real image job is waiting for output.");
    }

    await saveBatch({
      ...batch,
      status: "image_syncing",
      items: batch.items.map((item) => retryableItemIds.has(item.id)
        ? {
          ...item,
          referenceImage: {
            ...item.referenceImage,
            status: "syncing" as const,
            errorCode: undefined,
            errorMessage: undefined
          }
        }
        : item)
    });

    const result = await createVideoFactoryAdapter().syncRealImages({
      batchId,
      limit: Math.min(10, retryableItemIds.size),
      existingOnly: body.existingOnly === true
    });
    const latest = await loadBatch(batchId);
    const importedByItem = new Map(result.importedImages.map((image) => [image.itemId, image]));
    const updated = await saveBatch({
      ...latest,
      status: statusForResult(result.ok, result.imported),
      videoFactory: {
        ...latest.videoFactory,
        outputDir: result.importedImages[0]?.localPath ? path.dirname(result.importedImages[0].localPath) : latest.videoFactory.outputDir,
        resultManifestPath: result.syncResultPath || latest.videoFactory.resultManifestPath
      },
      items: latest.items.map((item) => {
        const imported = importedByItem.get(item.id);
        if (imported) {
          return {
            ...item,
            referenceImage: {
              ...item.referenceImage,
              status: "ready_for_preview" as const,
              localPath: imported.localPath,
              previewUrl: imported.previewUrl,
              errorCode: undefined,
              errorMessage: undefined
            },
            generation: {
              ...item.generation,
              status: "waiting_for_image" as const
            }
          };
        }
        if (!retryableItemIds.has(item.id)) return item;
        if (result.ok && result.imported === 0) {
          return {
            ...item,
            referenceImage: {
              ...item.referenceImage,
              status: "waiting_for_real_output" as const,
              errorCode: "WAITING_FOR_REAL_IMAGE_OUTPUT",
              errorMessage: waitingForRealImageOutputMessage
            }
          };
        }
        return {
          ...item,
          referenceImage: {
            ...item.referenceImage,
            status: "failed" as const,
            errorCode: result.errorCode,
            errorMessage: result.message
          }
        };
      })
    });

    return NextResponse.json({
      ok: result.ok,
      batchId,
      batch: updated,
      submitted: result.submitted,
      synced: result.synced,
      imported: result.imported,
      message: result.message,
      errorCode: result.errorCode,
      commandLogs: result.commandLogs,
      runtimeDiagnostics: result.runtimeDiagnostics,
      zipPath: result.zipPath,
      extractedDir: result.extractedDir,
      foundImageCount: result.foundImageCount,
      firstImagePath: result.firstImagePath,
      targetCopyPath: result.targetCopyPath,
      copyError: result.copyError
    }, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return structuredError("SYNC_REAL_IMAGES_FAILED", error instanceof Error ? error.message : "Unknown error");
  }
}

async function hasSuccessfulImageSubmission(batchId: string): Promise<boolean> {
  const imageResultPath = path.join(batchDir(batchId), "video_factory_image_result.json");
  if (!existsSync(imageResultPath)) return false;
  try {
    const imageResult = JSON.parse(await readFile(imageResultPath, "utf8")) as { ok?: boolean };
    return imageResult.ok === true;
  } catch {
    return false;
  }
}

function statusForResult(ok: boolean, imported: number) {
  if (!ok) return "failed" as const;
  return imported > 0 ? "image_ready_for_preview" as const : "image_submitted" as const;
}

function structuredError(errorCode: string, message: string) {
  return NextResponse.json({ ok: false, errorCode, message, missingRequirements: [] }, { status: 400 });
}
