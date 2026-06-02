export type ProviderGroup = "pixverse" | "pai" | "custom";
export type ProviderSource = "official_api" | "web";
export type ProviderId =
  | "pixverse_official_api"
  | "pixverse_web"
  | "pai_official_api"
  | "pai_web"
  | "custom_platform";

export type ProviderCapability =
  | "credit_balance"
  | "reference_image_generation"
  | "upload_image"
  | "image_to_video"
  | "video_status"
  | "text_to_video"
  | "template_video"
  | "transition_video"
  | "lip_sync"
  | "lip_sync_tts_list"
  | "fusion_video"
  | "multi_transition_video"
  | "restyle_video"
  | "restyle_effect_list"
  | "swap_mask"
  | "swap_video"
  | "sound_effect"
  | "extend_video"
  | "motion_control"
  | "modify_video"
  | "image_template"
  | "image_status"
  | "media_upload";

export type ProviderEndpointManifestEntry = {
  id: string;
  providerId: ProviderId;
  providerGroup: ProviderGroup;
  providerSource: ProviderSource;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  baseUrlEnvKey: string;
  docsUrl: string;
  authRequired: boolean;
  capability: ProviderCapability;
  requestSchema: string;
  responseSchema: string;
  implemented: boolean;
  stability: "official" | "stable" | "experimental" | "incomplete";
  notes: string;
};

export type ProviderDefinition = {
  id: ProviderId;
  group: ProviderGroup;
  source: ProviderSource;
  label: string;
  accountScope: ProviderGroup;
  credentialEnvKeys: string[];
  baseUrlEnvKey?: string;
  sessionMode?: "manual_har";
  sessionProfileEnvKey?: string;
  balanceScope: string;
  stable: boolean;
  experimental?: boolean;
  capabilities: ProviderCapability[];
  endpointManifest: ProviderEndpointManifestEntry[];
  limitations: string[];
};

export type UnsupportedProviderCapability = {
  ok: false;
  errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED";
  providerId: ProviderId;
  capability: ProviderCapability;
};

export type ProviderAsset = {
  providerId: ProviderId;
  providerGroup: ProviderGroup;
  providerSource: ProviderSource;
  localBatchId: string;
  localItemId: string;
  providerAssetId?: string;
  providerAssetUrl?: string;
  localPath?: string;
  previewUrl?: string;
  uploadedAt: string;
  rawResponse?: unknown;
};

export type ProviderVideoTask = {
  providerId: ProviderId;
  providerGroup: ProviderGroup;
  providerSource: ProviderSource;
  accountScope: ProviderGroup;
  providerTaskId?: string;
  providerAssetId?: string;
  providerUploadId?: string;
  providerCreditBalanceSnapshot?: unknown;
  providerRawStatus?: unknown;
  providerRawResponse?: unknown;
};
