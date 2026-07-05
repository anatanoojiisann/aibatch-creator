#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import os
import re
import struct
import tempfile
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT_DIR / "data" / "social_ad_personas_100_downloads.json"
DEFAULT_OUTPUT = ROOT_DIR / "outputs" / "social_ad_personas_100_downloads"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "1024x1536"
DEFAULT_QUALITY = "high"
DEFAULT_PERSONA_LIMIT = 5
RUN_STATUS_PATH = ROOT_DIR / ".local" / "codex-run" / "social_ad_personas_status.json"
OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"

SLOTS = ("01_lifestyle_hero", "02_social_context")
MANIFEST_FIELDS = [
    "persona_id",
    "name",
    "image_id",
    "slot",
    "output_path",
    "model",
    "quality",
    "size",
    "prompt_hash",
    "status",
    "error_type",
    "error_message",
    "created_at",
    "completed_at",
]

manifest_lock = threading.Lock()

SAFETY_RULES = """
Safety and brand constraints:
- Fully fictional adult character, age 24+, mature adult appearance.
- Do not resemble any celebrity, public figure, influencer, private person, stock model, or unauthorized real person.
- S0-S1 only: mainstream lifestyle, interests, friendly social presence, city companionship, low-pressure social discovery.
- No nudity, lingerie, swimwear focus, erotic posing, sexual service implication, hookup implication, teen-coded styling, childish facial proportions, school uniforms, or age ambiguity.
- No logos, brand names, readable text, watermarks, real app UI, political symbols, medical promises, income promises, before/after comparisons, or manipulative claims.
- Keep wardrobe opaque, everyday, polished, and appropriate for a mainstream social product advertisement.
""".strip()


class BatchError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def read_local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for env_path in (ROOT_DIR / ".env.local", ROOT_DIR / ".env"):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in values:
                values[key] = value
    return values


def env_value(local_env: dict[str, str], key: str, default: str = "") -> str:
    return str(os.environ.get(key) or local_env.get(key) or default).strip()


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_run_status(status: dict[str, Any]) -> None:
    write_json(RUN_STATUS_PATH, status)


def load_source(input_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not input_path.exists():
        raise BatchError(f"Input file not found: {input_path}")
    value = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("personas"), list):
        raise BatchError("Input JSON must be an object with a 'personas' list.")
    personas = value["personas"]
    if not all(isinstance(item, dict) for item in personas):
        raise BatchError("Every persona entry must be a JSON object.")
    return value, personas


def safe_folder_name(persona: dict[str, Any]) -> str:
    persona_id = str(persona.get("persona_id") or "unknown").strip() or "unknown"
    name = str(persona.get("name") or "Character").strip()
    name_slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "Character"
    return f"{persona_id}_{name_slug}"


def persona_dir(output_root: Path, persona: dict[str, Any]) -> Path:
    return output_root / safe_folder_name(persona)


def scene_output_path(output_root: Path, persona: dict[str, Any], scene: dict[str, Any]) -> Path:
    slot = str(scene.get("slot") or scene.get("image_id") or "image")
    return persona_dir(output_root, persona) / f"{slot}.png"


def scene_json_path(output_root: Path, persona: dict[str, Any], scene: dict[str, Any]) -> Path:
    slot = str(scene.get("slot") or scene.get("image_id") or "image")
    return persona_dir(output_root, persona) / f"{slot}.json"


def metadata_path(output_root: Path, persona: dict[str, Any]) -> Path:
    return persona_dir(output_root, persona) / "metadata.json"


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return f"{width}x{height}"
    return ""


def detect_image_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    return "unknown"


