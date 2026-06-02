import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { videoBatchStorageRoot } from "@/lib/services/batchService";

export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get("file") || "";
  const resolvedFile = path.resolve(file);
  const resolvedRoot = path.resolve(videoBatchStorageRoot);
  if (!file || !isInside(resolvedFile, resolvedRoot)) {
    return new NextResponse("Invalid preview path", { status: 400 });
  }
  if (path.extname(resolvedFile).toLowerCase() !== ".mp4") {
    return new NextResponse("Unsupported preview file type", { status: 400 });
  }
  if (!existsSync(resolvedFile)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const size = statSync(resolvedFile).size;
  const range = request.headers.get("range");
  if (!range) {
    return new NextResponse(await readFile(resolvedFile), {
      headers: previewHeaders(size)
    });
  }
  const match = range.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return new NextResponse("Invalid range", { status: 416 });
  const start = Number(match[1]);
  const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
  if (start > end || start >= size) return new NextResponse("Range not satisfiable", { status: 416 });
  const bytes = (await readFile(resolvedFile)).subarray(start, end + 1);
  return new NextResponse(bytes, {
    status: 206,
    headers: {
      ...previewHeaders(bytes.length),
      "Content-Range": `bytes ${start}-${end}/${size}`
    }
  });
}

function previewHeaders(contentLength: number): Record<string, string> {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Length": String(contentLength),
    "Content-Type": "video/mp4"
  };
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}
