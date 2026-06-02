import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchDir, loadBatch } from "@/lib/services/batchService";
import { exportPromptDir } from "@/lib/services/promptDirService";
import { generateImageUrlMap, uploadApprovedImages } from "@/lib/services/publicAssetService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { parseVideoFactoryManifest } from "@/lib/integrations/videofactory/videoFactoryResultParser";
import {
  GenerateReferenceImagesOptions,
  GenerateReferenceImagesResult,
  ReadResultManifestResult,
  SubmitImagesOptions,
  SubmitVideosOptions,
  SyncRealImagesOptions,
  SyncRelaxImagesOptions,
  VideoFactoryAdapterConfig,
  VideoFactoryCommandResult,
  VideoFactoryRuntimeDiagnostics,
  VideoFactorySetupResult,
  VideoFactoryVideoSubmission
} from "@/lib/integrations/videofactory/videoFactoryTypes";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const waitingForRealImageOutputMessage = "Image job submitted. Waiting for generated image output. Try Sync Real Images Again in 30–60 seconds.";
const unauthorizedRuntimeKeyMessage = "Aurax bridge rejected the runtime PIXVERSE_WEB_PROVIDER_API_KEY. The running Next.js server may be using a stale or wrong key. Restart npm run dev after updating .env.local, and verify the runtime key fingerprint matches VideoFactory/start.sh.";

export class VideoFactoryAdapter {
  constructor(private readonly config: VideoFactoryAdapterConfig) {}