def validate_persona(persona: dict[str, Any]) -> None:
    required = ["persona_id", "name", "age", "gender_style", "market", "positioning", "image_scenes"]
    missing = [field for field in required if persona.get(field) in ("", None, [])]
    if missing:
        raise BatchError(f"Persona {persona.get('persona_id', '<unknown>')} missing: {', '.join(missing)}")
    age = int(persona["age"])
    if age < 24:
        raise BatchError(f"Persona {persona.get('persona_id')} must be 24+; got {age}.")
    scenes = persona["image_scenes"]
    if not isinstance(scenes, list) or len(scenes) != 2:
        raise BatchError(f"Persona {persona.get('persona_id')} must have exactly 2 image_scenes.")
    slots = {str(scene.get("slot") or "") for scene in scenes if isinstance(scene, dict)}
    if set(SLOTS) != slots:
        raise BatchError(f"Persona {persona.get('persona_id')} must include slots: {', '.join(SLOTS)}.")


def sort_personas(personas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(personas, key=lambda item: str(item.get("persona_id") or ""))


def start_index_for(personas: list[dict[str, Any]], start_id: str | None) -> int:
    if not start_id:
        return 0
    normalized = start_id.strip().upper()
    if normalized.isdigit():
        normalized = f"P{int(normalized):03d}"
    for index, persona in enumerate(personas):
        if str(persona.get("persona_id") or "").upper() == normalized:
            return index
    raise BatchError(f"--start-id {start_id!r} was not found.")


def text_list(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if str(item).strip())
    if value in (None, ""):
        return ""
    return str(value)


def select_personas(personas: list[dict[str, Any]], *, start_id: str | None, limit: int | None) -> list[dict[str, Any]]:
    selected = personas[start_index_for(personas, start_id) :]
    if limit is not None:
        if limit < 1:
            raise BatchError("--limit must be greater than 0.")
        selected = selected[:limit]
    return selected


def build_prompt(persona: dict[str, Any], scene: dict[str, Any]) -> str:
    source_prompt = str(scene.get("prompt_en") or "").strip()
    negative_prompt = str(scene.get("negative_prompt") or "").strip()
    scene_description = str(scene.get("scene_description_zh") or scene.get("scene") or "").strip()
    scene_title = str(scene.get("scene_title") or "").strip()
    keywords = text_list(persona.get("persona_keywords", []))
    angles = text_list(persona.get("ad_angle", []))
    notes = text_list(persona.get("safety_notes") or persona.get("compliance_notes") or [])
    if source_prompt:
        return "\n".join(
            [
                source_prompt,
                f"Scene title: {scene_title}" if scene_title else "",
                f"Scene description: {scene_description}" if scene_description else "",
                f"Negative prompt / avoid: {negative_prompt}" if negative_prompt else "",
                SAFETY_RULES,
            ]
        ).strip()
    return "\n".join(
        [
            "Create one high-quality realistic 9:16 vertical lifestyle image for a mainstream social product advertisement.",
            f"Persona: {persona['name']}, a fictional adult age {persona['age']} with gender/style note: {persona['gender_style']}.",
            f"Market and setting: {persona['market']}.",
            f"Positioning: {persona['positioning']}.",
            f"Persona keywords: {keywords}.",
            f"Advertising angle: {angles}.",
            f"Scene: {scene_description}",
            f"Image purpose: {scene.get('purpose') or scene_title}",
            "Composition: premium smartphone editorial realism, clear face, natural body proportions, coherent hands, tasteful everyday wardrobe, no text overlays.",
            "Do not show an app screen even if a phone appears; keep any phone interface unreadable or hidden.",
            f"Source safety notes: {notes}.",
            SAFETY_RULES,
        ]
    )


def post_openai_image(api_key: str, payload: dict[str, Any], *, timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        OPENAI_IMAGES_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "aibatch-creator-social-ad-personas/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8", errors="replace")
            return json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(text) if text.strip() else {}
        except json.JSONDecodeError:
            parsed = {"message": text}
        error = parsed.get("error") if isinstance(parsed, dict) else None
        if isinstance(error, dict):
            error_type = str(error.get("type") or error.get("code") or "api_error")
            message = str(error.get("message") or error)
        else:
            error_type = "api_error"
            message = str(parsed)
        raise BatchError(f"{error_type}: HTTP {exc.code}: {message}") from exc
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        raise BatchError(f"network_error: {exc}") from exc


def extract_image_bytes(response: dict[str, Any], *, timeout: int) -> bytes:
    data = response.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise BatchError("invalid_response: image response did not include data[0].")
    first = data[0]
    b64_json = first.get("b64_json")
    if isinstance(b64_json, str) and b64_json:
        return base64.b64decode(b64_json)
    image_url = first.get("url") or first.get("image_url")
    if isinstance(image_url, str) and image_url:
        with urllib.request.urlopen(image_url, timeout=timeout) as response:
            return response.read()
    raise BatchError("invalid_response: no b64_json or image URL returned.")


def write_manifest(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted(rows, key=lambda row: (row.get("persona_id", ""), row.get("slot", "")))
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in MANIFEST_FIELDS})


