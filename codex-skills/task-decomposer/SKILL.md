---
name: task-decomposer
description: Break long, risky, or interruption-prone Codex tasks into short execution phases with strict output limits and explicit checkpoints. Use when the user mentions reconnecting, Broken pipe, stream disconnected, network instability, long-running work, large repos, huge logs, big generated directories, batch generation, broad scans, or asks to decompose, split, stage, plan, or make a task safer for Codex.
---

# Task Decomposer

## Overview

Use this skill to keep Codex work resilient when long responses, large tool outputs, or background repository scans may break the response stream. The goal is to make steady progress through small, verifiable steps without flooding the client or context.

## Operating Rules

1. Start by restating the concrete goal in one sentence.
2. Split the task into phases that can each finish in under a few minutes.
3. Keep at most one phase active at a time.
4. Prefer narrow reads, narrow searches, and targeted validation.
5. Avoid broad scans over generated, cache, runtime, dependency, media, or output directories.
6. Cap tool output aggressively; summarize results instead of pasting logs.
7. After each phase, report only what changed, what was verified, and the next phase.
8. Stop and re-scope when the next step would require a large command, network-heavy work, or long streaming response.

## Workflow

### 1. Risk Check

Before running tools, identify likely stream-break risks:

- Large untracked directories such as `.local/`, `logs/`, `output/`, `outputs/`, `profiles/`, `data/`, `node_modules/`, `.next/`, or tool runtimes.
- Commands that may print thousands of lines.
- Tests, builds, or generators that may run for a long time.
- Tasks requiring many files to be read before any useful decision can be made.
- Existing reconnecting, WebSocket, or transport errors.

If risks exist, say so briefly and proceed in smaller phases.

### 2. Phase Plan

Create a short phase plan only when the task is more than a quick answer. Each phase should have:

- A narrow objective.
- A small evidence source.
- A bounded validation step.
- A clear stop condition.

Do not include more than 5 phases up front. Revise the plan as evidence changes.

### 3. Tool Discipline

Use these defaults unless the user explicitly requests full output:

- Use `rg` with explicit paths and exclude generated directories.
- Use `git status --short --untracked-files=normal` instead of full untracked expansion.
- Use `tail`, `head`, `cut`, and narrow keyword searches for logs.
- Keep `max_output_tokens` small for exploratory commands.
- Prefer one precise command over broad discovery when the target is known.
- Avoid recursively listing home directories, caches, generated images, virtual environments, and large app logs.

### 4. Communication

Keep user-facing updates compact:

- During work: 1-2 sentences.
- At phase boundaries: completed, evidence, next step.
- Final response: concise summary, touched files, verification, and any remaining risk.

### 5. Recovery Mode

When the user reports `Reconnecting`, `Broken pipe`, or `stream disconnected`:

- Do not continue with heavy tool calls.
- Confirm whether the latest failure came from repository scanning, command output, long response streaming, or client/network transport.
- Check ignores before logs when large untracked folders are likely.
- Inspect only the latest small log tail if needed.
- Suggest a fresh short thread for continued heavy work when the current thread is already unstable.
