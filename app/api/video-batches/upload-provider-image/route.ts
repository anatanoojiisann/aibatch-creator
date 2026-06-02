import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireProviderCapability } from "@/lib/providers/providerCapability";
import { getProviderDefinition, isProviderId } from "@/lib/providers/providerRegistry";
import { PixVerseOfficialAdapter } from "@/lib/providers/pixverseOfficial/pixverseOfficialAdapter";
import { ProviderAsset } from "@/lib/providers/providerTypes";
import { batchDir, loadBatch, saveBatch } from "@/lib/services/batchService";

const imageContentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isProviderId(body.providerId)) {
      return NextResponse.json({ ok: false, errorCode: "INVALID_PROVIDER", message: "Select a supported provider." }, { status: 400 });
    }
    if (body.confirmRealUpload !== true) {
      return NextResponse.json({ ok: false, errorCode: "REAL_UPLOAD_CONFIRMATION_MISSING", message: "Real provider image upload requires explicit confirmation." }, { status: 400 });
    }
    const capability = requireProviderCapability(body.providerId, "upload_image");
    if (!capability.ok) return NextResponse.json(capability, { status: 400 });
    if (body.providerId !== "pixverse_official_api") {
      return NextResponse.json({
        ok: false,
        errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
        providerId: body.providerId,
        capability: "upload_image",
        message: `${getProviderDefinition(body.providerId).label} image upload execution is not configured.`
      }, { status: 400 });
    }
    if (!process.env.PIXVERSE_OFFICIAL_API_KEY) {
      return NextResponse.json({
        ok: false,
        errorCode: "PROVIDER_CREDENTIAL_MISSING",
        providerId: body.providerId,
        message: "PIXVERSE_OFFICIAL_API_KEY is required for PixVerse Official API image upload."
      }, { status: 400 });
    }

    const batch = await loadBatch(String(body.batchId));
    const item = batch.items.find((entry) => entry.id === String(body.itemId || "item_001"));
    const localPath = item?.referenceImage.localPath;
    if (!item || !localPath || !existsSync(localPath)) {
      return NextResponse.json({ ok: false, errorCode: "LOCAL_REFERENCE_IMAGE_REQUIRED", message: "A local reference image is required before provider upload." }, { status: 400 });
    }
    const resolvedPath = path.resolve(localPath);
    const expectedRoot = `${path.resolve(batchDir(batch.id))}${path.sep}`;
    const extension = path.extname(resolvedPath).toLowerCase();
    if (!resolvedPath.startsWith(expectedRoot) || !imageContentTypes[extension]) {
      return NextResponse.json({ ok: false, errorCode: "INVALID_REFERENCE_IMAGE_PATH", message: "The local reference image path is not a supported batch image." }, { status: 400 });
    }

    const imageBytes = await readFile(resolvedPath);
    const result = await new PixVerseOfficialAdapter().uploadImage(
      new Blob([new Uint8Array(imageBytes)], { type: imageContentTypes[extension] }),
      path.basename(resolvedPath)
    );
    if (!result.providerAssetId) {
      return NextResponse.json({ ok: false, errorCode: "PROVIDER_ASSET_ID_MISSING", message: "PixVerse official upload did not return an img_id." }, { status: 502 });
    }
    const provider = getProviderDefinition(body.providerId);
    const asset: ProviderAsset = {
      providerId: provider.id,
      providerGroup: provider.group,
      providerSource: provider.source,
      localBatchId: batch.id,
      localItemId: item.id,
      providerAssetId: result.providerAssetId,
      providerAssetUrl: result.providerAssetUrl || undefined,
      localPath: resolvedPath,
      previewUrl: item.referenceImage.previewUrl,
      uploadedAt: new Date().toISOString(),
      rawResponse: result.rawResponse
    };
    const updated = await saveBatch({
      ...batch,
      providerSetup: { selectedProviderId: provider.id },
      items: batch.items.map((entry) => entry.id === item.id ? {
        ...entry,
        referenceImage: {
          ...entry.referenceImage,
          status: "approved",
          providerAssets: [
            ...(entry.referenceImage.providerAssets || []).filter((existing) => existing.providerId !== provider.id),
            asset
          ]
        },
        generation: {
          ...entry.generation,
          status: "ready_for_video"
        }
      } : entry)
    });
    return NextResponse.json({ ok: true, batch: updated, providerId: provider.id, providerAssetId: result.providerAssetId, message: "Reference image uploaded to PixVerse Official API." });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "UPLOAD_PROVIDER_IMAGE_FAILED",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 400 });
  }
}
