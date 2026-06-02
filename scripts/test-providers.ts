import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getCreditBalance } from "@/lib/providers/providerBalance";
import { assertProviderAssetScope } from "@/lib/providers/providerAsset";
import { requireProviderCapability } from "@/lib/providers/providerCapability";
import { getProviderDiagnostics } from "@/lib/providers/providerDiagnostics";
import { getProviderDefinition, getProviderRegistry } from "@/lib/providers/providerRegistry";
import { ProviderAsset } from "@/lib/providers/providerTypes";
import { assertProviderVideoTaskScope } from "@/lib/providers/providerTask";
import {
  buildPixVerseBalanceRequest,
  buildPixVerseImageToVideoRequest,
  buildPixVerseUploadImageRequest,
  buildPixVerseVideoStatusRequest
} from "@/lib/providers/pixverseOfficial/pixverseOfficialRequestBuilders";
import {
  parsePixVerseOfficialBalanceResponse,
  parsePixVerseOfficialImageToVideoResponse,
  parsePixVerseOfficialUploadImageResponse
} from "@/lib/providers/pixverseOfficial/pixverseOfficialResponseParsers";
import { parsePixVerseOfficialVideoStatus } from "@/lib/providers/pixverseOfficial/pixverseOfficialStatusParser";
import { parsePixVerseWebHar } from "@/lib/providers/pixverseWeb/pixverseWebHarParser";
import { parsePaiWebHar } from "@/lib/providers/paiWeb/paiWebHarParser";
import { PixVerseWebAdapter } from "@/lib/providers/pixverseWeb/pixverseWebAdapter";
import { PaiWebAdapter } from "@/lib/providers/paiWeb/paiWebAdapter";
import { pixverseWebObservedEndpointManifest } from "@/lib/providers/pixverseWeb/pixverseWebObservedEndpointManifest";
import { paiWebObservedEndpointManifest } from "@/lib/providers/paiWeb/paiWebObservedEndpointManifest";
import {
  getProviderSettingsDiagnostics,
  saveProviderSettings,
  testProviderSettingsConnection
} from "@/lib/providers/providerSettings";

