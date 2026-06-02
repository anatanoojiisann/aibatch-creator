import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

  const har = { log: { entries: [{ request: { headers: [{ name: "Cookie", value: "session=secret" }, { name: "Authorization", value: "Bearer secret" }] } }] } };
  const pixverseHar = parsePixVerseWebHar(har);
  const paiHar = parsePaiWebHar(har);
  assert.equal(pixverseHar.providerId, "pixverse_web");
  assert.equal(paiHar.providerId, "pai_web");
  assert(!JSON.stringify(pixverseHar).includes("session=secret"));
  assert(!JSON.stringify(paiHar).includes("Bearer secret"));

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

  console.log(JSON.stringify({ ok: true, providerIds: providers.map((provider) => provider.id), checks: 40 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
