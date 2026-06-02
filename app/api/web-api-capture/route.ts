import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const reports = await Promise.all(["pixverse_web", "pai_web"].map(async (providerId) => {
    const reportPath = path.join(process.cwd(), "storage", "web-api-capture", `${providerId}-observed-endpoints.json`);
    if (!existsSync(reportPath)) return undefined;
    return JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  }));
  return NextResponse.json({ ok: true, reports: reports.filter(Boolean) });
}
