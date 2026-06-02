import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { ImageGenerationMode } from "@/lib/integrations/videofactory/videoFactoryTypes";
import { loadBatch, saveBatch } from "@/lib/services/batchService";

const modes = new Set<ImageGenerationMode>(["mock", "dry-run", "real"]);
const waitingForRealImageOutputMessage = "Image job submitted. Waiting for generated image output. Try Sync Real Images Again in 30–60 seconds.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batchId = String(body.batchId || "");
    const mode = normalizeMode(body.mode);
    const limit = Number(body.limit || 1);
    const modelLimit = Number(body.modelLimit || 1);
    const models = Array.isArray(body.models)
      ? body.models.map(String).map((model: string) => model.trim()).filter(Boolean)
      : String(body.models || "").split(",").map((model: string) => model.trim()).filter(Boolean);

    if (!batchId) {
      return structuredError("BATCH_ID_MISSING", "batchId is required.", ["Create a VideoBatch first."]);
    }
    if (!mode) {
      return structuredError("INVALID_IMAGE_GENERATION_MODE", "Image generation mode must be mock, dry-run, or real.", ["Select an image generation mode."]);
    }

    const batch = await loadBatch(batchId);
    if (!batch.videoFactory.promptDir || !existsSync(batch.videoFactory.promptDir)) {
      return structuredError("PROMPT_DIR_MISSING", "Export prompt-dir before generating reference images.", ["Prompt dir exported"]);
    }

    const bridgeUrl = process.env.VIDEO_FACTORY_BRIDGE_URL || "https://admin666.aurax.one";
    const apiKey = process.env.PIXVERSE_WEB_PROVIDER_API_KEY;
    const usableApiKey = apiKey && apiKey !== "replace_with_real_bridge_key" ? apiKey : undefined;

    if (mode === "real") {
      const missingRequirements: string[] = [];
      if (!usableApiKey) missingRequirements.push("PIXVERSE_WEB_PROVIDER_API_KEY");
      if (body.confirmRealRun !== true) missingRequirements.push("Credit consumption checkbox");
      if (limit > 1) missingRequirements.push("limit must be 1");
      if (modelLimit > 1) missingRequirements.push("modelLimit must be 1");
      if (missingRequirements.length > 0) {
        return structuredError(
          "REAL_IMAGE_GENERATION_BLOCKED",
          "Real VideoFactory image generation requires a valid API key and explicit confirmation.",
          missingRequirements
        );
      }
    }

    await saveBatch({
      ...batch,
      status: "image_submitting",
      items: batch.items.map((item, index) => {
        if (mode === "mock" || index < Math.max(1, Math.min(10, limit))) {
          return {
            ...item,
            referenceImage: {
              ...item.referenceImage,
              status: mode === "real" ? "submitting" as const : "pending" as const,
              errorCode: undefined,
              errorMessage: undefined
            }
          };
        }
        return item;
      })
    });

    const result = await createVideoFactoryAdapter().generateReferenceImages({
      batchId,
      promptDir: batch.videoFactory.promptDir,
      mode,
      limit: mode === "real" ? 1 : limit,
      modelLimit: mode === "real" ? 1 : modelLimit,
      models,
      bridgeUrl,
      apiKey: usableApiKey,
      confirmRealRun: body.confirmRealRun === true
    });

    const latest = await loadBatch(batchId);
    const importedByItem = new Map(result.importedImages.map((image) => [image.itemId, image]));
    const updated = await saveBatch({
      ...latest,
      status: statusForResult(mode, result.ok, result.imported, result.errorCode),
      videoFactory: {
        ...latest.videoFactory,
        outputDir: result.importedImages[0]?.localPath ? path.dirname(result.importedImages[0].localPath) : latest.videoFactory.outputDir,
        resultManifestPath: result.syncResultPath || result.imageResultPath || latest.videoFactory.resultManifestPath
      },
      items: latest.items.map((item, index) => {
        const imported = importedByItem.get(item.id);
        if (imported) {
          return {
            ...item,
            referenceImage: {
              ...item.referenceImage,
              status: "ready_for_preview" as const,
              localPath: imported.localPath,
              previewUrl: imported.previewUrl,
              generatorProviderId: "legacy_videofactory",
              errorCode: undefined,
              errorMessage: undefined
            },
            generation: {
              ...item.generation,
              status: "waiting_for_image" as const
            }
          };
        }
        if (mode === "dry-run" && result.ok && index < Math.max(1, Math.min(10, limit))) {
          return {
            ...item,
            referenceImage: {
              ...item.referenceImage,
              status: "submitted" as const,
              errorCode: undefined,
              errorMessage: undefined
            }
          };
        }
        if (mode === "real" && result.errorCode === "WAITING_FOR_REAL_IMAGE_OUTPUT" && index === 0) {
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
        if (!result.ok && index === 0 && mode === "real") {
          return {
            ...item,
            referenceImage: {
              ...item.referenceImage,
              status: "failed" as const,
              errorCode: result.errorCode,
              errorMessage: result.message
            }
          };
        }
        return item;
      })
    });

    const response = {
      ok: result.ok,
      batchId,
      batch: updated,
      mode,
      submitted: result.submitted,
      synced: result.synced,
      imported: result.imported,
      items: updated.items.map((item) => ({
        itemId: item.id,
        referenceImageStatus: item.referenceImage.status,
        localPath: item.referenceImage.localPath,
        previewUrl: item.referenceImage.previewUrl
      })),
      message: result.message || (result.ok ? "Reference image generation completed." : "Reference image generation failed."),
      errorCode: result.errorCode,
      commandLogs: result.commandLogs,
      runtimeDiagnostics: result.runtimeDiagnostics,
      zipPath: result.zipPath,
      extractedDir: result.extractedDir,
      foundImageCount: result.foundImageCount,
      firstImagePath: result.firstImagePath,
      targetCopyPath: result.targetCopyPath,
      copyError: result.copyError
    };

    return NextResponse.json(response, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return structuredError("GENERATE_REFERENCE_IMAGES_FAILED", error instanceof Error ? error.message : "Unknown error", []);
  }
}

function normalizeMode(value: unknown): ImageGenerationMode | null {
  const mode = String(value || "mock") as ImageGenerationMode;
  return modes.has(mode) ? mode : null;
}

function structuredError(errorCode: string, message: string, missingRequirements: string[]) {
  return NextResponse.json({
    ok: false,
    errorCode,
    message,
    missingRequirements
  }, { status: 400 });
}

function statusForResult(mode: ImageGenerationMode, ok: boolean, imported: number, errorCode?: string) {
  if (!ok) return "failed" as const;
  if (imported > 0) return "image_ready_for_preview" as const;
  if (errorCode === "WAITING_FOR_REAL_IMAGE_OUTPUT") return "image_submitted" as const;
  if (mode === "dry-run") return "image_submitted" as const;
  return "image_submitted" as const;
}
