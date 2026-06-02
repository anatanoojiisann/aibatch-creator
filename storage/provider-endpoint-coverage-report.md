# Provider Endpoint Coverage Report

Generated for the provider architecture regression audit. This is an architecture coverage report, not a claim of full API integration. No real provider request or web action was executed during this audit.

## Coverage Summary

| Provider | Implemented | Manifest total | Missing or unverified |
| --- | ---: | ---: | ---: |
| PixVerse Official API | 4 | 22 | 18 |
| PixVerse Web | 0 | 34 observed endpoints | 34 recorded; sanitized HAR import |
| Pai Official API | 0 | 1 placeholder entry | 1 |
| Pai Web | 0 | 0 observed endpoints | 0 recorded; HAR capture pending |
| Custom Platform | 0 | 1 placeholder entry | 1 |

## PixVerse Official API

Stability: `official`. Credentials: `PIXVERSE_OFFICIAL_API_KEY` only. Real tests executed: `no`.

Scope: all 22 endpoint pages listed under API Reference at `https://docs.platform.pixverse.ai/`. Guide pages such as webhook integration and rate limits are not outbound PixVerse API endpoints and are intentionally excluded.

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pixverse_official_text_to_video` | `text_to_video` | `false` | `https://docs.platform.pixverse.ai/text-to-video-generation-13016634e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_image_to_video` | `image_to_video` | `true` | `https://docs.platform.pixverse.ai/image-to-video-generation-13016633e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_template_video` | `template_video` | `false` | `https://docs.platform.pixverse.ai/template-video-generation-33889423e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_transition` | `transition_video` | `false` | `https://docs.platform.pixverse.ai/transitionfirst-last-frame-generation-15123014e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_lip_sync` | `lip_sync` | `false` | `https://docs.platform.pixverse.ai/speechlipsync-generation-19094278e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_lip_sync_tts_list` | `lip_sync_tts_list` | `false` | `https://docs.platform.pixverse.ai/get-speechlipsync-tts-list-19094355e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_fusion` | `fusion_video` | `false` | `https://docs.platform.pixverse.ai/fusionreference-to-video-generation-19884194e0` | `official` | `no` | `yes: official example incomplete` | `no` |
| `pixverse_official_multi_transition` | `multi_transition_video` | `false` | `https://docs.platform.pixverse.ai/multi-transition-video-generation-24001841e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_restyle` | `restyle_video` | `false` | `https://docs.platform.pixverse.ai/restyle-video-generation-21992681e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_restyle_effect_list` | `restyle_effect_list` | `false` | `https://docs.platform.pixverse.ai/restyle-effect-list-21992862e0` | `official` | `no` | `yes: official example incomplete` | `no` |
| `pixverse_official_swap_mask` | `swap_mask` | `false` | `https://docs.platform.pixverse.ai/swap-mask-generation-24001877e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_swap_video` | `swap_video` | `false` | `https://docs.platform.pixverse.ai/swap-video-generation-24001839e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_sound_effect` | `sound_effect` | `false` | `https://docs.platform.pixverse.ai/sound-effect-generation-19884196e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_extend` | `extend_video` | `false` | `https://docs.platform.pixverse.ai/extend-generation-19094393e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_video_status` | `video_status` | `true` | `https://docs.platform.pixverse.ai/get-video-generation-status-13016632e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_motion_control_mimic` | `motion_control` | `false` | `https://docs.platform.pixverse.ai/motion-control-mimic-generation-28748523e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_modify` | `modify_video` | `false` | `https://docs.platform.pixverse.ai/modify-generation-33365578e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_image_template` | `image_template` | `false` | `https://docs.platform.pixverse.ai/image-template-generation-27564921e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_image_status` | `image_status` | `false` | `https://docs.platform.pixverse.ai/get-image-generation-27565028e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_upload_image` | `upload_image` | `true` | `https://docs.platform.pixverse.ai/upload-image-13016631e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_credit_balance` | `credit_balance` | `true` | `https://docs.platform.pixverse.ai/get-user-credit-balance-13778989e0` | `official` | `no` | `no` | `no` |
| `pixverse_official_media_upload` | `media_upload` | `false` | `https://docs.platform.pixverse.ai/upload-videoaudio-19094225e0` | `official` | `no` | `no` | `no` |

## PixVerse Web

Stability: `experimental_web`. Session profile: `PIXVERSE_WEB_SESSION_PROFILE` only. Automatic web actions: disabled. Real tests executed: `no`.

### PixVerse Web Observed Endpoints

