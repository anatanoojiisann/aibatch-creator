import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { loadBatch, saveBatch } from "@/services/batchService";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path") || "";
  if (!filePath || !existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const data = await readFile(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType(filePath),
      "Cache-Control": "private, max-age=60",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const approvals = new Set<string>(body.approvedItemIds || []);
    const rejected = new Set<string>(body.rejectedItemIds || []);
    const updated = await saveBatch({
      ...batch,
      items: batch.items.map((item) => {
        if (approvals.has(item.id)) {
          return { ...item, referenceImage: { ...item.referenceImage, status: "approved" } };
        }
        if (rejected.has(item.id)) {
          return { ...item, referenceImage: { ...item.referenceImage, status: "failed", errorCode: "IMAGE_REJECTED", errorMessage: "Rejected by user." } };
        }
        return item;
      }),
    });
    return NextResponse.json({ ok: true, batch: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
