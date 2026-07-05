# Codex Handoff

Use this file to continue work in a fresh short Codex thread without carrying the long chat history.

## Current Goal

Stabilize the image-generation workflow and reduce Codex reconnecting / request timeout failures.

## Completed

- VideoFactory child-process output is bounded before it reaches API responses.
- VideoFactory child-process watchdog stops a command if reconnecting persists beyond 2 minutes and returns bounded diagnostics.
- Image/video submit routes return summarized command output instead of full logs.
- `.codexignore`, `.gitignore`, and `next.config.ts` ignore large generated directories, logs, traces, zips, and videos.
- `npm run typecheck -- --pretty false` passed.
- `npm run lint -- --quiet` passed.

## Next Work

- Optimize real image-generation speed with controlled concurrency.
- Keep real runs capped by explicit confirmation and credit-safety checks.
- Prefer precise sync by batch/result manifest instead of broad output scans.

## Operating Rules

- Do not scan `.local`, `devspace`, `logs`, `output`, `outputs`, `profiles`, `data`, `.next`, or `node_modules`.
- Use `git status --short --untracked-files=normal`.
- Keep command output small; use tails or narrow searches for logs.
- If Codex shows reconnecting, `stream disconnected before completion`, `failed to send websocket request`, `Broken pipe`, or 408 again, stop broad work and continue from this file in a fresh short thread.
- If reconnecting reaches 3/5 or higher, do not run long tools, do not attach screenshots, and do not try to recover the same long chat. Write any needed state to local files, then continue from this handoff in a new short thread.
- For reconnecting reports, paste the error text instead of attaching repeated screenshots. Screenshots add image payload to the same overloaded chat and can make reconnecting worse.
- If a VideoFactory command is stopped by the reconnect watchdog, restart the dev server and retry a small batch first.
- Do not use Codex automations, heartbeat tasks, cron tasks, `list_threads`, or `read_thread` to monitor active Codex chats for reconnecting; this can amplify request size, wake stalled threads, and increase reconnect/resource pressure.
- For health checks, use only local small status files, manifests, or bounded log tails. Do not send automated recovery messages to Codex threads.
- Image generation now has safe defaults: profile S3 runs process at most 8 pending image jobs with concurrency 1, and social-ad persona runs process at most 5 pending personas with concurrency 1. Use `--all` only outside overloaded Codex chats.
- Local run status is written under `.local/codex-run/`; read those small JSON files for recovery instead of reading old Codex thread history.
- `.codexignore` ignores generated image formats. Do not render generated image grids or local image previews inline in Codex chats during batch work; use counts, paths, and small status JSON instead.
- `npm run dev` no longer forces polling. Use `npm run dev:polling` only when normal file watching is broken.
