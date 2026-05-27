import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchRunDir } from "@/services/batchService";
import { exportPromptDir } from "@/services/promptDirService";
import { uploadPublicImages as uploadWithService } from "@/services/publicAssetService";
import { VideoBatch } from "@/schemas/videoBatch.schema";
import { parseVideoFactoryResults } from "./videoFactoryResultParser";
import {
  VideoFactoryAdapterConfig,
  VideoFactoryCommandResult,
  VideoFactoryPromptDirResult,
  VideoFactoryReadManifestResult,
  VideoFactorySetupResult,
  VideoFactorySubmitImagesOptions,
  VideoFactorySubmitVideosOptions,
  VideoFactorySyncImagesOptions,
  VideoFactorySyncResult,
} from "./videoFactoryTypes";

export class VideoFactoryAdapter {
  private readonly config: VideoFactoryAdapterConfig;

  constructor(config: VideoFactoryAdapterConfig) {
    this.config = config;
  }

  async checkSetup(): Promise<VideoFactorySetupResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.config.videoFactoryPath || !existsSync(this.config.videoFactoryPath)) {
      errors.push(`VIDEO_FACTORY_PATH does not exist: ${this.config.videoFactoryPath || "(empty)"}`);
    }
    if (this.config.videoFactoryPath && !existsSync(path.join(this.config.videoFactoryPath, "package.json"))) {
      errors.push(`VIDEO_FACTORY_PATH is not a Node.js project: ${this.config.videoFactoryPath}`);
    }
    if (!this.config.apiKey) {
      warnings.push("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote submission is blocked and dry-run mode is allowed.");
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  async createPromptDir(batch: VideoBatch): Promise<VideoFactoryPromptDirResult> {
    return exportPromptDir(batch);
  }

  async submitImages(options: VideoFactorySubmitImagesOptions): Promise<VideoFactoryCommandResult> {
    if (options.remote && !options.dryRun && !this.config.apiKey) {
      throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; image submission can only run in dry-run mode.");
    }
    const args = [
      "run",
      "submit-images",
      "--",
      "--prompt-dir",
      options.promptDir,
      "--bridge-url",
      this.config.bridgeUrl,
      "--limit",
      String(safeLimit(options.limit, options.remote && !options.dryRun ? 1 : options.limit)),
      "--model-limit",
      String(options.modelLimit || 1),
      "--batch-id",
      options.batchId || path.basename(path.dirname(options.promptDir)),
    ];
    if (options.models?.length) args.push("--models", options.models.join(","));
    if (options.dryRun || !options.remote) args.push("--dry-run");
    if (options.remote && !options.dryRun) args.push("--batch");
    const result = await this.runNpm(args);
    return {
      ...result,
      manifestPath: this.videoFactoryResultPath(options.batchId, "image-submissions.json"),
    };
  }

  async syncRelaxImages(options: VideoFactorySyncImagesOptions): Promise<VideoFactorySyncResult> {
    if (!this.config.apiKey) {
      throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; sync requires bridge access.");
    }
    const outputDir = options.outputDir || path.join(batchRunDir(options.batchId || "manual"), "video-factory-output");
    const args = [
      "run",
      "sync-relax-images",
      "--",
      "--all",
      "--date",
      options.date || "today",
      "--bridge-url",
      this.config.bridgeUrl,
      "--out-dir",
      outputDir,
    ];
    if (options.batchId) args.push("--batch-id", options.batchId);
    if (options.deleteRemote) args.push("--delete-remote");
    const command = await this.runNpm(args);
    const downloadedFiles = existsSync(outputDir) ? await collectFiles(outputDir) : [];
    return {
      ok: command.ok,
      outputDir,
      downloadedFiles,
      manifestPath: path.join(outputDir, "relax-image-sync.json"),
    };
  }

  async uploadPublicImages(batch: VideoBatch) {
    return uploadWithService(batch);
  }

  async submitVideos(options: VideoFactorySubmitVideosOptions): Promise<VideoFactoryCommandResult> {
    if (options.remote && !options.dryRun && !this.config.apiKey) {
      throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; video submission can only run in dry-run mode.");
    }
    const args = [
      "run",
      "submit-videos",
      "--",
      "--prompt-dir",
      options.promptDir,
      "--image-url-map",
      options.imageUrlMapPath,
      "--bridge-url",
      this.config.bridgeUrl,
      "--limit",
      String(safeLimit(options.limit, options.remote && !options.dryRun ? 1 : options.limit)),
      "--batch-id",
      options.batchId || path.basename(path.dirname(options.promptDir)),
    ];
    if (options.dryRun || !options.remote) args.push("--dry-run");
    const result = await this.runNpm(args);
    return {
      ...result,
      manifestPath: this.videoFactoryResultPath(options.batchId, "video-submissions.json"),
    };
  }

  async readResultManifest(batch: VideoBatch): Promise<VideoFactoryReadManifestResult> {
    return parseVideoFactoryResults({
      imageResultPath: path.join(batchRunDir(batch.id), "video_factory_image_result.json"),
      syncResultPath: path.join(batchRunDir(batch.id), "video_factory_sync_result.json"),
      videoResultPath: path.join(batchRunDir(batch.id), "video_factory_video_result.json"),
      imageUrlMapPath: batch.videoFactory.imageUrlMapPath,
    });
  }

  private async runNpm(args: string[]): Promise<VideoFactoryCommandResult> {
    const setup = await this.checkSetup();
    if (!setup.ok) {
      throw new Error(setup.errors.join("\n"));
    }
    const command = `npm ${maskCommand(args).join(" ")}`;
    const env = {
      ...process.env,
      PIXVERSE_WEB_PROVIDER_API_KEY: this.config.apiKey || "",
      VIDEO_FACTORY_BRIDGE_URL: this.config.bridgeUrl,
    };
    return new Promise((resolve) => {
      const child = spawn("npm", args, {
        cwd: this.config.videoFactoryPath,
        env,
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += maskSecrets(chunk.toString(), this.config.apiKey);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += maskSecrets(chunk.toString(), this.config.apiKey);
      });
      child.on("close", (code) => {
        resolve({ ok: code === 0, command, stdout, stderr });
      });
    });
  }

  private videoFactoryResultPath(batchId: string | undefined, filename: string): string | undefined {
    if (!batchId) return undefined;
    return path.join(this.config.videoFactoryPath, "runs", batchId, "from-prompt-dir", "results", filename);
  }
}

