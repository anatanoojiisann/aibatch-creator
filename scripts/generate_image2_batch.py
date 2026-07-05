#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT_DIR / "data" / "social_ad_personas_100_image2.json"
DEFAULT_OUTPUT = ROOT_DIR / "outputs" / "social_ad_personas"
LOG_DIR = ROOT_DIR / "logs"
MANIFEST_PATH = LOG_DIR / "image2_manifest.csv"
ERROR_LOG_PATH = LOG_DIR / "image2_errors.jsonl"
RUN_SUMMARY_PATH = LOG_DIR / "image2_run_summary.json"

DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "1024x1536"

MANIFEST_FIELDS = [
    "profile_id",
    "name",
    "slot",
    "output_path",
    "model",
    "prompt_hash",
    "status",
    "error_message",
    "created_at",
    "reference_image_used",
]

SAFETY_RULES = """
Safety and brand constraints:
- Fully fictional adult character, age 24+, mature adult appearance.
- Do not resemble any celebrity, public figure, influencer, private person, stock model, or unauthorized real person.
- S0-S1 only: mainstream lifestyle, interests, friendly social presence, city companionship.
- No nudity, lingerie, swimwear focus, erotic posing, sexual service implication, hookup implication, teen-coded styling, childish facial proportions, school uniforms, or age ambiguity.
- No logos, brand names, readable text, watermarks, real app UI, political symbols, medical promises, income promises, before/after comparisons, or manipulative claims.
- Keep wardrobe opaque, everyday, polished, and appropriate for a mainstream social product advertisement.
""".strip()

PROFILE_BANNED_TERMS = [
    "teen",
    "underage",
    "minor",
    "school uniform",
    "lingerie",
    "bikini",
    "swimsuit",
    "hookup",
    "adult service",
    "escort",
    "celebrity lookalike",
]

manifest_lock = threading.Lock()
error_lock = threading.Lock()