def read_manifest(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def upsert_manifest_row(path: Path, row: dict[str, Any]) -> None:
    with manifest_lock:
        rows = [
            existing
            for existing in read_manifest(path)
            if not (
                existing.get("persona_id") == row["persona_id"]
                and existing.get("slot") == row["slot"]
            )
        ]
        rows.append(row)
        write_manifest(path, rows)


def completed_valid(path: Path, scene_json: Path, prompt: str, *, model: str, quality: str, size: str) -> bool:
    if not path.exists() or path.stat().st_size <= 0 or not scene_json.exists():
        return False
    try:
        record = json.loads(scene_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return (
        record.get("status") == "success"
        and record.get("prompt_hash") == prompt_hash(prompt)
        and record.get("model") == model
        and record.get("quality") == quality
        and record.get("size") == size
    )


def persona_has_pending_output(persona: dict[str, Any], *, output_root: Path, model: str, quality: str, size: str) -> bool:
    for scene in persona["image_scenes"]:
        prompt = build_prompt(persona, scene)
        if not completed_valid(
            scene_output_path(output_root, persona, scene),
            scene_json_path(output_root, persona, scene),
            prompt,
            model=model,
            quality=quality,
            size=size,
        ):
            return True
    return False


def split_persona(output_root: Path, persona: dict[str, Any]) -> None:
    directory = persona_dir(output_root, persona)
    directory.mkdir(parents=True, exist_ok=True)
    write_json(directory / "persona.json", persona)


def process_scene(
    persona: dict[str, Any],
    scene: dict[str, Any],
    *,
    output_root: Path,
    manifest_path: Path,
    api_key: str,
    model: str,
    quality: str,
    size: str,
    timeout: int,
    max_retries: int,
    force: bool,
    split_only: bool,
) -> dict[str, Any]:
    split_persona(output_root, persona)
    prompt = build_prompt(persona, scene)
    image_path = scene_output_path(output_root, persona, scene)
    scene_path = scene_json_path(output_root, persona, scene)
    created_at = utc_now()
    base_record = {
        "persona_id": persona["persona_id"],
        "name": persona["name"],
        "image_id": scene.get("image_id", ""),
        "slot": scene["slot"],
        "output_path": rel(image_path),
        "model": model,
        "quality": quality,
        "size": size,
        "prompt": prompt,
        "prompt_hash": prompt_hash(prompt),
        "created_at": created_at,
    }
    if not force and completed_valid(image_path, scene_path, prompt, model=model, quality=quality, size=size):
        record = {**base_record, "status": "skipped", "error_type": "", "error_message": "", "completed_at": utc_now()}
        upsert_manifest_row(manifest_path, record)
        return record
    if split_only:
        record = {**base_record, "status": "pending", "error_type": "", "error_message": "", "completed_at": ""}
        write_json(scene_path, {**record, "scene": scene})
        upsert_manifest_row(manifest_path, record)
        return record
    if not api_key:
        record = {
            **base_record,
            "status": "failed",
            "error_type": "missing_openai_api_key",
            "error_message": "OPENAI_API_KEY is not set.",
            "completed_at": utc_now(),
        }
        write_json(scene_path, {**record, "scene": scene})
        upsert_manifest_row(manifest_path, record)
        return record

    payload = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "n": 1,
        "output_format": "png",
    }
    retry_count = 0
    while True:
        try:
            response = post_openai_image(api_key, payload, timeout=timeout)
            image_bytes = extract_image_bytes(response, timeout=timeout)
            image_format = detect_image_format(image_bytes)
            if image_format == "unknown":
                raise BatchError("invalid_response: provider returned non-image bytes.")
            image_path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile("wb", dir=str(image_path.parent), delete=False) as handle:
                handle.write(image_bytes)
                temp_path = Path(handle.name)
            temp_path.replace(image_path)
            record = {
                **base_record,
                "status": "success",
                "error_type": "",
                "error_message": "",
                "completed_at": utc_now(),
                "retry_count": retry_count,
                "image_format": image_format,
                "dimensions": image_dimensions(image_bytes),
                "bytes": len(image_bytes),
                "sha256": file_sha256(image_path),
            }
            write_json(scene_path, {**record, "scene": scene})
            upsert_manifest_row(manifest_path, record)
            return record
        except Exception as exc:  # noqa: BLE001
            if retry_count < max_retries:
                retry_count += 1
                time.sleep(min(2**retry_count, 8))
                continue
            message = str(exc)
            error_type = message.split(":", 1)[0] if ":" in message else type(exc).__name__
            record = {
                **base_record,
                "status": "failed",
                "error_type": error_type,
                "error_message": message,
                "completed_at": utc_now(),
                "retry_count": retry_count,
            }
            write_json(scene_path, {**record, "scene": scene})
            upsert_manifest_row(manifest_path, record)
            return record


def write_persona_metadata(output_root: Path, persona: dict[str, Any], records: list[dict[str, Any]]) -> None:
    persona_records = [
        row for row in records if row.get("persona_id") == persona.get("persona_id") and row.get("status") in {"success", "skipped", "pending", "failed"}
    ]
    outputs = {str(row.get("slot")): row.get("output_path") for row in persona_records}
    status_values = {str(row.get("status")) for row in persona_records}
    status = "success" if status_values <= {"success", "skipped"} and len(persona_records) == 2 else "partial"
    if status_values == {"pending"}:
        status = "pending"
    write_json(
        metadata_path(output_root, persona),
        {
            "persona_id": persona["persona_id"],
            "name": persona["name"],
            "updated_at": utc_now(),
            "status": status,
            "persona_json": rel(persona_dir(output_root, persona) / "persona.json"),
            "outputs": outputs,
            "records": persona_records,
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split and generate images for social ad personas in small resumable batches.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--start-id", default=None)
    parser.add_argument("--limit", type=int, default=DEFAULT_PERSONA_LIMIT, help="Maximum pending personas to process in this run.")
    parser.add_argument("--all", action="store_true", help="Process every pending persona in one run. Avoid using this from a long Codex chat.")
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--model", default="")
    parser.add_argument("--quality", default="")
    parser.add_argument("--size", default="")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-retries", type=int, default=1)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--split-only", action="store_true")
    parser.add_argument("--rebuild-manifest", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.all and args.limit < 1:
        raise SystemExit("--limit must be greater than 0 unless --all is set.")
    started_at = utc_now()
    start_time = time.monotonic()
    input_path = Path(args.input).expanduser()
    output_root = Path(args.output).expanduser()
    if not input_path.is_absolute():
        input_path = ROOT_DIR / input_path
    if not output_root.is_absolute():
        output_root = ROOT_DIR / output_root
    manifest_path = output_root / "manifest.csv"
    summary_path = output_root / "run_summary.json"

    local_env = read_local_env()
    model = args.model or env_value(local_env, "OPENAI_IMAGE_MODEL", DEFAULT_MODEL)
    quality = args.quality or env_value(local_env, "OPENAI_IMAGE_QUALITY", DEFAULT_QUALITY)
    size = args.size or env_value(local_env, "OPENAI_IMAGE_SIZE", DEFAULT_SIZE)
    api_key = env_value(local_env, "OPENAI_API_KEY")

    source, personas = load_source(input_path)
    for persona in personas:
        validate_persona(persona)
    personas = sort_personas(personas)
    candidates = select_personas(personas, start_id=args.start_id, limit=None)
    pending_personas = candidates if args.force or args.split_only else [
        persona
        for persona in candidates
        if persona_has_pending_output(persona, output_root=output_root, model=model, quality=quality, size=size)
    ]
    selected = pending_personas if args.all else select_personas(pending_personas, start_id=None, limit=args.limit)
    concurrency = max(1, min(3, int(args.concurrency or 1)))

    output_root.mkdir(parents=True, exist_ok=True)
    if args.rebuild_manifest:
        write_manifest(manifest_path, [])
    write_json(
        output_root / "source_summary.json",
        {key: value for key, value in source.items() if key != "personas"},
    )

    jobs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for persona in selected:
        split_persona(output_root, persona)
        for scene in persona["image_scenes"]:
            jobs.append((persona, scene))

    base_status = {
        "script": "scripts/split_and_generate_social_ad_personas.py",
        "status": "running",
        "started_at": started_at,
        "updated_at": started_at,
        "source_total_personas": len(personas),
        "pending_personas_before_run": len(pending_personas),
        "selected_personas": len(selected),
        "selected_scenes": len(jobs),
        "remaining_personas_after_selection": max(0, len(pending_personas) - len(selected)),
        "limit": None if args.all else args.limit,
        "all": bool(args.all),
        "concurrency": concurrency,
        "summary_path": rel(summary_path),
    }
    write_run_status(base_status)

    records: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_map = {
            executor.submit(
                process_scene,
                persona,
                scene,
                output_root=output_root,
                manifest_path=manifest_path,
                api_key=api_key,
                model=model,
                quality=quality,
                size=size,
                timeout=args.timeout,
                max_retries=max(0, int(args.max_retries)),
                force=bool(args.force),
                split_only=bool(args.split_only),
            ): (persona, scene)
            for persona, scene in jobs
        }
        for future in as_completed(future_map):
            record = future.result()
            records.append(record)
            compact = {
                key: record.get(key)
                for key in ("persona_id", "name", "slot", "status", "error_type", "completed_at")
                if record.get(key) not in ("", None)
            }
            write_run_status({**base_status, "updated_at": utc_now(), "completed_scenes": len(records), "last_record": compact})

    all_rows = read_manifest(manifest_path)
    selected_ids = {str(persona["persona_id"]) for persona in selected}
    for persona in selected:
        write_persona_metadata(output_root, persona, all_rows)

    counts: dict[str, int] = {}
    for row in all_rows:
        if row.get("persona_id") in selected_ids:
            status = str(row.get("status") or "unknown")
            counts[status] = counts.get(status, 0) + 1

    summary = {
        "started_at": started_at,
        "finished_at": utc_now(),
        "duration_seconds": round(time.monotonic() - start_time, 3),
        "input_path": rel(input_path),
        "output_root": rel(output_root),
        "manifest_path": rel(manifest_path),
        "source_total_personas": len(personas),
        "pending_personas_before_run": len(pending_personas),
        "selected_personas": len(selected),
        "selected_scenes": len(jobs),
        "remaining_personas_after_selection": max(0, len(pending_personas) - len(selected)),
        "status_counts_for_selection": counts,
        "model": model,
        "quality": quality,
        "size": size,
        "concurrency": concurrency,
        "limit": None if args.all else args.limit,
        "split_only": bool(args.split_only),
        "run_status": rel(RUN_STATUS_PATH),
        "api_key_available": bool(api_key),
    }
    write_json(summary_path, summary)
    write_run_status({**base_status, "updated_at": summary["finished_at"], "status": "completed", "summary": summary})
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not counts.get("failed") else 2


if __name__ == "__main__":
    raise SystemExit(main())
