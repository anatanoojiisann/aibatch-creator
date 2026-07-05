# AI Batch Creator

AI Batch Creator is a local-first Next.js app for planning, validating, and running AI video batch workflows.

It helps a creator or operator move from a content topic to a structured batch of prompts, reference images, provider-ready assets, image-to-video jobs, watermark handoff, and final reporting. The app is designed around cautious defaults: mock and dry-run modes are enabled first, real remote submissions require explicit configuration, and provider credentials stay server-side.

## Highlights

- Browser-based workflow for creating and managing AI video batches.
- Prompt plan generation for short-form platforms such as TikTok, Xiaohongshu, and YouTube Shorts.
- Reference-image generation through an external VideoFactory workflow, with mock, dry-run, and real modes.
- Provider registry for PixVerse, Pai, and custom platform integrations.
- PixVerse Official API support for credential checks, image upload, image-to-video submission, and video status flows.
- Manual HAR import tools for understanding web API behavior without browser automation, cookie export, or CAPTCHA bypass.
- Guardrails that block video submission until required assets, approvals, and image URL maps are ready.
- Local diagnostics for provider credentials, endpoint coverage, and account-scope separation.
- Generated artifacts, logs, traces, videos, images, and local secrets are excluded from Git by default.

## What This Project Is

AI Batch Creator is a workflow control surface. It coordinates the steps around AI asset generation, provider submission, and reporting so batch work can be repeated safely.

It is useful when you need to:

- Turn a topic into many structured creative items.
- Generate and review reference images before video submission.
- Keep mock, dry-run, and real execution paths clearly separated.
- Validate provider setup before spending credits.
- Export a reproducible report for each batch.

## What This Project Is Not

This project is not a stealth automation tool, CAPTCHA bypass tool, cookie extractor, or scraper. Web API capture is limited to user-provided HAR files and sanitized endpoint analysis. Real provider actions require explicit credentials, explicit confirmation, and the provider must support the requested capability.

## App Routes

| Route | Purpose |
| --- | --- |
| `/video-workflow` | Main batch workflow: create batches, generate prompts, handle images, submit videos, watermark, and export reports. |
| `/provider-settings` | Save local development provider settings into `.env.local` without exposing full secrets in the browser after save. |
| `/provider-diagnostics` | Inspect configured providers, credential fingerprints, endpoint manifests, capabilities, and account scopes. |
| `/web-api-capture` | Import a user-provided HAR file and generate a sanitized provider-specific endpoint summary. |

The root route redirects to `/video-workflow`.

## Workflow Overview

1. Create a batch from a topic, platform, aspect ratio, optional persona, count, and style notes.
2. Generate a prompt plan and export a prompt directory for downstream processing.
3. Generate reference images in mock, dry-run, or real mode.
4. Review images and approve the selected assets.
5. Upload or map approved images to public HTTPS URLs.
6. Generate `image-url-map.json` for video submission.
7. Submit videos in dry-run or real mode when prerequisites are satisfied.
8. Sync video results, send outputs to watermark processing, and export a final report.

## Provider Status

| Provider | Status | Notes |
| --- | --- | --- |
| PixVerse Official API | Stable path | Supports official API credentials and core image-to-video workflow capabilities. |
| PixVerse Web | Experimental analysis only | Uses manual HAR import for endpoint discovery. No automated web submission. |
| Pai Official API | Scaffold | Provider boundary exists, but endpoint coverage is incomplete until API details are configured. |
| Pai Web | Experimental analysis only | Uses manual HAR import for Pai-specific endpoint analysis. |
| Custom Platform | Scaffold | Intended for explicitly configured internal or third-party provider endpoints. |

## Quick Start

### Prerequisites

- Node.js 20 or newer.
- npm.
- Optional: Python 3 for helper scripts under `scripts/`.
- Optional: an external VideoFactory checkout if you want to run VideoFactory-backed generation.
- Optional: provider credentials for real remote API actions.

### Install and Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local app at:

```text
http://localhost:3000/video-workflow
```

Edit `.env.local` before running real provider actions. The app also provides `/provider-settings` for local development credential entry.

## Configuration

Common environment variables are documented in `.env.example`.

| Variable | Purpose |
| --- | --- |
| `PIXVERSE_OFFICIAL_API_KEY` | PixVerse official API credential. Required for real PixVerse official API calls. |
| `PIXVERSE_OFFICIAL_BASE_URL` | Base URL for the PixVerse official API. |
| `PAI_OFFICIAL_API_KEY` | Pai official API credential when Pai official endpoints are configured. |
| `CUSTOM_PLATFORM_BASE_URL` | Base URL for a custom provider integration. |
| `CUSTOM_PLATFORM_API_KEY` | API key for the custom provider integration. |
| `VIDEO_FACTORY_PATH` | Optional path to an external VideoFactory checkout. |
| `IMAGE_GENERATION_MODE` | Default image mode. Use `mock` unless real execution is intentionally configured. |
| `PUBLIC_ASSET_BASE_URL` | Public HTTPS base URL used when mapping approved images. |
| `WATERMARK_SERVICE_URL` | Optional watermark service endpoint. |

Secrets should stay in `.env.local` or server-side secret storage. Do not commit real credentials.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run dev:polling` | Start the dev server with polling file watchers when normal watching is unavailable. |
| `npm run lint` | Run ESLint with zero warnings allowed. |
| `npm run typecheck` | Run TypeScript type checking without emitting files. |
| `npm run build` | Build the Next.js app. |
| `npm run test` | Run provider integration checks. |
| `npm run test:workflow` | Run the workflow smoke test. |
| `npm run test:e2e` | Run Playwright end-to-end tests. |
| `npm run generate:profiles:safe` | Run a small, resumable profile image generation batch. |
| `npm run generate:personas:safe` | Run a small, resumable social-ad persona generation batch. |

## Storage and Artifacts

Batch state is stored under:

```text
storage/video-batches/<batchId>/batch_manifest.json
```

Sanitized web API capture summaries are stored under:

```text
storage/web-api-capture/
```

Large local runtimes and generated artifacts are intentionally ignored by Git, including `.next/`, `.local/`, `devspace/`, `logs/`, `output/`, `outputs/`, `profiles/`, `data/`, images, videos, HAR files, traces, and ZIP files.

## Project Structure

```text
app/                         Next.js routes and API endpoints
components/video-workflow/   Workflow UI components
lib/integrations/            VideoFactory integration layer
lib/providers/               Provider registry, adapters, diagnostics, and settings
lib/services/                Batch, asset, guardrail, and reporting services
scripts/                     Helper scripts for resumable generation and registration tasks
storage/                     Local batch and capture state placeholders
tests/                       Playwright workflow tests
```

## Safety Model

- Mock and dry-run modes are the default operating posture.
- Real image or video submission requires explicit provider setup and user confirmation.
- Video submission is blocked until prompt export, approved public images, and image URL maps are ready.
- Web capture tools analyze user-provided HAR files only.
- Secrets are fingerprinted for diagnostics instead of being displayed in full.
- Generated outputs and local credentials are excluded from source control.

## Development Notes

Keep long-running generation work in small resumable batches. The safe generation scripts intentionally default to low concurrency and small pending batches so local runs are easier to inspect and recover.

For normal development, use:

```bash
npm run dev
```

Use `npm run dev:polling` only when the filesystem watcher is not working in your environment.