<!-- PIXVERSE_WEB_OBSERVED:START -->
Total observed endpoint count: `34`.
Last sanitized HAR import: `2026-06-02T12:45:01.782Z`. Source HAR fingerprint: `b5c2c0bc2b96`.
Raw HAR persisted: `no`. Secret redaction status: `applied`. Observed endpoints default to `implemented=false`.
Endpoint IDs: `pixverse_web_unknown_768d7167e1`, `pixverse_web_unknown_f35e68ffd9`, `pixverse_web_unknown_407a70029c`, `pixverse_web_unknown_360075796b`, `pixverse_web_config_2339f731dc`, `pixverse_web_credit_balance_90d1b134a6`, `pixverse_web_task_list_db73f48552`, `pixverse_web_unknown_18200577b9`, `pixverse_web_user_profile_be9d38739b`, `pixverse_web_unknown_90a6b14316`, `pixverse_web_unknown_cd92a1ef12`, `pixverse_web_user_profile_33c9a15710`, `pixverse_web_unknown_f41ed17098`, `pixverse_web_asset_library_bd75a2ebee`, `pixverse_web_user_profile_45a238411c`, `pixverse_web_user_profile_48bc811ef3`, `pixverse_web_unknown_5a747efaee`, `pixverse_web_asset_library_81ff94ff3c`, `pixverse_web_credit_balance_7263e92cae`, `pixverse_web_pricing_d491d4637b`, `pixverse_web_unknown_2ca5e548ff`, `pixverse_web_unknown_1f38f985d7`, `pixverse_web_unknown_88eced8d7b`, `pixverse_web_unknown_5e61bb90c4`, `pixverse_web_unknown_60580b7271`, `pixverse_web_pricing_bb7a7bbfb5`, `pixverse_web_tts_83e0fb1fed`, `pixverse_web_restyle_1128468b87`, `pixverse_web_unknown_c4b322d8d6`, `pixverse_web_pricing_aef703d7aa`, `pixverse_web_unknown_c9e3a3adcf`, `pixverse_web_unknown_35e2046a39`, `pixverse_web_unknown_d8c8986da0`, `pixverse_web_unknown_3a0e550955`.
Operation guesses: `asset_library`, `config`, `credit_balance`, `pricing`, `restyle`, `task_list`, `tts`, `unknown`, `user_profile`.
Complete generation flow: `false`.
Missing operations: `upload image or upload media`, `image-to-video or text-to-video generation creation`, `task status or task detail polling`, `generated result or download result`.

