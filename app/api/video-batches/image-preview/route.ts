import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { videoBatchStorageRoot } from "@/lib/services/batchService";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get("file") || "";
  const resolvedFile = path.resolve(file);
  const resolvedRoot = path.resolve(videoBatchStorageRoot);
  const extension = path.extname(resolvedFile).toLowerCase();

  if (!file || !isInside(resolvedFile, resolvedRoot)) {
    return new NextResponse("Invalid preview path", { status: 400 });
  }
  if (!contentTypes[extension]) {
    return new NextResponse("Unsupported preview file type", { status: 400 });
  }
  if (!existsSync(resolvedFile)) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(await readFile(resolvedFile), {
    headers: {
      "Content-Type": contentTypes[extension],
      "Cache-Control": "private, max-age=60"
    }
  });
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}
