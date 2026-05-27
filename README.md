# AI Video Batch Workflow

Next.js workflow manager for AI video batches with VideoFactory integrated as an external CLI provider.

## What it does

- Creates `VideoBatch` manifests under `runs/<batchId>/`.
- Generates structured `VideoCreativeItem` prompts.
- Exports VideoFactory-compatible prompt folders.
- Calls VideoFactory through child processes for image and video dry runs or remote jobs.
- Produces machine-readable result manifests.
- Supports mock public image uploads and watermark processing hooks.

## Local Commands

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run test:workflow
```

## Environment

Copy `.env.example` and set real values before remote submission. Missing `PIXVERSE_WEB_PROVIDER_API_KEY` keeps remote submission blocked and dry-run only.