| Endpoint ID | Operation guess | Method | Host and path | Samples | Status codes | Implemented | Stability |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `pixverse_web_unknown_768d7167e1` | `unknown` | `GET` | `app.pixverse.ai/manifest.webmanifest` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_f35e68ffd9` | `unknown` | `POST` | `www.google.com/ccm/collect` | `4` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_407a70029c` | `unknown` | `POST` | `www.google.com/rmkt/collect/{id}/` | `4` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_360075796b` | `unknown` | `GET` | `www.googleadservices.com/pagead/conversion/{id}/` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_config_2339f731dc` | `config` | `POST` | `app-api.pixverse.ai/creative_platform/config` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_credit_balance_90d1b134a6` | `credit_balance` | `GET` | `app-api.pixverse.ai/creative_platform/config/ad_credits` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_task_list_db73f48552` | `task_list` | `GET` | `app-api.pixverse.ai/creative_platform/task/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_18200577b9` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/invite/bonus/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_user_profile_be9d38739b` | `user_profile` | `POST` | `app-api.pixverse.ai/creative_platform/invite/account/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_90a6b14316` | `unknown` | `POST` | `app-api.pixverse.ai/creative_platform/internal_message/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_cd92a1ef12` | `unknown` | `POST` | `app-api.pixverse.ai/creative_platform/asset/library/models` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_user_profile_33c9a15710` | `user_profile` | `GET` | `app-api.pixverse.ai/creative_platform/getUserInfo` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_f41ed17098` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/team/workspace/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_asset_library_bd75a2ebee` | `asset_library` | `POST` | `app-api.pixverse.ai/creative_platform/asset/library/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_user_profile_45a238411c` | `user_profile` | `GET` | `www.google.com/pagead/1p-user-list/{id}/` | `4` | `200` | `false` | `experimental_web` |
| `pixverse_web_user_profile_48bc811ef3` | `user_profile` | `GET` | `www.google.com.sg/pagead/1p-user-list/{id}/` | `4` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_5a747efaee` | `unknown` | `POST` | `experiment.pixverse.ai/api/v2/abtest/online/results` | `3` | `200` | `false` | `experimental_web` |
| `pixverse_web_asset_library_81ff94ff3c` | `asset_library` | `GET` | `app-api.pixverse.ai/creative_platform/asset/folder/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_credit_balance_7263e92cae` | `credit_balance` | `GET` | `app-api.pixverse.ai/creative_platform/user/credits` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_pricing_d491d4637b` | `pricing` | `POST` | `app-api.pixverse.ai/creative_platform/toc/members/plan_details` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_2ca5e548ff` | `unknown` | `POST` | `app-api.pixverse.ai/creative_platform/toc/products/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_1f38f985d7` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/feedback/tags` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_88eced8d7b` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/banners` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_5e61bb90c4` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/showvideos` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_60580b7271` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/content/categories/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_pricing_bb7a7bbfb5` | `pricing` | `POST` | `app-api.pixverse.ai/creative_platform/pricing/formulas` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_tts_83e0fb1fed` | `tts` | `GET` | `app-api.pixverse.ai/creative_platform/video/tts/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_restyle_1128468b87` | `restyle` | `POST` | `app-api.pixverse.ai/creative_platform/restyle/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_c4b322d8d6` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/content/categories/secondary` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_pricing_aef703d7aa` | `pricing` | `GET` | `app-api.pixverse.ai/creative_platform/content/template/price/multiplier` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_c9e3a3adcf` | `unknown` | `GET` | `app-api.pixverse.ai/creative_platform/campaign/list` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_35e2046a39` | `unknown` | `POST` | `app.pixverse.ai/cdn-cgi/rum` | `1` | `204` | `false` | `experimental_web` |
| `pixverse_web_unknown_d8c8986da0` | `unknown` | `POST` | `www.google.com/pagead/form-data/{id}` | `1` | `200` | `false` | `experimental_web` |
| `pixverse_web_unknown_3a0e550955` | `unknown` | `POST` | `www.google.com/ccm/form-data/{id}` | `1` | `204` | `false` | `experimental_web` |
<!-- PIXVERSE_WEB_OBSERVED:END -->

## Pai Official API

Stability: `scaffold`. Credentials: `PAI_OFFICIAL_API_KEY` only. PixVerse endpoints are not reused. Real tests executed: `no`.

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pai_official_manifest_incomplete` | `credit_balance` | `false` | `Official docs not configured` | `scaffold` | `yes` | `yes` | `no` |

## Pai Web

Stability: `experimental_web`. Session profile: `PAI_WEB_SESSION_PROFILE` only. Automatic web actions: disabled. Real tests executed: `no`.

### Pai Web Observed Endpoints

<!-- PAI_WEB_OBSERVED:START -->
Total observed endpoint count: `0`. Status: `HAR capture pending.` Imported HAR files are sanitized and discarded; raw HAR storage is disabled. Observed endpoints default to `implemented=false`.

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `none_observed_yet` | `none` | `false` | `Manual HAR source not recorded yet` | `experimental_web` | `yes` | `yes` | `no` |
<!-- PAI_WEB_OBSERVED:END -->

## Custom Platform

Stability: `scaffold`. Credentials: `CUSTOM_PLATFORM_API_KEY`. Real tests executed: `no`.

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `custom_platform_manifest_incomplete` | `credit_balance` | `false` | `Custom contract not configured` | `scaffold` | `yes` | `yes` | `no` |

## Isolation Regression

- Registry IDs: `pixverse_official_api`, `pixverse_web`, `pai_official_api`, `pai_web`, `custom_platform`.
- PixVerse official credentials and balance scope are separate from Pai official credentials and balance scope.
- PixVerse Web uses `PIXVERSE_WEB_SESSION_PROFILE`; Pai Web uses `PAI_WEB_SESSION_PROFILE`.
- Uploaded image assets are validated against provider ID, group, and source before reuse.
- Video task IDs are validated against provider ID, group, source, and account scope before status sync.
- HAR parsing redacts cookies, authorization headers, and token/session fields.
- Web adapters remain experimental manual-HAR adapters with automatic actions disabled.

## Integration Claim

Do not describe this as full API integration. PixVerse Official API has 22 documented endpoint manifest entries: 4 implemented entries with request builders, response parsers, and unit coverage; 18 explicitly disabled entries without complete implementation coverage. No real endpoint test was executed during this audit. Pai Official API, Pai Web, PixVerse Web, and Custom Platform remain scaffolded or experimental as listed above.