class BatchError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append_error(record: dict[str, Any]) -> None:
    ERROR_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with error_lock:
        with ERROR_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def append_manifest(row: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with manifest_lock:
        with MANIFEST_PATH.open("a", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
            writer.writerow({field: row.get(field, "") for field in MANIFEST_FIELDS})


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def safe_folder_name(profile: dict[str, Any]) -> str:
    profile_id = str(profile.get("profile_id") or "unknown").strip()
    name = str(profile.get("name") or "unknown").strip()
    name_slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "Character"
    return f"{profile_id}_{name_slug}"


def normalize_profiles(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict) and isinstance(value.get("profiles"), list):
        profiles = value["profiles"]
    elif isinstance(value, list):
        profiles = value
    else:
        raise BatchError("Input JSON must be a list or an object with a 'profiles' list.")
    if not all(isinstance(profile, dict) for profile in profiles):
        raise BatchError("Every profile entry must be a JSON object.")
    return profiles


def validate_profile(profile: dict[str, Any]) -> None:
    required = ["profile_id", "name", "age", "fictional_status", "gender_presentation", "appearance", "style", "interests"]
    missing = [field for field in required if field not in profile or profile[field] in ("", None, [])]
    if missing:
        raise BatchError(f"Profile {profile.get('profile_id', '<unknown>')} is missing: {', '.join(missing)}")

    try:
        age = int(profile["age"])
    except (TypeError, ValueError) as exc:
        raise BatchError(f"Profile {profile.get('profile_id')} has a non-numeric age.") from exc
    if age < 24:
        raise BatchError(f"Profile {profile.get('profile_id')} must be 24+; got {age}.")

    haystack = json.dumps(profile, ensure_ascii=False).lower()
    for term in PROFILE_BANNED_TERMS:
        if term in haystack:
            raise BatchError(f"Profile {profile.get('profile_id')} contains banned term: {term}")

    fictional_status = str(profile.get("fictional_status", "")).lower()
    if "fictional" not in fictional_status or "real person" not in fictional_status:
        raise BatchError(f"Profile {profile.get('profile_id')} must explicitly state fictional/non-real-person status.")


def load_profiles(input_path: Path) -> list[dict[str, Any]]:
    if not input_path.exists():
        raise BatchError(f"Input file not found: {input_path}")
    value = json.loads(input_path.read_text(encoding="utf-8"))
    profiles = normalize_profiles(value)
    for profile in profiles:
        validate_profile(profile)
    profiles.sort(key=lambda item: str(item["profile_id"]))
    return profiles


def start_index_for(profiles: list[dict[str, Any]], start_id: str | None) -> int:
    if not start_id:
        return 0
    normalized = start_id.strip()
    if normalized.isdigit():
        normalized = f"P{int(normalized):03d}"
    for index, profile in enumerate(profiles):
        if str(profile["profile_id"]) == normalized:
            return index
    raise BatchError(f"--start-id {start_id!r} was not found in the input profiles.")


def selected_profiles(profiles: list[dict[str, Any]], *, start_id: str | None, limit: int | None) -> list[dict[str, Any]]:
    start = start_index_for(profiles, start_id)
    selected = profiles[start:]
    if limit is not None:
        if limit < 1:
            raise BatchError("--limit must be greater than 0 when provided.")
        selected = selected[:limit]
    return selected


def profile_summary(profile: dict[str, Any]) -> str:
    interests = profile.get("interests") or []
    if isinstance(interests, list):
        interest_text = ", ".join(str(item) for item in interests[:4])
    else:
        interest_text = str(interests)
    return (
        f"{profile['name']}, a {profile['age']}-year-old fictional adult {profile['gender_presentation']} "
        f"in {profile.get('city', 'a modern city')}, {profile.get('country', '')}. "
        f"Appearance: {profile['appearance']}. Style: {profile['style']}. "
        f"Interests: {interest_text}. Social ad angle: {profile.get('social_ad_angle', 'low-pressure interest-based social discovery')}."
    )


def build_prompt(profile: dict[str, Any], slot: str) -> str:
    summary = profile_summary(profile)
    if slot == "01_lifestyle_hero":
        scene = (
            "Create a realistic 9:16 vertical lifestyle hero image for a social product advertisement. "
            "Show the person alone in a natural city lifestyle moment connected to their interests: walking through a pleasant neighborhood, "
            "ordering coffee, browsing a bookshop, preparing for a hobby meetup, or pausing in warm window light. "
            "The image should feel welcoming, mature, calm, and everyday, with no sales copy and no interface."
        )
    elif slot == "02_social_context":
        scene = (
            "Using the first image only as a character-consistency reference, create a second realistic 9:16 vertical image. "
            "Keep the same fictional adult identity, face, age impression, hair, and styling cues, but place the person in a conservative social context: "
            "meeting one or two friends at a cafe table, joining a gallery walk, attending a cooking class, walking in a public park, or sharing a hobby moment. "
            "The mood is city companionship and interest-based friendship, not dating pressure."
        )
    else:
        raise BatchError(f"Unknown slot: {slot}")

    return "\n".join(
        [
            scene,
            f"Character brief: {summary}",
            "Composition: photorealistic premium smartphone editorial look, vertical 9:16, natural lens depth, clear face, coherent hands, no text.",
            SAFETY_RULES,
        ]
    )


def slot_output_path(output_root: Path, profile: dict[str, Any], slot: str) -> Path:
    return output_root / safe_folder_name(profile) / f"{slot}.png"


def metadata_path(output_root: Path, profile: dict[str, Any]) -> Path:
    return output_root / safe_folder_name(profile) / "metadata.json"


def manifest_row(
    *,
    profile: dict[str, Any],
    slot: str,
    output_path: Path,
    model: str,
    prompt: str,
    status: str,
    error_message: str,
    reference_image_used: bool,
    created_at: str,
) -> dict[str, Any]:
    return {
        "profile_id": profile["profile_id"],
        "name": profile["name"],
        "slot": slot,
        "output_path": rel(output_path),
        "model": model,
        "prompt_hash": prompt_hash(prompt),
        "status": status,
        "error_message": error_message,
        "created_at": created_at,
        "reference_image_used": str(reference_image_used).lower(),
    }


def failure_record(
    *,
    profile: dict[str, Any],
    slot: str,
    output_path: Path,
    model: str,
    prompt: str,
    error_message: str,
    created_at: str,
    reference_image_used: bool,
    error_type: str = "api_disabled",
) -> dict[str, Any]:
    return {
        "created_at": created_at,
        "profile_id": profile["profile_id"],
        "name": profile["name"],
        "slot": slot,
        "output_path": rel(output_path),
        "model": model,
        "prompt_hash": prompt_hash(prompt),
        "status": "failed",
        "error_type": error_type,
        "error_message": error_message,
        "reference_image_used": reference_image_used,
    }


def process_profile(profile: dict[str, Any], *, output_root: Path, model: str, dry_run: bool) -> dict[str, Any]:
    profile_started = utc_now()
    profile_dir = output_root / safe_folder_name(profile)
    profile_dir.mkdir(parents=True, exist_ok=True)

    slots = ["01_lifestyle_hero", "02_social_context"]
    prompts = {slot: build_prompt(profile, slot) for slot in slots}
    outputs = {slot: slot_output_path(output_root, profile, slot) for slot in slots}
    failures: list[dict[str, Any]] = []
    manifest_rows: list[dict[str, Any]] = []

    first_image_exists = outputs["01_lifestyle_hero"].exists() and outputs["01_lifestyle_hero"].stat().st_size > 0
    for slot in slots:
        created_at = utc_now()
        reference_image_used = False
        if dry_run:
            status = "dry_run"
            error_message = ""
        elif slot == "02_social_context" and not first_image_exists:
            status = "failed"
            error_message = (
                "Reference image was not available because 01_lifestyle_hero.png was not generated. "
                "No API request was sent and no placeholder image was created."
            )
        else:
            status = "failed"
            error_message = (
                "API use is disabled by the current user instruction. "
                "No image request was sent and no placeholder image was created."
            )

        row = manifest_row(
            profile=profile,
            slot=slot,
            output_path=outputs[slot],
            model=model,
            prompt=prompts[slot],
            status=status,
            error_message=error_message,
            reference_image_used=reference_image_used,
            created_at=created_at,
        )
        manifest_rows.append(row)
        append_manifest(row)

        if status == "failed":
            failure = failure_record(
                profile=profile,
                slot=slot,
                output_path=outputs[slot],
                model=model,
                prompt=prompts[slot],
                error_message=error_message,
                created_at=created_at,
                reference_image_used=reference_image_used,
            )
            failures.append(failure)
            append_error(failure)

    metadata = {
        "profile": profile,
        "model": model,
        "size": DEFAULT_SIZE,
        "created_at": profile_started,
        "updated_at": utc_now(),
        "api_enabled": False,
        "dry_run": dry_run,
        "prompts": prompts,
        "outputs": {slot: rel(path) for slot, path in outputs.items()},
        "reference_plan": {
            "02_social_context": rel(outputs["01_lifestyle_hero"]),
            "reference_image_used": False,
            "reason": "API disabled; no reference image upload was attempted.",
        },
        "manifest_rows": manifest_rows,
        "failures": failures,
        "status": "dry_run" if dry_run else "failed",
    }
    write_json(metadata_path(output_root, profile), metadata)
    return metadata


def reset_logs() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
    ERROR_LOG_PATH.write_text("", encoding="utf-8")


def status_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        status = str(row.get("status") or "unknown")
        counts[status] = counts.get(status, 0) + 1
    return counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Prepare a no-API Image2 batch workflow for fictional adult social-ad personas. "
            "This script never mocks successful generation and never writes placeholder images."
        )
    )
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Path to the persona JSON file.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Directory for per-profile outputs and metadata.")
    parser.add_argument("--limit", type=int, default=None, help="Optional number of profiles to process.")
    parser.add_argument("--start-id", default=None, help="Start at this profile ID, e.g. P025 or 25.")
    parser.add_argument("--dry-run", action="store_true", help="Write prompts/metadata/manifest with dry_run status only.")
    parser.add_argument("--concurrency", type=int, default=1, help="Number of profiles to process concurrently.")
    parser.add_argument("--retry", type=int, default=0, help="Accepted for CLI compatibility; no API calls are retried.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started_at = utc_now()
    start_time = time.monotonic()
    input_path = Path(args.input).expanduser()
    output_root = Path(args.output).expanduser()
    if not input_path.is_absolute():
        input_path = ROOT_DIR / input_path
    if not output_root.is_absolute():
        output_root = ROOT_DIR / output_root

    model = os.environ.get("IMAGE_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    reset_logs()

    try:
        profiles = load_profiles(input_path)
        batch = selected_profiles(profiles, start_id=args.start_id, limit=args.limit)
        if not batch:
            raise BatchError("No profiles selected.")
        concurrency = max(1, int(args.concurrency or 1))

        results: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_map = {
                executor.submit(process_profile, profile, output_root=output_root, model=model, dry_run=bool(args.dry_run)): profile
                for profile in batch
            }
            for future in as_completed(future_map):
                profile = future_map[future]
                try:
                    results.append(future.result())
                except Exception as exc:  # noqa: BLE001
                    created_at = utc_now()
                    error = {
                        "created_at": created_at,
                        "profile_id": profile.get("profile_id", ""),
                        "name": profile.get("name", ""),
                        "status": "failed",
                        "error_type": type(exc).__name__,
                        "error_message": str(exc),
                        "traceback": traceback.format_exc(),
                    }
                    append_error(error)

        manifest_rows: list[dict[str, Any]] = []
        with MANIFEST_PATH.open(newline="", encoding="utf-8") as handle:
            manifest_rows = list(csv.DictReader(handle))

        summary = {
            "run_id": hashlib.sha256(f"{started_at}|{input_path}|{output_root}".encode("utf-8")).hexdigest()[:16],
            "started_at": started_at,
            "finished_at": utc_now(),
            "duration_seconds": round(time.monotonic() - start_time, 3),
            "input_path": rel(input_path),
            "output_root": rel(output_root),
            "manifest_path": rel(MANIFEST_PATH),
            "error_log_path": rel(ERROR_LOG_PATH),
            "model": model,
            "size": DEFAULT_SIZE,
            "dry_run": bool(args.dry_run),
            "api_enabled": False,
            "api_note": "User instructed not to use API; no OpenAI SDK/API request is made by this script.",
            "retry_requested": max(0, int(args.retry or 0)),
            "concurrency": concurrency,
            "profiles_available": len(profiles),
            "profiles_selected": len(batch),
            "slots_per_profile": 2,
            "total_slots": len(batch) * 2,
            "status_counts": status_counts(manifest_rows),
            "metadata_files_written": len(results),
            "no_mock_success": True,
            "no_placeholder_images": True,
        }
        write_json(RUN_SUMMARY_PATH, summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if args.dry_run else 2
    except Exception as exc:  # noqa: BLE001
        summary = {
            "started_at": started_at,
            "finished_at": utc_now(),
            "duration_seconds": round(time.monotonic() - start_time, 3),
            "status": "failed",
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "input_path": rel(input_path),
            "output_root": rel(output_root),
            "api_enabled": False,
        }
        append_error({**summary, "traceback": traceback.format_exc()})
        write_json(RUN_SUMMARY_PATH, summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
