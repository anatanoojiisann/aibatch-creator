import { NextResponse } from "next/server";
import { loadBatch } from "@/lib/services/batchService";
import { uploadApprovedImages } from "@/lib/services/publicAssetService";

export async function POST(request: Request) {
  try {
    const { batchId, approvedItemIds = [], rejectedItemIds = [] } = await request.json();
    const batch = await loadBatch(String(batchId));
    const approved = new Set<string>(approvedItemIds);
    const rejected = new Set<string>(rejectedItemIds);
    const withApprovals = {
      ...batch,
      items: batch.items.map((item) => {
        if (approved.has(item.id)) return { ...item, referenceImage: { ...item.referenceImage, status: "approved" as const } };
        if (rejected.has(item.id)) return { ...item, referenceImage: { ...item.referenceImage, status: "rejected" as const } };
        return item;
      })
    };
    const result = await uploadApprovedImages(withApprovals);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
