# Provider Endpoint Coverage Report

Generated for the provider architecture regression audit. This is an architecture coverage report, not a claim of full API integration. No real provider request or web action was executed during this audit.

## Coverage Summary

| Provider | Implemented | Manifest total | Missing or unverified |
| --- | ---: | ---: | ---: |
| PixVerse Official API | 4 | 22 | 18 |
| PixVerse Web | 0 | 0 observed endpoints | 0 recorded; HAR capture pending |
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

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `none_observed_yet` | `none` | `false` | `Manual HAR source not recorded yet` | `experimental_web` | `yes` | `yes` | `no` |

## Pai Official API

Stability: `scaffold`. Credentials: `PAI_OFFICIAL_API_KEY` only. PixVerse endpoints are not reused. Real tests executed: `no`.

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pai_official_manifest_incomplete` | `credit_balance` | `false` | `Official docs not configured` | `scaffold` | `yes` | `yes` | `no` |

## Pai Web

Stability: `experimental_web`. Session profile: `PAI_WEB_SESSION_PROFILE` only. Automatic web actions: disabled. Real tests executed: `no`.

| Endpoint ID | Capability | Implemented | Docs/source URL or HAR source | Stability | Missing request schema | Missing response schema | Real test executed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `none_observed_yet` | `none` | `false` | `Manual HAR source not recorded yet` | `experimental_web` | `yes` | `yes` | `no` |

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