async function main() {
  const expectedPixVerseOfficialEndpointIds = [
    "pixverse_official_text_to_video",
    "pixverse_official_image_to_video",
    "pixverse_official_template_video",
    "pixverse_official_transition",
    "pixverse_official_lip_sync",
    "pixverse_official_lip_sync_tts_list",
    "pixverse_official_fusion",
    "pixverse_official_multi_transition",
    "pixverse_official_restyle",
    "pixverse_official_restyle_effect_list",
    "pixverse_official_swap_mask",
    "pixverse_official_swap_video",
    "pixverse_official_sound_effect",
    "pixverse_official_extend",
    "pixverse_official_video_status",
    "pixverse_official_motion_control_mimic",
    "pixverse_official_modify",
    "pixverse_official_image_template",
    "pixverse_official_image_status",
    "pixverse_official_upload_image",
    "pixverse_official_credit_balance",
    "pixverse_official_media_upload"
  ];
  const providers = getProviderRegistry();
  assert.deepEqual(providers.map((provider) => provider.id), [
    "pixverse_official_api",
    "pixverse_web",
    "pai_official_api",
    "pai_web",
    "custom_platform"
  ]);
  assert.equal(getProviderDefinition("pixverse_official_api").accountScope, "pixverse");
  assert.equal(getProviderDefinition("pai_official_api").accountScope, "pai");
  assert.notEqual(getProviderDefinition("pixverse_official_api").balanceScope, getProviderDefinition("pai_official_api").balanceScope);
  assert.equal(getProviderDefinition("pixverse_web").sessionProfileEnvKey, "PIXVERSE_WEB_SESSION_PROFILE");
  assert.equal(getProviderDefinition("pai_web").sessionProfileEnvKey, "PAI_WEB_SESSION_PROFILE");
  assert.notEqual(getProviderDefinition("pixverse_web").sessionProfileEnvKey, getProviderDefinition("pai_web").sessionProfileEnvKey);
  assert.equal(new PixVerseWebAdapter().sessionProfileEnvKey, "PIXVERSE_WEB_SESSION_PROFILE");
  assert.equal(new PaiWebAdapter().sessionProfileEnvKey, "PAI_WEB_SESSION_PROFILE");

  process.env.PIXVERSE_OFFICIAL_API_KEY = "pixverse-secret-for-test";
  process.env.PAI_OFFICIAL_API_KEY = "pai-secret-for-test";
  process.env.CUSTOM_PLATFORM_API_KEY = "custom-secret-for-test";
  const pixverseRequest = buildPixVerseBalanceRequest();
  const pixverseHeaders = pixverseRequest.init.headers as Record<string, string>;
  assert.equal(pixverseHeaders["API-KEY"], "pixverse-secret-for-test");
  assert.equal(Object.values(pixverseHeaders).includes("pai-secret-for-test"), false);
  assert(buildPixVerseImageToVideoRequest({ imgId: 1, prompt: "unit test" }).url.endsWith("/openapi/v2/video/img/generate"));
  assert(buildPixVerseUploadImageRequest(new Blob(["unit test"]), "unit-test.png").url.endsWith("/openapi/v2/image/upload"));
  assert(buildPixVerseVideoStatusRequest("task/42").url.endsWith("/openapi/v2/video/result/task%2F42"));
  assert.deepEqual(parsePixVerseOfficialBalanceResponse({ Resp: { account_id: "account-1", credit_monthly: 2, credit_package: 3 } }), {
    account_id: "account-1",
    credit_monthly: 2,
    credit_package: 3
  });
  assert.deepEqual(parsePixVerseOfficialUploadImageResponse({ Resp: { img_id: 42, img_url: "https://example.invalid/image.png" } }), {
    providerAssetId: "42",
    providerAssetUrl: "https://example.invalid/image.png"
  });
  assert.deepEqual(parsePixVerseOfficialImageToVideoResponse({ Resp: { video_id: 84 } }), { providerTaskId: "84" });
  assert.deepEqual(parsePixVerseOfficialVideoStatus({ Resp: { status: 1, url: "https://example.invalid/video.mp4" } }), {
    status: "video_succeeded",
    providerRawStatus: 1,
    videoUrl: "https://example.invalid/video.mp4"
  });
  assert.deepEqual(getProviderDefinition("pixverse_official_api").credentialEnvKeys, ["PIXVERSE_OFFICIAL_API_KEY"]);
  assert.deepEqual(getProviderDefinition("pai_official_api").credentialEnvKeys, ["PAI_OFFICIAL_API_KEY"]);

  const pixversePaths = new Set(getProviderDefinition("pixverse_official_api").endpointManifest.map((endpoint) => endpoint.path));
  assert(getProviderDefinition("pai_official_api").endpointManifest.every((endpoint) => !endpoint.implemented));
  assert(getProviderDefinition("pai_official_api").endpointManifest.every((endpoint) => !endpoint.path || !pixversePaths.has(endpoint.path)));

  const har = {
    log: {
      entries: [{
        request: {
          method: "POST",
          url: "https://web.example.invalid/api/image-to-video/123?token=query-secret&item=item_001",
          headers: [
            { name: "Cookie", value: "session=secret" },
            { name: "Authorization", value: "Bearer secret" },
            { name: "Content-Type", value: "application/json" }
          ],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({ access_token: "body-secret", prompt: "neutral prompt", email: "private@example.invalid" })
          }
        },
        response: {
          status: 200,
          headers: [{ name: "Set-Cookie", value: "session=response-secret" }],
          content: { mimeType: "application/json", text: JSON.stringify({ refresh_token: "response-secret", task_id: "safe-task" }) }
        }
      }, {
        request: {
          method: "POST",
          url: "https://web.example.invalid/api/image-to-video/456?item=item_002",
          headers: [{ name: "Content-Type", value: "application/json" }],
          postData: { mimeType: "application/json", text: JSON.stringify({ prompt: "second neutral prompt", seed: 42 }) }
        },
        response: {
          status: 202,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify({ task_id: "safe-task-2", status: "queued" }) }
        }
      }, {
        request: { method: "GET", url: "https://web.example.invalid/assets/app.js", headers: [] },
        response: { status: 200, headers: [{ name: "Content-Type", value: "text/javascript" }] }
      }, {
        request: { method: "POST", url: "https://analytics.example.invalid/collect", headers: [] },
        response: { status: 204, headers: [] }
      }]
    }
  };
  const pixverseHar = parsePixVerseWebHar(har);
  const paiHar = parsePaiWebHar(har);
  assert.equal(pixverseHar.providerId, "pixverse_web");
  assert.equal(paiHar.providerId, "pai_web");
  const pixverseHarJson = JSON.stringify(pixverseHar);
  const paiHarJson = JSON.stringify(paiHar);
  assert(!pixverseHarJson.includes("session=secret"));
  assert(!pixverseHarJson.includes("Bearer secret"));
  assert(!pixverseHarJson.includes("query-secret"));
  assert(!pixverseHarJson.includes("body-secret"));
  assert(!pixverseHarJson.includes("private@example.invalid"));
  assert(!paiHarJson.includes("response-secret"));
  assert.equal(pixverseHar.endpoints.length, 1);
  assert.equal(paiHar.endpoints.length, 1);
  assert.equal(pixverseHar.endpoints[0].providerId, "pixverse_web");
  assert.equal(paiHar.endpoints[0].providerId, "pai_web");
  assert.equal(pixverseHar.endpoints[0].operationGuess, "image_to_video");
  assert.equal(paiHar.endpoints[0].operationGuess, "image_to_video");
  assert.equal(pixverseHar.endpoints[0].path, "/api/image-to-video/{id}");
  assert.equal(pixverseHar.endpoints[0].sampleCount, 2);
  assert.deepEqual(pixverseHar.endpoints[0].statusCodesObserved.sort(), [200, 202]);
  assert.equal(pixverseHar.endpoints[0].source, "har");
  assert.equal(pixverseHar.coverage.completeGenerationFlow, false);
  assert(pixverseHar.coverage.missingGenerationFlowOperations.includes("task status or task detail polling"));
  assert(pixverseHar.coverage.missingGenerationFlowOperations.includes("generated result or download result"));
  assert.equal(pixverseHar.endpoints[0].implemented, false);
  assert.equal(paiHar.endpoints[0].implemented, false);
  assert.equal(pixverseHar.endpoints[0].stability, "experimental_web");
  assert.equal(paiHar.endpoints[0].stability, "experimental_web");

  const settingsDir = mkdtempSync(path.join(tmpdir(), "aibatch-provider-settings-"));
  const settingsPath = path.join(settingsDir, ".env.local");
  try {
    const saved = saveProviderSettings("pixverse_official_api", {
      PIXVERSE_OFFICIAL_API_KEY: "saved-pixverse-test-key",
      PIXVERSE_OFFICIAL_BASE_URL: "https://app-api.pixverse.ai"
    }, settingsPath);
    assert(!JSON.stringify(saved).includes("saved-pixverse-test-key"));
    assert.throws(() => saveProviderSettings("pixverse_official_api", { PAI_OFFICIAL_API_KEY: "wrong-scope" }, settingsPath), /not allowed/);
    const savedDiagnostics = getProviderSettingsDiagnostics(settingsPath);
    const savedPixverse = savedDiagnostics.find((entry) => entry.id === "pixverse_official_api");
    const savedPai = savedDiagnostics.find((entry) => entry.id === "pai_official_api");
    assert.equal(savedPixverse?.fields.find((field) => field.envKey === "PIXVERSE_OFFICIAL_API_KEY")?.fingerprint?.present, true);
    assert.equal(savedPai?.fields.find((field) => field.envKey === "PAI_OFFICIAL_API_KEY")?.fingerprint?.present, true);
    assert(!JSON.stringify(savedDiagnostics).includes("saved-pixverse-test-key"));
  } finally {
    rmSync(settingsDir, { recursive: true, force: true });
  }

  let requestedUrl = "";
  let requestedKey = "";
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    requestedKey = String((init?.headers as Record<string, string>)?.["API-KEY"] || "");
    return new Response(JSON.stringify({ ErrCode: 0, ErrMsg: "success", Resp: { credit_monthly: 2, credit_package: 3 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  const balance = await getCreditBalance("pixverse_official_api", fakeFetch);
  assert.equal(balance.ok, true);
  assert(requestedUrl.endsWith("/openapi/v2/account/balance"));
  assert.equal(requestedKey, "pixverse-secret-for-test");
  assert.deepEqual(await getCreditBalance("pai_official_api", fakeFetch), {
    ok: false,
    errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
    providerId: "pai_official_api",
    capability: "credit_balance"
  });
  requestedUrl = "";
  const settingsConnection = await testProviderSettingsConnection("pixverse_official_api", fakeFetch);
  assert.equal(settingsConnection.ok, true);
  assert(requestedUrl.endsWith("/openapi/v2/account/balance"));
  assert(!requestedUrl.includes("/generate"));
  assert.deepEqual(await testProviderSettingsConnection("pai_official_api", fakeFetch), {
    ok: false,
    providerId: "pai_official_api",
    keyFingerprint: {
      present: true,
      length: "pai-secret-for-test".length,
      masked: "pai-...test",
      sha256Prefix: "649997c1bb33"
    },
    baseUrl: "",
    capabilityTested: "none",
    status: "unsupported_scaffold",
    sanitizedError: "Pai Official API connection testing is not available until its endpoint contract is configured."
  });

  const pixverseAsset: ProviderAsset = {
    providerId: "pixverse_official_api",
    providerGroup: "pixverse",
    providerSource: "official_api",
    localBatchId: "batch_test",
    localItemId: "item_001",
    providerAssetId: "pixverse-img-1",
    uploadedAt: new Date(0).toISOString()
  };
  assert.throws(() => assertProviderAssetScope(pixverseAsset, getProviderDefinition("pai_official_api")), /cannot be reused/);
  assert.throws(() => assertProviderVideoTaskScope({
    providerId: "pixverse_official_api",
    providerGroup: "pixverse",
    providerSource: "official_api",
    accountScope: "pixverse",
    providerTaskId: "pixverse-video-1"
  }, getProviderDefinition("pai_official_api")), /cannot be reused/);
  assert.deepEqual(requireProviderCapability("pai_official_api", "image_to_video"), {
    ok: false,
    errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
    providerId: "pai_official_api",
    capability: "image_to_video",
    message: "Pai Official API does not currently support image_to_video."
  });
  assert.deepEqual(requireProviderCapability("pixverse_official_api", "text_to_video"), {
    ok: false,
    errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
    providerId: "pixverse_official_api",
    capability: "text_to_video",
    message: "PixVerse Official API does not currently support text_to_video."
  });

  const workflowPage = readFileSync("app/video-workflow/page.tsx", "utf8");
  assert(workflowPage.includes('<optgroup label="PixVerse">'));
  assert(workflowPage.includes('<optgroup label="Pai">'));
  assert(workflowPage.includes("Configure provider in Provider Settings"));
  assert(workflowPage.includes("!selectedProviderConfigReady"));
  assert(workflowPage.includes("There is no silent VideoFactory fallback."));
  const settingsSaveRoute = readFileSync("app/api/provider-settings/save/route.ts", "utf8");
  assert(settingsSaveRoute.includes("saveProviderSettings"));
  const settingsTestRoute = readFileSync("app/api/provider-settings/test/route.ts", "utf8");
  assert(settingsTestRoute.includes("testProviderSettingsConnection"));
  assert(!settingsTestRoute.includes("submitImageToVideo"));
  const capturePage = readFileSync("app/web-api-capture/page.tsx", "utf8");
  assert(capturePage.includes("Experimental manual HAR only."));
  assert(capturePage.includes("No CAPTCHA bypass. No stealth. No automated scraping."));
  const gitignore = readFileSync(".gitignore", "utf8");
  assert(gitignore.includes(".env.local"));
  const submitRoute = readFileSync("app/api/video-batches/submit-videos/route.ts", "utf8");
  assert(submitRoute.indexOf("return submitSelectedProviderRealVideo") < submitRoute.indexOf("createVideoFactoryAdapter().submitVideos"));
  assert(submitRoute.includes('status: "video_mocked" as const'));
  const uploadRoute = readFileSync("app/api/video-batches/upload-provider-image/route.ts", "utf8");
  assert(uploadRoute.includes("REAL_UPLOAD_CONFIRMATION_MISSING"));
  assert(uploadRoute.includes('body.providerId !== "pixverse_official_api"'));
  assert(uploadRoute.includes("PIXVERSE_OFFICIAL_API_KEY"));

  const diagnosticsJson = JSON.stringify(getProviderDiagnostics());
  assert(!diagnosticsJson.includes("pixverse-secret-for-test"));
  assert(!diagnosticsJson.includes("pai-secret-for-test"));
  assert(!diagnosticsJson.includes("custom-secret-for-test"));
  assert(getProviderDefinition("pixverse_web").experimental);
  assert(getProviderDefinition("pai_web").experimental);
  const pixverseOfficial = getProviderDefinition("pixverse_official_api");
  assert.deepEqual(pixverseOfficial.endpointManifest.map((endpoint) => endpoint.id), expectedPixVerseOfficialEndpointIds);
  assert.equal(pixverseOfficial.endpointManifest.filter((endpoint) => endpoint.implemented).length, 4);
  assert.equal(pixverseOfficial.endpointManifest.length, 22);
  assert(pixverseOfficial.endpointManifest.every((endpoint) => endpoint.stability === "official"));
  assert(pixverseOfficial.endpointManifest.filter((endpoint) => !endpoint.implemented).every((endpoint) => !pixverseOfficial.capabilities.includes(endpoint.capability)));
  assert.equal(getProviderDefinition("pai_official_api").endpointManifest.filter((endpoint) => endpoint.implemented).length, 0);
  assert.equal(getProviderDefinition("pai_official_api").endpointManifest.length, 1);
  assert(pixverseWebObservedEndpointManifest.length > 0);
  assert(pixverseWebObservedEndpointManifest.every((endpoint) => endpoint.providerId === "pixverse_web"));
  assert(pixverseWebObservedEndpointManifest.every((endpoint) => endpoint.implemented === false));
  assert(pixverseWebObservedEndpointManifest.every((endpoint) => endpoint.stability === "experimental_web"));
  assert(pixverseWebObservedEndpointManifest.every((endpoint) => endpoint.source === "har"));
  assert.equal(paiWebObservedEndpointManifest.length, 0);
  const coverageReport = readFileSync("storage/provider-endpoint-coverage-report.md", "utf8");
  assert(coverageReport.includes("Complete generation flow: `false`."));
  assert(coverageReport.includes("`upload image or upload media`"));
  assert(coverageReport.includes("`image-to-video or text-to-video generation creation`"));

  console.log(JSON.stringify({ ok: true, providerIds: providers.map((provider) => provider.id), checks: 79 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
