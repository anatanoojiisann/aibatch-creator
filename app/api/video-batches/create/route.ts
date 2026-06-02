import { NextResponse } from "next/server";
import { createVideoBatch, generateMockVideoCreativeItems, listBatches, loadBatch } from "@/lib/services/batchService";
import { isProviderId } from "@/lib/providers/providerRegistry";

export async function GET(request: Request) {
  const batchId = new URL(request.url).searchParams.get("batchId");
  if (batchId) {
    try {
      return NextResponse.json({ ok: true, batch: await loadBatch(batchId) });
    } catch (error) {
      return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 404 });
    }
  }
  return NextResponse.json({ ok: true, batches: await listBatches() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await createVideoBatch({
      title: body.title,
      sourceTopic: String(body.sourceTopic || body.topic || "Untitled video batch"),
      platform: normalizePlatform(body.platform),
      aspectRatio: normalizeAspectRatio(body.aspectRatio),
      selectedProviderId: isProviderId(body.providerId) ? body.providerId : undefined
    });
    const batch = await generateMockVideoCreativeItems({
      batchId: created.id,
      count: Number(body.count || 10),
      persona: body.persona,
      styleNotes: body.styleNotes
    });
    return NextResponse.json({ ok: true, batchId: batch.id, batch, items: batch.items });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "CREATE_BATCH_FAILED",
      message: errorMessage(error),
      details: sanitizedStackSummary(error),
      route: "/api/video-batches/create"
    }, { status: 400 });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function sanitizedStackSummary(error: unknown): string | undefined {
  if (process.env.NODE_ENV !== "development" || !(error instanceof Error)) return undefined;
  return (error.stack || error.message).split("\n").slice(0, 6).join("\n");
}

function normalizePlatform(value: unknown): "tiktok" | "xiaohongshu" | "youtube_shorts" | "other" {
  const normalized = String(value || "tiktok").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "tiktok" || normalized === "xiaohongshu" || normalized === "youtube_shorts" || normalized === "other") {
    return normalized;
  }
  throw new Error(`Unsupported platform: ${value}`);
}

function normalizeAspectRatio(value: unknown): "9:16" | "16:9" | "1:1" {
  const normalized = String(value || "9:16").trim();
  if (normalized === "9:16" || normalized === "16:9" || normalized === "1:1") return normalized;
  throw new Error(`Unsupported aspect ratio: ${value}`);
}