  async checkSetup(): Promise<VideoFactorySetupResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.config.videoFactoryPath || !existsSync(this.config.videoFactoryPath)) {
      errors.push(`VIDEO_FACTORY_PATH does not exist: ${this.config.videoFactoryPath || "(empty)"}`);
    } else if (!existsSync(path.join(this.config.videoFactoryPath, "package.json"))) {
      errors.push(`VIDEO_FACTORY_PATH is not a Node.js project: ${this.config.videoFactoryPath}`);
    }
    if (!this.config.apiKey) {
      warnings.push("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote submission is blocked and dry-run mode remains available.");
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  async createPromptDir(batch: VideoBatch) {
    return exportPromptDir(batch);
  }

  async generateReferenceImages(options: GenerateReferenceImagesOptions): Promise<GenerateReferenceImagesResult> {
    const setup = await this.checkSetup();
    if (!setup.ok) {
      return emptyReferenceResult(options.mode, "VIDEO_FACTORY_SETUP_FAILED", setup.errors.join("\n"));
    }
    if (!options.promptDir || !existsSync(options.promptDir)) {
      return emptyReferenceResult(options.mode, "PROMPT_DIR_MISSING", `Prompt dir does not exist: ${options.promptDir || "(empty)"}`);
    }
    if (!isInside(options.promptDir, batchDir(options.batchId))) {
      return emptyReferenceResult(options.mode, "UNSAFE_PROMPT_DIR", "Prompt dir must be inside this batch storage folder.");
    }

    const mode = options.mode;
    const limit = clampPositiveInt(options.limit, 1, 10);
    const modelLimit = clampPositiveInt(options.modelLimit, 1, 10);
    const bridgeUrl = options.bridgeUrl || this.config.bridgeUrl;
    const apiKey = options.apiKey || this.config.apiKey;
    const commandLogs: GenerateReferenceImagesResult["commandLogs"] = [];

    if (mode === "mock") {
      const batch = await loadBatch(options.batchId);
      const outputDir = path.join(batchDir(options.batchId), "video-factory-output");
      await mkdir(outputDir, { recursive: true });
      const importedImages = await Promise.all(batch.items.map(async (item) => {
        const localPath = path.join(outputDir, `${item.id}.png`);
        await writeFile(localPath, tinyPng);
        return {
          itemId: item.id,
          sourcePath: "mock",
          localPath,
          previewUrl: imagePreviewUrl(localPath)
        };
      }));
      const imageResultPath = await writeCommandManifest(options.batchId, "video_factory_image_result.json", {
        ok: true,
        command: "mock reference image generation",
        stdout: `Generated ${importedImages.length} mock reference image(s).`,
        stderr: ""
      });
      const syncResultPath = await writeJsonBatchFile(options.batchId, "video_factory_sync_result.json", {
        mock: true,
        outputDir,
        downloadedFiles: importedImages.map((image) => image.localPath)
      });
      return {
        ok: true,
        mode,
        submitted: batch.items.length,
        synced: importedImages.length,
        imported: importedImages.length,
        imageResultPath,
        syncResultPath,
        importedImages,
        commandLogs,
        message: "Reference images ready for preview."
      };
    }

    if (mode === "real") {
      if (!apiKey) {
        return emptyReferenceResult(mode, "PIXVERSE_API_KEY_MISSING", "PIXVERSE_WEB_PROVIDER_API_KEY is missing; real remote image generation is blocked.");
      }
      if (!options.confirmRealRun) {
        return emptyReferenceResult(mode, "REAL_RUN_CONFIRMATION_MISSING", "Real image generation requires explicit confirmation.");
      }
      if (limit > 1) {
        return emptyReferenceResult(mode, "FULL_BATCH_NOT_ENABLED", "Real image generation is limited to 1 item for the first integration.");
      }
      if (modelLimit > 1) {
        return emptyReferenceResult(mode, "MODEL_LIMIT_NOT_SAFE", "Real image generation is limited to modelLimit=1 for the first integration.");
      }
    }

    const submitArgs = [
      "run",
      "submit-images",
      "--",
      "--prompt-dir",
      options.promptDir,
      "--bridge-url",
      bridgeUrl,
      "--batch-id",
      options.batchId,
      "--limit",
      String(limit),
      "--model-limit",
      String(modelLimit)
    ];
    if (options.models?.length) submitArgs.push("--models", options.models.join(","));
    if (mode === "dry-run") submitArgs.push("--dry-run");

    const imageSubmit = await this.runNpm(submitArgs, apiKey, bridgeUrl);
    commandLogs.push(commandLog(imageSubmit));
    const imageResultPath = await writeCommandManifest(options.batchId, "video_factory_image_result.json", imageSubmit);
    if (!imageSubmit.ok) {
      return {
        ok: false,
        mode,
        submitted: 0,
        synced: 0,
        imported: 0,
        imageResultPath,
        importedImages: [],
        commandLogs,
        errorCode: "IMAGE_SUBMIT_FAILED",
        message: hasUnauthorizedError(imageSubmit) ? unauthorizedRuntimeKeyMessage : "VideoFactory submit-images failed.",
        runtimeDiagnostics: imageSubmit.runtimeDiagnostics
      };
    }

    if (mode === "dry-run") {
      return {
        ok: true,
        mode,
        submitted: limit,
        synced: 0,
        imported: 0,
        imageResultPath,
        importedImages: [],
        commandLogs,
        message: "VideoFactory dry-run submit-images completed. No remote jobs were created.",
        runtimeDiagnostics: imageSubmit.runtimeDiagnostics
      };
    }

    return this.syncAndImportRealImages({
      batchId: options.batchId,
      limit,
      submitted: limit,
      imageResultPath,
      commandLogs,
      apiKey,
      bridgeUrl,
      force: false
    });
  }

  async syncRealImages(options: SyncRealImagesOptions): Promise<GenerateReferenceImagesResult> {
    const setup = await this.checkSetup();
    if (!setup.ok) {
      return emptyReferenceResult("real", "VIDEO_FACTORY_SETUP_FAILED", setup.errors.join("\n"));
    }
    const limit = clampPositiveInt(options.limit, 1, 10);
    if (options.existingOnly) {
      return this.importExistingRealImages(options.batchId, limit);
    }
    if (!this.config.apiKey) {
      return emptyReferenceResult("real", "PIXVERSE_API_KEY_MISSING", "PIXVERSE_WEB_PROVIDER_API_KEY is missing; real remote image sync is blocked.");
    }
    return this.syncAndImportRealImages({
      batchId: options.batchId,
      limit,
      submitted: limit,
      commandLogs: [],
      apiKey: this.config.apiKey,
      bridgeUrl: this.config.bridgeUrl,
      force: true
    });
  }

  async submitImages(options: SubmitImagesOptions): Promise<VideoFactoryCommandResult> {
    const dryRun = options.dryRun !== false || !options.remote;
    this.assertRemoteAllowed(options.remote === true, dryRun, options.confirmedRemote, options.limit, options.confirmedFullBatch);
    const args = ["run", "submit-images", "--", "--prompt-dir", options.promptDir];
    if (dryRun) {
      args.push("--dry-run", "--limit", "1");
    } else {
      args.push("--limit", String(remoteLimit(options.limit)), "--model-limit", String(options.modelLimit || 1));
    }
    return this.runNpm(args);
  }

  async syncRelaxImages(options: SyncRelaxImagesOptions = {}): Promise<VideoFactoryCommandResult> {
    if (!this.config.apiKey) {
      throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote image sync is unavailable.");
    }
    const args = [
      "run",
      "sync-relax-images",
      "--",
      "--all",
      "--date",
      options.date || "today",
      "--bridge-url",
      this.config.bridgeUrl
    ];
    if (options.deleteRemote) args.push("--delete-remote");
    return this.runNpm(args);
  }

  async uploadPublicImages(batch: VideoBatch) {
    const upload = await uploadApprovedImages(batch);
    const map = await generateImageUrlMap(upload.batch);
    return {
      ok: upload.ok,
      imageUrlMapPath: map.imageUrlMapPath,
      uploaded: upload.uploaded,
      failed: upload.failed,
      batch: map.batch
    };
  }

  async submitVideos(options: SubmitVideosOptions): Promise<VideoFactoryCommandResult> {
    const dryRun = options.dryRun !== false || !options.remote;
    this.assertRemoteAllowed(options.remote === true, dryRun, options.confirmedRemote, options.limit, options.confirmedFullBatch);
    const bridgeUrl = options.bridgeUrl || this.config.bridgeUrl;
    const args = [
      "run",
      "submit-videos",
      "--",
      "--prompt-dir",
      options.promptDir,
      "--image-url-map",
      options.imageUrlMapPath,
      "--bridge-url",
      bridgeUrl,
      "--batch-id",
      options.batchId,
      "--model-limit",
      String(options.modelLimit || 1)
    ];
    if (dryRun) {
      args.push("--dry-run", "--limit", "1");
    } else {
      args.push("--limit", String(remoteLimit(options.limit)));
    }
    const startedAt = Date.now();
    const result = await this.runNpm(args, this.config.apiKey, bridgeUrl);
    const sourceResultPath = path.join(
      this.config.videoFactoryPath,
      "runs",
      options.batchId,
      "from-prompt-dir",
      "results",
      "video-submissions.json"
    );
    if (!result.ok || !existsSync(sourceResultPath) || statSync(sourceResultPath).mtimeMs < startedAt) return result;
    const localResultPath = path.join(batchDir(options.batchId), "video_factory_video_submissions.json");
    await copyFile(sourceResultPath, localResultPath);
    return {
      ...result,
      resultJsonPath: localResultPath,
      submissions: await readVideoSubmissions(localResultPath)
    };
  }

  async readResultManifest(batch: VideoBatch): Promise<ReadResultManifestResult> {
    return parseVideoFactoryManifest({
      imageResultPath: path.join(batchDir(batch.id), "video_factory_image_result.json"),
      syncResultPath: path.join(batchDir(batch.id), "video_factory_sync_result.json"),
      videoResultPath: path.join(batchDir(batch.id), "video_factory_video_result.json"),
      imageUrlMapPath: batch.videoFactory.imageUrlMapPath
    });
  }

  private assertRemoteAllowed(remote: boolean, dryRun: boolean, confirmedRemote?: boolean, limit?: number, confirmedFullBatch?: boolean) {
    if (!remote || dryRun) return;
    if (!this.config.apiKey) throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote submission is blocked.");
    if (!confirmedRemote) throw new Error("Remote submission requires explicit user confirmation.");
    if (Number(limit || 1) > 1 && !confirmedFullBatch) throw new Error("Full batch remote submission requires explicit Run Full Batch confirmation.");
  }

  private async importExistingRealImages(batchId: string, limit: number): Promise<GenerateReferenceImagesResult> {
    let batchImages: BatchSpecificImages;
    try {
      batchImages = await findBatchSpecificImages(this.config.videoFactoryPath, batchId);
    } catch (error) {
      if (error instanceof ZipContainsImageButImportFailedError) {
        return zipContainsImageButImportFailedResult({
          submitted: limit,
          commandLogs: [],
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
    return buildRealImageImportResult(batchId, limit, limit, batchImages, []);
  }

  private async syncAndImportRealImages({
    batchId,
    limit,
    submitted,
    imageResultPath,
    commandLogs,
    apiKey,
    bridgeUrl,
    force
  }: {
    batchId: string;
    limit: number;
    submitted: number;
    imageResultPath?: string;
    commandLogs: GenerateReferenceImagesResult["commandLogs"];
    apiKey?: string;
    bridgeUrl: string;
    force: boolean;
  }): Promise<GenerateReferenceImagesResult> {
    const resultRelativePath = path.join("runs", batchId, "from-prompt-dir", "results", "image-submissions.json");
    const syncArgs = existsSync(path.join(this.config.videoFactoryPath, resultRelativePath))
      ? ["run", "sync-relax-images", "--", "--results", resultRelativePath, "--bridge-url", bridgeUrl]
      : ["run", "sync-relax-images", "--", "--all", "--date", "today", "--bridge-url", bridgeUrl];
    if (force) syncArgs.push("--force");
    const syncStartedAt = Date.now();
    const syncResult = await this.runNpm(syncArgs, apiKey, bridgeUrl);
    commandLogs.push(commandLog(syncResult));
    const syncResultPath = await writeCommandManifest(batchId, "video_factory_sync_result.json", syncResult);
    if (!syncResult.ok) {
      return {
        ok: false,
        mode: "real",
        submitted,
        synced: 0,
        imported: 0,
        imageResultPath,
        syncResultPath,
        importedImages: [],
        commandLogs,
        errorCode: "IMAGE_SYNC_FAILED",
        message: "VideoFactory sync-relax-images failed.",
        runtimeDiagnostics: syncResult.runtimeDiagnostics
      };
    }

    let batchImages: BatchSpecificImages;
    try {
      batchImages = await findBatchSpecificImages(this.config.videoFactoryPath, batchId, syncStartedAt);
    } catch (error) {
      if (error instanceof ZipContainsImageButImportFailedError) {
        return zipContainsImageButImportFailedResult({
          submitted,
          imageResultPath,
          syncResultPath,
          commandLogs,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
    return buildRealImageImportResult(batchId, limit, submitted, batchImages, commandLogs, imageResultPath, syncResultPath);
  }

  private async runNpm(args: string[], apiKey = this.config.apiKey, bridgeUrl = this.config.bridgeUrl): Promise<VideoFactoryCommandResult> {
    const setup = await this.checkSetup();
    if (!setup.ok) throw new Error(setup.errors.join("\n"));
    const runtimeApiKey = process.env.PIXVERSE_WEB_PROVIDER_API_KEY || apiKey || "";
    const childEnv = {
      ...process.env,
      PIXVERSE_WEB_PROVIDER_API_KEY: runtimeApiKey,
      BRIDGE_API_KEY: process.env.BRIDGE_API_KEY || runtimeApiKey,
      API_KEY: process.env.API_KEY || runtimeApiKey,
      VIDEO_FACTORY_BRIDGE_URL: bridgeUrl
    };
    const command = `${runtimeApiKey ? "PIXVERSE_WEB_PROVIDER_API_KEY=*** " : ""}npm ${args.join(" ")}`;
    const runtimeDiagnostics = getVideoFactoryRuntimeDiagnostics({
      apiKey: runtimeApiKey,
      bridgeUrl,
      command,
      dryRun: args.includes("--dry-run"),
      childProcessPixverseKeyPresent: Boolean(childEnv.PIXVERSE_WEB_PROVIDER_API_KEY)
    });
    return new Promise((resolve) => {
      const child = spawn("npm", args, {
        cwd: this.config.videoFactoryPath,
        env: childEnv,
        shell: false
      });
      let stdout = "";
      let stderr = "";
      const secrets = [runtimeApiKey, childEnv.BRIDGE_API_KEY, childEnv.API_KEY];
      child.stdout.on("data", (chunk: Buffer) => { stdout += maskSecrets(chunk.toString(), secrets); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += maskSecrets(chunk.toString(), secrets); });
      child.on("close", (code) => resolve({ ok: code === 0, command, stdout, stderr, runtimeDiagnostics }));
    });
  }
}

export function createVideoFactoryAdapter(): VideoFactoryAdapter {
  const key = process.env.PIXVERSE_WEB_PROVIDER_API_KEY;
  return new VideoFactoryAdapter({
    videoFactoryPath: process.env.VIDEO_FACTORY_PATH || "/Users/steven-mac2/Documents/VideoFactory",
    bridgeUrl: process.env.VIDEO_FACTORY_BRIDGE_URL || "https://admin666.aurax.one",
    apiKey: key && key !== "replace_with_real_bridge_key" ? key : undefined
  });
}

export function getVideoFactoryRuntimeDiagnostics(options: {
  apiKey?: string;
  bridgeUrl?: string;
  command?: string;
  dryRun?: boolean;
  childProcessPixverseKeyPresent?: boolean;
} = {}): VideoFactoryRuntimeDiagnostics {
  const apiKey = options.apiKey ?? process.env.PIXVERSE_WEB_PROVIDER_API_KEY ?? "";
  const videoFactoryPath = process.env.VIDEO_FACTORY_PATH || "/Users/steven-mac2/Documents/VideoFactory";
  return {
    ...safeKeyFingerprint(apiKey),
    bridgeUrl: options.bridgeUrl || process.env.VIDEO_FACTORY_BRIDGE_URL || "https://admin666.aurax.one",
    dryRun: options.dryRun ?? false,
    videoFactoryPath,
    command: options.command,
    envLocalExists: existsSync(path.join(process.cwd(), ".env.local")),
    childProcessPixverseKeyPresent: options.childProcessPixverseKeyPresent ?? false
  };
}

export async function writeCommandManifest(batchId: string, fileName: string, result: VideoFactoryCommandResult): Promise<string> {
  const filePath = path.join(batchDir(batchId), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`);
  return filePath;
}

export async function copyIfExists(source: string, target: string): Promise<void> {
  if (!existsSync(source)) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(source));
}

function remoteLimit(value: number | undefined): number {
  return Math.max(1, Math.min(10, Number(value || 1)));
}

function maskSecrets(value: string, secrets: Array<string | undefined>): string {
  return secrets.filter((secret): secret is string => Boolean(secret)).reduce((masked, secret) => masked.split(secret).join("***"), value);
}

function safeKeyFingerprint(value: string) {
  return {
    keyPresent: Boolean(value),
    keyLength: value.length,
    keySha256Prefix: value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : "",
    keyMasked: value ? `${value.slice(0, 4)}...${value.slice(-4)}` : ""
  };
}

function hasUnauthorizedError(result: VideoFactoryCommandResult): boolean {
  return `${result.stdout}\n${result.stderr}`.toLowerCase().includes("unauthorized");
}

async function readVideoSubmissions(filePath: string): Promise<VideoFactoryVideoSubmission[]> {
  const data = JSON.parse(await readFile(filePath, "utf8")) as { submissions?: Array<Record<string, any>> };
  return (data.submissions || []).map((submission) => {
    const response = submission.response || {};
    return {
      itemId: submission.itemId || submission.body?.metadata?.factory_item_id,
      dryRun: submission.dryRun === true,
      ok: submission.ok,
      submittedAt: submission.submittedAt,
      videoJobId: response.providerJobId || response.videoTaskId || response.taskId || response.videoId || response.id || submission.videoJobId,
      videoUrl: response.videoUrl || response.url || submission.videoUrl,
      errorMessage: submission.error || submission.message || response.message || response.error
    };
  });
}

async function writeJsonBatchFile(batchId: string, fileName: string, payload: unknown): Promise<string> {
  const filePath = path.join(batchDir(batchId), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function emptyReferenceResult(mode: GenerateReferenceImagesOptions["mode"], errorCode: string, message: string): GenerateReferenceImagesResult {
  return {
    ok: false,
    mode,
    submitted: 0,
    synced: 0,
    imported: 0,
    importedImages: [],
    commandLogs: [],
    errorCode,
    message
  };
}

function commandLog(result: VideoFactoryCommandResult): GenerateReferenceImagesResult["commandLogs"][number] {
  return {
    command: result.command,
    stdout: result.stdout,
    stderr: result.stderr,
    runtimeDiagnostics: result.runtimeDiagnostics
  };
}

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  const parsed = Number(value || fallback);
  return Math.max(1, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

function isInside(candidate: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

async function listVideoFactoryOutputImages(videoFactoryPath: string): Promise<string[]> {
  const outputRoot = path.join(videoFactoryPath, "output");
  if (!existsSync(outputRoot)) return [];
  const files: string[] = [];
  await walkFiles(outputRoot, files);
  return files.filter((filePath) => imageExtensions.has(path.extname(filePath).toLowerCase()));
}

type BatchSpecificImages = {
  explicitlyFailed: boolean;
  paths: string[];
  zipDiagnostics?: ZipImportDiagnostics;
};

type ZipImportDiagnostics = {
  zipPath: string;
  extractedDir: string;
  foundImageCount: number;
  firstImagePath?: string;
  targetCopyPath?: string;
  copyError?: string;
};

class ZipContainsImageButImportFailedError extends Error {
  constructor(readonly diagnostics: ZipImportDiagnostics) {
    super("Zip contains valid image files but importing them failed.");
  }
}

type RelaxImageSyncManifest = {
  synced?: Array<{
    id?: string;
    status?: string;
    zipPath?: string;
  }>;
};

async function findBatchSpecificImages(videoFactoryPath: string, batchId: string, syncStartedAt?: number): Promise<BatchSpecificImages> {
  const outputRoot = path.join(videoFactoryPath, "output");
  if (!existsSync(outputRoot)) return { explicitlyFailed: false, paths: [] };

  const syncManifest = await readJsonFile<RelaxImageSyncManifest>(path.join(outputRoot, "relax-image-sync.json"));
  const syncedBatch = syncManifest?.synced?.find((entry) => entry.id === batchId);
  if (syncedBatch?.status === "failed") return { explicitlyFailed: true, paths: [] };

  const directImages = (await listVideoFactoryOutputImages(videoFactoryPath))
    .filter((filePath) => !isInside(filePath, path.join(outputRoot, "extracted")))
    .filter((filePath) => filePath.split(path.sep).includes(batchId) || (syncStartedAt !== undefined && isModifiedAfter(filePath, syncStartedAt)))
    .sort(newestFirst);

  const zipPaths = syncedBatch?.zipPath
    ? [syncedBatch.zipPath]
    : syncStartedAt
      ? await listRecentlyModifiedTopLevelZips(outputRoot, syncStartedAt)
      : [];
  const extractedImages: string[] = [];
  let zipDiagnostics: ZipImportDiagnostics | undefined;
  for (const zipPath of zipPaths) {
    if (!isInside(zipPath, outputRoot) || path.extname(zipPath).toLowerCase() !== ".zip" || !existsSync(zipPath)) continue;
    if (!syncedBatch?.zipPath && !isModifiedAfter(zipPath, syncStartedAt)) continue;
    const extracted = await extractSupportedImages(zipPath, path.join(batchDir(batchId), "video-factory-extracted"), batchId);
    extractedImages.push(...extracted.paths);
    if (extracted.diagnostics.foundImageCount > 0) zipDiagnostics = extracted.diagnostics;
  }

  return { explicitlyFailed: false, paths: [...extractedImages, ...directImages], zipDiagnostics };
}

async function listRecentlyModifiedTopLevelZips(outputRoot: string, syncStartedAt: number): Promise<string[]> {
  const entries = await readdir(outputRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".zip")
    .map((entry) => path.join(outputRoot, entry.name))
    .filter((filePath) => isModifiedAfter(filePath, syncStartedAt))
    .sort(newestFirst);
}

async function extractSupportedImages(zipPath: string, extractionRoot: string, batchId: string) {
  const entryList = (await runCommandBuffer("unzip", ["-Z1", zipPath])).toString("utf8");
  const entries = entryList.split(/\r?\n/).filter(Boolean);
  for (const entry of entries) {
    const destination = path.resolve(extractionRoot, entry);
    if (path.isAbsolute(entry) || !isInside(destination, extractionRoot)) {
      throw new Error(`Unsafe zip entry rejected: ${entry}`);
    }
  }

  const imageEntries = entries.filter((entry) => imageExtensions.has(path.extname(entry).toLowerCase()));
  const firstImagePath = imageEntries[0] ? path.resolve(extractionRoot, imageEntries[0]) : undefined;
  const diagnostics: ZipImportDiagnostics = {
    zipPath,
    extractedDir: extractionRoot,
    foundImageCount: imageEntries.length,
    firstImagePath,
    targetCopyPath: firstImagePath ? targetImagePath(batchId, "item_001", firstImagePath) : undefined
  };
  try {
    for (const entry of imageEntries) {
      const destination = path.resolve(extractionRoot, entry);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await runCommandBuffer("unzip", ["-p", zipPath, entry]));
    }
  } catch (error) {
    throw new ZipContainsImageButImportFailedError({ ...diagnostics, copyError: errorMessage(error) });
  }
  const extractedFiles: string[] = [];
  if (existsSync(extractionRoot)) await walkFiles(extractionRoot, extractedFiles);
  const expectedPaths = new Set(imageEntries.map((entry) => path.resolve(extractionRoot, entry)));
  const paths = extractedFiles
    .filter((filePath) => expectedPaths.has(path.resolve(filePath)))
    .filter((filePath) => imageExtensions.has(path.extname(filePath).toLowerCase()))
    .sort();
  if (imageEntries.length > 0 && paths.length === 0) {
    throw new ZipContainsImageButImportFailedError({ ...diagnostics, copyError: "No valid image files were found after extraction." });
  }
  return { paths, diagnostics };
}

function runCommandBuffer(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    const stdout: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        reject(new Error(`${command} failed with exit code ${code}: ${stderr}`));
      }
    });
  });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function isModifiedAfter(filePath: string, startedAt?: number): boolean {
  if (!startedAt) return true;
  return statSync(filePath).mtimeMs >= startedAt - 1000;
}

function newestFirst(a: string, b: string): number {
  return statSync(b).mtimeMs - statSync(a).mtimeMs;
}

async function walkFiles(dir: string, files: string[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}

async function buildRealImageImportResult(
  batchId: string,
  limit: number,
  submitted: number,
  batchImages: BatchSpecificImages,
  commandLogs: GenerateReferenceImagesResult["commandLogs"],
  imageResultPath?: string,
  syncResultPath?: string
): Promise<GenerateReferenceImagesResult> {
  if (batchImages.explicitlyFailed) {
    return {
      ok: false,
      mode: "real",
      submitted,
      synced: 0,
      imported: 0,
      imageResultPath,
      syncResultPath,
      importedImages: [],
      commandLogs,
      errorCode: "REAL_IMAGE_OUTPUT_FAILED",
      message: "VideoFactory reported that the remote image output failed."
    };
  }

  let importedImages: GenerateReferenceImagesResult["importedImages"];
  try {
    importedImages = await importRealImages(batchId, batchImages.paths.slice(0, limit), batchImages.zipDiagnostics);
  } catch (error) {
    if (error instanceof ZipContainsImageButImportFailedError) {
      return zipContainsImageButImportFailedResult({
        submitted,
        imageResultPath,
        syncResultPath,
        commandLogs,
        diagnostics: error.diagnostics
      });
    }
    throw error;
  }
  if (importedImages.length === 0) {
    return {
      ok: true,
      mode: "real",
      submitted,
      synced: 0,
      imported: 0,
      imageResultPath,
      syncResultPath,
      importedImages: [],
      commandLogs,
      errorCode: "WAITING_FOR_REAL_IMAGE_OUTPUT",
      message: waitingForRealImageOutputMessage,
      runtimeDiagnostics: commandLogs.at(-1)?.runtimeDiagnostics
    };
  }

  return {
    ok: true,
    mode: "real",
    submitted,
    synced: batchImages.paths.length,
    imported: importedImages.length,
    imageResultPath,
    syncResultPath,
    importedImages,
    commandLogs,
    message: importedImages.length === 1 ? "Reference image ready for preview." : "Reference images ready for preview.",
    runtimeDiagnostics: commandLogs.at(-1)?.runtimeDiagnostics
  };
}

async function importRealImages(batchId: string, sourcePaths: string[], zipDiagnostics?: ZipImportDiagnostics) {
  const outputDir = path.join(batchDir(batchId), "video-factory-output");
  await mkdir(outputDir, { recursive: true });
  const batch = await loadBatch(batchId);
  const importedImages: GenerateReferenceImagesResult["importedImages"] = [];
  for (let index = 0; index < Math.min(sourcePaths.length, batch.items.length); index += 1) {
    const item = batch.items[index];
    const sourcePath = sourcePaths[index];
    const localPath = targetImagePath(batchId, item.id, sourcePath);
    try {
      await copyFile(sourcePath, localPath);
    } catch (error) {
      if (zipDiagnostics?.foundImageCount) {
        throw new ZipContainsImageButImportFailedError({
          ...zipDiagnostics,
          targetCopyPath: localPath,
          copyError: errorMessage(error)
        });
      }
      throw error;
    }
    importedImages.push({
      itemId: item.id,
      sourcePath,
      localPath,
      previewUrl: imagePreviewUrl(localPath)
    });
  }
  return importedImages;
}

function zipContainsImageButImportFailedResult({
  submitted,
  imageResultPath,
  syncResultPath,
  commandLogs,
  diagnostics
}: {
  submitted: number;
  imageResultPath?: string;
  syncResultPath?: string;
  commandLogs: GenerateReferenceImagesResult["commandLogs"];
  diagnostics: ZipImportDiagnostics;
}): GenerateReferenceImagesResult {
  return {
    ok: false,
    mode: "real",
    submitted,
    synced: 0,
    imported: 0,
    imageResultPath,
    syncResultPath,
    importedImages: [],
    commandLogs,
    errorCode: "ZIP_CONTAINS_IMAGE_BUT_IMPORT_FAILED",
    message: "Zip contains valid image files but importing them failed.",
    ...diagnostics
  };
}

function targetImagePath(batchId: string, itemId: string, sourcePath: string): string {
  const ext = path.extname(sourcePath).toLowerCase() || ".png";
  return path.join(batchDir(batchId), "video-factory-output", `${itemId}${ext}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function imagePreviewUrl(localPath: string): string {
  return `/api/video-batches/image-preview?file=${encodeURIComponent(localPath)}`;
}