export function createVideoFactoryAdapter(): VideoFactoryAdapter {
  return new VideoFactoryAdapter({
    videoFactoryPath: process.env.VIDEO_FACTORY_PATH || "/Users/steven-mac2/Documents/VideoFactory",
    bridgeUrl: process.env.VIDEO_FACTORY_BRIDGE_URL || "https://admin666.aurax.one",
    apiKey: process.env.PIXVERSE_WEB_PROVIDER_API_KEY && process.env.PIXVERSE_WEB_PROVIDER_API_KEY !== "replace_with_real_bridge_key"
      ? process.env.PIXVERSE_WEB_PROVIDER_API_KEY
      : undefined,
  });
}

export async function mirrorResultFile(source: string | undefined, target: string): Promise<void> {
  if (!source || !existsSync(source)) return;
  const data = await import("node:fs/promises").then((fs) => fs.readFile(source, "utf8"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

function safeLimit(limit: number | undefined, fallback: number | undefined): number {
  return Math.max(1, Number(limit || fallback || 1));
}

function maskCommand(args: string[]): string[] {
  return args.map((arg) => arg.includes("PIXVERSE_WEB_PROVIDER_API_KEY") ? "PIXVERSE_WEB_PROVIDER_API_KEY=***" : arg);
}

function maskSecrets(value: string, apiKey?: string): string {
  return apiKey ? value.split(apiKey).join("***") : value;
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return [fullPath];
  }));
  return nested.flat();
}
