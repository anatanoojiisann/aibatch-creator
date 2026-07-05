#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
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
PROFILES_DIR = ROOT_DIR / "profiles"
OUTPUT_ROOT = ROOT_DIR / "output"
SUCCESS_LOG_PATH = OUTPUT_ROOT / "success.jsonl"
ERROR_LOG_PATH = OUTPUT_ROOT / "error.jsonl"
RUN_SUMMARY_PATH = OUTPUT_ROOT / "profile_s3_image2_run_summary.json"
RUN_STATUS_PATH = ROOT_DIR / ".local" / "codex-run" / "profile_s3_images_status.json"
OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"

DEFAULT_MODEL = "gpt-image-2"
DEFAULT_QUALITY = "high"
DEFAULT_SIZE = "1024x1536"
DEFAULT_CONCURRENCY = 1
MAX_CONCURRENCY = 3
DEFAULT_MAX_JOBS = 8
MAX_RETRIES = 2

S3_CONSTRAINT = (
    "S3 only: subtle mature Instagram glamour and light sensuality through styling, "
    "expression, pose, and lighting; no nudity, no explicit sexual content, no sexual "
    "acts, no transparent revealing fabric, no erotic body-part closeups, and no "
    "minor, teen, school, or childlike framing."
)

success_lock = threading.Lock()
error_lock = threading.Lock()
auth_failure_lock = threading.Lock()
auth_failure_message = ""


class PipelineError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        error_type: str = "pipeline_error",
        status_code: int | None = None,
        retryable: bool = False,
        raw_error: Any = None,
    ) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.status_code = status_code
        self.retryable = retryable
        self.raw_error = raw_error


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
    value = os.environ.get(key) or local_env.get(key) or default
    return str(value).strip()


def profile_paths(profiles_dir: Path) -> list[Path]:
    return sorted(path for path in profiles_dir.glob("*/profile.json") if path.is_file())


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise PipelineError(f"Expected object JSON at {path}", error_type="invalid_profile")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def list_text(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "").strip()


def first_items(value: Any, fallback: str, count: int = 3) -> str:
    if isinstance(value, list):
        selected = [str(item).strip() for item in value if str(item).strip()][:count]
        if selected:
            return ", ".join(selected)
    text = str(value or "").strip()
    return text or fallback


def gender_group(profile: dict[str, Any]) -> str:
    presentation = str(profile.get("gender_presentation") or profile.get("gender") or "").lower()
    if presentation in {"man", "male"} or presentation.startswith("man "):
        return "man"
    return "woman"


def adult_outfit(profile: dict[str, Any], scene_index: int) -> str:
    profile_id = str(profile.get("profile_id") or "")
    profession = str(profile.get("profession") or profile.get("occupation") or "creative professional")
    style = first_items(profile.get("style_preferences"), str(profile.get("visual_style") or "polished lifestyle styling"), 4)

    if profile_id == "profile_09_aisyah_putri":
        outfits = [
            "elegant cream layered modest outfit with a taupe hijab and refined fabric texture",
            "tailored longline blazer over a flowing neutral dress with a neatly wrapped hijab",
            "soft knit modest set with structured sleeves and artisan jewelry",
            "monochrome modest fashion look with flowing trousers and a polished hijab",
        ]
    elif gender_group(profile) == "man":
        outfits = [
            f"fitted open-collar shirt and tailored trousers, styled around {style}",
            f"clean premium casual layers with subtle structure, inspired by {style}",
            f"profession-ready {profession} outfit with a polished adult lifestyle edge",
            f"sleek evening shirt and jacket, confident but non-explicit, influenced by {style}",
        ]
    else:
        outfits = [
            f"fitted but opaque summer dress with refined adult styling, inspired by {style}",
            f"polished crop-length top or blouse with high-waisted skirt or trousers, non-sheer and tasteful, inspired by {style}",
            f"elegant off-shoulder or open-neckline outfit that stays opaque and platform-safe, styled around {style}",
            f"fashionable travel or cafe outfit with mature S3 glamour, inspired by {style}",
        ]

    return outfits[(scene_index - 1) % len(outfits)]


def build_default_scenes(profile: dict[str, Any]) -> list[dict[str, str]]:
    name = str(profile.get("character_name") or profile.get("name") or profile.get("profile_id") or "Character")
    profession = str(profile.get("profession") or profile.get("occupation") or "creative professional")
    country = str(profile.get("country") or "global city")
    visual_style = str(profile.get("visual_style") or first_items(profile.get("style_preferences"), "premium lifestyle styling", 4))
    themes = first_items(profile.get("content_themes"), "city lifestyle, travel, cafe moments", 4)
    interests = first_items(profile.get("interests"), "travel, photography, fashion", 4)

    templates = [
        (
            "Signature sunlit portrait",
            f"an upscale outdoor cafe or street-corner setting connected to {country}, with details from {themes}",
            "soft golden-hour daylight with flattering skin highlights",
            "85mm smartphone portrait look, waist-up framing, slight low angle, shallow depth of field",
            "warm confident eye contact with a subtle inviting smile",
            f"standing naturally while adjusting hair or jewelry, showing {visual_style}",
        ),
        (
            "Profession after-hours",
            f"a stylish {profession} workspace with personal objects related to {interests}",
            "late afternoon window light mixed with warm interior practicals",
            "three-quarter body framing from across a desk or counter, candid editorial angle",
            "focused, quietly magnetic, in control",
            "leaning on the work surface with relaxed posture, not explicit or provocative",
        ),
        (
            "City walk motion",
            f"a lively city walkway, crosswalk, or market street inspired by {country} lifestyle",
            "clean daylight with natural movement blur and crisp face detail",
            "vertical full-body mobile shot, slight tracking angle, subject centered",
            "playful, spontaneous, social-media candid energy",
            "walking toward camera with wind or movement in clothes, confident adult presence",
        ),
        (
            "Travel viewpoint",
            f"a scenic viewpoint, terrace, beach promenade, desert edge, mountain overlook, or urban rooftop tied to {themes}",
            "dramatic golden-hour backlight with realistic lens flare",
            "wide portrait composition with environmental depth and strong silhouette",
            "adventurous, relaxed, slightly flirtatious but fully safe",
            "turning back toward camera over one shoulder with an understated smile",
        ),
        (
            "Cafe drink close moment",
            f"a premium cafe, tea house, juice bar, or lounge environment connected to {interests}",
            "soft window light with gentle reflections on glass and skin",
            "close waist-up shot from table height, clear face and hands, natural bokeh",
            "soft, approachable, intimate but non-sexual",
            "holding a drink near the table while meeting the camera with calm confidence",
        ),
        (
            "Evening social look",
            f"a tasteful night terrace, restaurant entrance, gallery opening, or city-lit sidewalk inspired by {visual_style}",
            "cinematic evening light with warm highlights and cool background separation",
            "vertical editorial portrait, slight dutch angle, strong half-body framing",
            "charismatic, polished, mature S3 glamour",
            "standing near a railing or doorway, jacket or outer layer moving naturally",
        ),
        (
            "Home routine",
            f"a refined apartment, studio, kitchen, balcony, or creative home corner with cues from {themes}",
            "morning window light with cozy practical shadows",
            "natural smartphone shot from doorway height, medium full-body composition",
            "relaxed, private, comfortable, never voyeuristic",
            "arranging personal items, watering plants, preparing coffee, or choosing an outfit",
        ),
        (
            "Texture and styling detail",
            f"a close styling setup using fabrics, camera gear, books, food, craft tools, sports gear, or travel accessories from {interests}",
            "directional softbox-like daylight with tactile highlights",
            "tight portrait with face clear, hands and outfit texture visible, no body-part closeup",
            "attentive, sensory, elegant",
            "touching a sleeve, scarf, camera strap, book, cup, or tool while looking past camera",
        ),
        (
            "Weekend activity",
            f"an active weekend setting related to {interests}, kept mainstream and platform-safe",
            "bright realistic daylight with energetic contrast",
            "dynamic mobile composition, full-body or strong half-body, subject in motion",
            "free, expressive, confident, high-engagement lifestyle mood",
            "performing a hobby movement, laughing, stretching, dancing, walking, cooking, or photographing",
        ),
        (
            "Hero cover image",
            f"the most visually iconic environment for {name}: {themes}, with a clean Instagram cover composition",
            "polished sunset or blue-hour light with cinematic depth",
            "cover-ready 9:16 composition, centered face, strong negative space, premium editorial realism",
            "memorable, aspirational, subtly sensual, fully non-explicit",
            "holding a steady confident pose that locks the character identity for future images",
        ),
    ]

    scenes: list[dict[str, str]] = []
    for index, (title, environment, lighting, camera_angle, tone, action) in enumerate(templates, start=1):
        outfit = adult_outfit(profile, index)
        scenes.append(
            {
                "scene_id": f"s{index:02d}",
                "title": title,
                "subject_identity": str(profile.get("identity_notes") or ""),
                "scene_description": (
                    f"{name} in {environment}, wearing {outfit}, {action}; {lighting}; "
                    f"{camera_angle}; emotional tone: {tone}."
                ),
                "outfit": outfit,
                "environment": environment,
                "lighting": lighting,
                "camera_angle": camera_angle,
                "emotional_tone": tone,
                "content_level": "S3",
                "s3_constraint": S3_CONSTRAINT,
            }
        )
    return scenes


def hydrate_missing_scenes(profile_path: Path, profile: dict[str, Any], *, write: bool) -> dict[str, Any]:
    scenes = profile.get("scenes")
    if isinstance(scenes, list) and len(scenes) == 10:
        return profile

    profile = dict(profile)
    profile["scenes"] = build_default_scenes(profile)
    profile["scene_source"] = "deterministic_s3_template_v1"
    if write:
        write_json(profile_path, profile)
    return profile


def validate_profile(profile_path: Path, profile: dict[str, Any]) -> None:
    required = ["profile_id", "character_name", "age", "fictional_status", "scenes"]
    missing = [key for key in required if key not in profile]
    if missing:
        raise PipelineError(
            f"{profile_path} is missing required fields: {', '.join(missing)}",
            error_type="invalid_profile",
        )
    scenes = profile.get("scenes")
    if not isinstance(scenes, list) or len(scenes) != 10:
        raise PipelineError(f"{profile_path} must contain exactly 10 scenes", error_type="invalid_profile")
    scene_ids: set[str] = set()
    for scene in scenes:
        if not isinstance(scene, dict):
            raise PipelineError(f"{profile_path} contains a non-object scene", error_type="invalid_scene")
        scene_id = str(scene.get("scene_id") or "")
        if not re.fullmatch(r"s\d{2}", scene_id):
            raise PipelineError(f"{profile_path} has invalid scene_id {scene_id!r}", error_type="invalid_scene")
        if scene_id in scene_ids:
            raise PipelineError(f"{profile_path} has duplicate scene_id {scene_id}", error_type="invalid_scene")
        scene_ids.add(scene_id)


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def profile_hash(profile: dict[str, Any]) -> str:
    stable = json.dumps(profile, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()


def safe_character_folder(name: str) -> str:
    cleaned = "".join("_" if char in {"/", "\\", ":", "\0"} else char for char in name.strip())
    return cleaned or "unknown_character"


def output_paths(profile: dict[str, Any], scene: dict[str, Any]) -> tuple[Path, Path]:
    folder = safe_character_folder(str(profile.get("character_name") or profile.get("profile_id") or "character"))
    scene_id = str(scene["scene_id"])
    directory = OUTPUT_ROOT / folder
    return directory / f"{scene_id}.png", directory / f"{scene_id}.json"


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def build_prompt(profile: dict[str, Any], scene: dict[str, Any]) -> str:
    name = str(profile.get("character_name") or "Fictional adult character")
    age = str(profile.get("age") or "21+")
    gender = str(profile.get("gender_presentation") or profile.get("gender") or "adult")
    identity = str(profile.get("identity_notes") or scene.get("subject_identity") or "")
    appearance = profile.get("appearance") if isinstance(profile.get("appearance"), dict) else {}
    reference_summary = str(appearance.get("visible_reference_summary") or "")
    visual_style = str(profile.get("visual_style") or "")
    safety = list_text(profile.get("safety_restrictions"))

    return "\n".join(
        [
            "Create one high-quality realistic Instagram-style vertical lifestyle image.",
            f"Subject identity: {name}, fictional adult {gender}, clearly {age}+ and never teen-coded.",
            f"Continuity lock: {identity}",
            f"Visible reference lock: {reference_summary}",
            f"Style direction: {visual_style}",
            f"Scene: {scene.get('scene_description')}",
            f"Outfit: {scene.get('outfit')}",
            f"Environment: {scene.get('environment')}",
            f"Lighting: {scene.get('lighting')}",
            f"Camera angle: {scene.get('camera_angle')}",
            f"Emotional tone: {scene.get('emotional_tone')}",
            f"S3 constraint: {scene.get('s3_constraint') or S3_CONSTRAINT}",
            "Real-person restriction: fully fictional persona, not a celebrity, not a public figure, not an influencer, and not based on any private person.",
            "Image quality: natural skin texture, clear face, premium smartphone realism, coherent hands, no watermarks, no text overlays, no logos, no readable brand marks.",
            f"Profile safety restrictions: {safety}",
        ]
    )


def build_jobs(profiles: list[tuple[Path, dict[str, Any]]], *, model: str, quality: str, size: str) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for profile_path, profile in profiles:
        p_hash = profile_hash(profile)
        for scene in profile["scenes"]:
            prompt = build_prompt(profile, scene)
            image_path, metadata_path = output_paths(profile, scene)
            job_id = f"{profile['profile_id']}_{scene['scene_id']}"
            jobs.append(
                {
                    "job_id": job_id,
                    "profile_path": rel(profile_path),
                    "profile_id": profile["profile_id"],
                    "profile_hash": p_hash,
                    "character_name": profile["character_name"],
                    "scene_id": scene["scene_id"],
                    "scene_title": scene.get("title", ""),
                    "model": model,
                    "quality": quality,
                    "size": size,
                    "prompt": prompt,
                    "prompt_hash": prompt_hash(prompt),
                    "image_path": rel(image_path),
                    "metadata_path": rel(metadata_path),
                    "created_at": utc_now(),
                }
            )
    return jobs


def append_jsonl(path: Path, record: dict[str, Any], lock: threading.Lock) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with lock:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")


def detect_image_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    return "unknown"


def dimensions_from_bytes(data: bytes) -> tuple[int, int] | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return struct.unpack(">II", data[16:24])
    return None


def completed_valid(job: dict[str, Any]) -> bool:
    image_path = ROOT_DIR / str(job["image_path"])
    metadata_path = ROOT_DIR / str(job["metadata_path"])
    if not image_path.exists() or image_path.stat().st_size <= 0 or not metadata_path.exists():
        return False
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return (
        metadata.get("status") == "success"
        and metadata.get("prompt_hash") == job["prompt_hash"]
        and metadata.get("model") == job["model"]
        and metadata.get("quality") == job["quality"]
    )


def parse_api_error(value: Any) -> tuple[str, str]:
    if isinstance(value, dict):
        error = value.get("error")
        if isinstance(error, dict):
            error_type = str(error.get("type") or error.get("code") or "api_error")
            message = str(error.get("message") or error.get("detail") or error)
            return error_type, message
        message = str(value.get("message") or value)
        return "api_error", message
    return "api_error", str(value)


def retryable_status(status_code: int | None) -> bool:
    return status_code in {408, 409, 425, 429, 500, 502, 503, 504}


def auth_status(status_code: int | None) -> bool:
    return status_code in {401, 403}


def post_openai_image(api_key: str, payload: dict[str, Any], *, timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        OPENAI_IMAGES_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "aibatch-creator-profile-s3-image2/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8", errors="replace")
            return json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed: Any = json.loads(text) if text.strip() else {}
        except json.JSONDecodeError:
            parsed = {"message": text}
        error_type, message = parse_api_error(parsed)
        raise PipelineError(
            f"HTTP {exc.code}: {message}",
            error_type=error_type,
            status_code=exc.code,
            retryable=retryable_status(exc.code),
            raw_error=parsed,
        ) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise PipelineError(f"Network request failed: {exc}", error_type="network_error", retryable=True) from exc


def extract_image_bytes(response: dict[str, Any], *, timeout: int) -> bytes:
    data = response.get("data")
    if not isinstance(data, list) or not data:
        raise PipelineError("OpenAI response did not include image data", error_type="invalid_response")
    first = data[0]
    if not isinstance(first, dict):
        raise PipelineError("OpenAI image item was not an object", error_type="invalid_response")

    b64_json = first.get("b64_json")
    if isinstance(b64_json, str) and b64_json:
        try:
            return base64.b64decode(b64_json)
        except (ValueError, base64.binascii.Error) as exc:
            raise PipelineError("OpenAI returned invalid base64 image data", error_type="invalid_response") from exc

    url = first.get("url") or first.get("image_url")
    if isinstance(url, str) and url:
        with urllib.request.urlopen(url, timeout=timeout) as image_response:
            return image_response.read()

    raise PipelineError("OpenAI response had no b64_json or image URL", error_type="invalid_response")


def write_failure(job: dict[str, Any], *, error_type: str, error_message: str, retry_count: int) -> dict[str, Any]:
    record = dict(job)
    record.update(
        {
            "status": "failed",
            "error_type": error_type,
            "error_message": error_message,
            "retry_count": retry_count,
            "completed_at": utc_now(),
        }
    )
    write_json(ROOT_DIR / str(record["metadata_path"]), record)
    append_jsonl(ERROR_LOG_PATH, record, error_lock)
    return record


def write_success(job: dict[str, Any], image_bytes: bytes, *, retry_count: int) -> dict[str, Any]:
    image_path = ROOT_DIR / str(job["image_path"])
    metadata_path = ROOT_DIR / str(job["metadata_path"])
    image_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", dir=str(image_path.parent), delete=False) as temp_file:
        temp_file.write(image_bytes)
        temp_path = Path(temp_file.name)
    temp_path.replace(image_path)

    record = dict(job)
    record.update(
        {
            "status": "success",
            "retry_count": retry_count,
            "completed_at": utc_now(),
            "image_format": detect_image_format(image_bytes),
            "dimensions": dimensions_from_bytes(image_bytes),
            "bytes": len(image_bytes),
        }
    )
    write_json(metadata_path, record)
    append_jsonl(SUCCESS_LOG_PATH, record, success_lock)
    return record


def current_auth_failure() -> str:
    with auth_failure_lock:
        return auth_failure_message


def set_auth_failure(message: str) -> None:
    global auth_failure_message
    with auth_failure_lock:
        if not auth_failure_message:
            auth_failure_message = message


def run_job(job: dict[str, Any], *, api_key: str, force: bool, timeout: int, max_retries: int) -> dict[str, Any]:
    if not force and completed_valid(job):
        skipped = dict(job)
        skipped.update({"status": "skipped", "reason": "existing_success_matches_prompt"})
        return skipped

    if current_auth_failure():
        return write_failure(
            job,
            error_type="authentication_error",
            error_message=current_auth_failure(),
            retry_count=0,
        )

    payload = {
        "model": job["model"],
        "prompt": job["prompt"],
        "size": job["size"],
        "quality": job["quality"],
        "n": 1,
        "output_format": "png",
    }

    retry_count = 0
    while True:
        try:
            response = post_openai_image(api_key, payload, timeout=timeout)
            image_bytes = extract_image_bytes(response, timeout=timeout)
            if detect_image_format(image_bytes) == "unknown":
                raise PipelineError("Provider returned non-image bytes", error_type="invalid_response")
            return write_success(job, image_bytes, retry_count=retry_count)
        except PipelineError as exc:
            if auth_status(exc.status_code):
                set_auth_failure(str(exc))
                return write_failure(job, error_type=exc.error_type, error_message=str(exc), retry_count=retry_count)
            if exc.retryable and retry_count < max_retries:
                retry_count += 1
                time.sleep(min(2**retry_count, 8))
                continue
            return write_failure(job, error_type=exc.error_type, error_message=str(exc), retry_count=retry_count)


def run_missing_key_job(job: dict[str, Any]) -> dict[str, Any]:
    return write_failure(
        job,
        error_type="missing_openai_api_key",
        error_message="OPENAI_API_KEY is not set in the process environment, .env.local, or .env. No image API request was sent.",
        retry_count=0,
    )


def load_profiles(profiles_dir: Path, *, hydrate_scenes: bool, write_scenes: bool) -> list[tuple[Path, dict[str, Any]]]:
    paths = profile_paths(profiles_dir)
    if not paths:
        raise PipelineError(f"No profile JSON files found under {profiles_dir}", error_type="missing_profiles")

    loaded: list[tuple[Path, dict[str, Any]]] = []
    for path in paths:
        profile = read_json(path)
        if hydrate_scenes:
            profile = hydrate_missing_scenes(path, profile, write=write_scenes)
        validate_profile(path, profile)
        loaded.append((path, profile))
    return loaded


def write_run_summary(summary: dict[str, Any]) -> None:
    write_json(RUN_SUMMARY_PATH, summary)


def write_run_status(status: dict[str, Any]) -> None:
    write_json(RUN_STATUS_PATH, status)


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    keys = ("job_id", "profile_id", "character_name", "scene_id", "status", "error_type", "completed_at")
    return {key: record[key] for key in keys if key in record and record[key] not in ("", None)}


def pending_jobs(jobs: list[dict[str, Any]], *, force: bool) -> list[dict[str, Any]]:
    if force:
        return jobs
    return [job for job in jobs if not completed_valid(job)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate S3 lifestyle images for profiles/*/profile.json in small resumable batches.")
    parser.add_argument("--profiles-dir", default=str(PROFILES_DIR), help="Reserved; profiles are loaded from workspace profiles/ by default.")
    parser.add_argument("--model", default="")
    parser.add_argument("--quality", default="")
    parser.add_argument("--size", default="")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--max-jobs", type=int, default=DEFAULT_MAX_JOBS, help="Maximum pending image jobs to process in this run.")
    parser.add_argument("--all", action="store_true", help="Process every pending job in one run. Avoid using this from a long Codex chat.")
    parser.add_argument("--max-retries", type=int, default=MAX_RETRIES)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-hydrate-scenes", action="store_true")
    parser.add_argument("--no-write-scenes", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not (1 <= args.concurrency <= MAX_CONCURRENCY):
        raise SystemExit(f"--concurrency must be between 1 and {MAX_CONCURRENCY}")
    if not args.all and args.max_jobs < 1:
        raise SystemExit("--max-jobs must be greater than 0 unless --all is set.")
    if args.max_retries < 0:
        raise SystemExit("--max-retries must be >= 0")

    local_env = read_local_env()
    model = args.model or env_value(local_env, "OPENAI_IMAGE_MODEL", DEFAULT_MODEL)
    quality = args.quality or env_value(local_env, "OPENAI_IMAGE_QUALITY", DEFAULT_QUALITY)
    size = args.size or env_value(local_env, "OPENAI_IMAGE_SIZE", DEFAULT_SIZE)
    api_key = env_value(local_env, "OPENAI_API_KEY")

    profiles_dir = Path(args.profiles_dir)
    if not profiles_dir.is_absolute():
        profiles_dir = ROOT_DIR / profiles_dir
    profiles = load_profiles(
        profiles_dir,
        hydrate_scenes=not args.no_hydrate_scenes,
        write_scenes=not args.no_write_scenes,
    )
    jobs = build_jobs(profiles, model=model, quality=quality, size=size)
    pending = pending_jobs(jobs, force=args.force)
    run_jobs = pending if args.all else pending[: args.max_jobs]
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    SUCCESS_LOG_PATH.touch(exist_ok=True)
    ERROR_LOG_PATH.touch(exist_ok=True)

    started_at = utc_now()
    status_counts: dict[str, int] = {}
    records: list[dict[str, Any]] = []
    remaining_after_selection = max(0, len(pending) - len(run_jobs))
    base_status = {
        "script": "scripts/generate_profile_s3_images.py",
        "status": "running",
        "started_at": started_at,
        "updated_at": started_at,
        "profiles": len(profiles),
        "total_jobs": len(jobs),
        "pending_jobs_before_run": len(pending),
        "selected_jobs": len(run_jobs),
        "remaining_jobs_after_selection": remaining_after_selection,
        "max_jobs": None if args.all else args.max_jobs,
        "all": bool(args.all),
        "concurrency": args.concurrency,
        "summary_path": rel(RUN_SUMMARY_PATH),
    }
    write_run_status(base_status)

    if not api_key:
        for job in run_jobs:
            record = run_missing_key_job(job)
            records.append(record)
            status_counts[record["status"]] = status_counts.get(record["status"], 0) + 1
            write_run_status({**base_status, "updated_at": utc_now(), "status_counts": status_counts, "last_record": compact_record(record)})
    else:
        with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            futures = [
                executor.submit(
                    run_job,
                    job,
                    api_key=api_key,
                    force=args.force,
                    timeout=args.timeout,
                    max_retries=args.max_retries,
                )
                for job in run_jobs
            ]
            for future in as_completed(futures):
                record = future.result()
                records.append(record)
                status = str(record.get("status") or "unknown")
                status_counts[status] = status_counts.get(status, 0) + 1
                write_run_status({**base_status, "updated_at": utc_now(), "status_counts": status_counts, "last_record": compact_record(record)})

    summary = {
        "started_at": started_at,
        "completed_at": utc_now(),
        "profiles": len(profiles),
        "total_jobs": len(jobs),
        "pending_jobs_before_run": len(pending),
        "selected_jobs": len(run_jobs),
        "remaining_jobs_after_selection": remaining_after_selection,
        "status_counts": status_counts,
        "model": model,
        "quality": quality,
        "size": size,
        "concurrency": args.concurrency,
        "max_jobs": None if args.all else args.max_jobs,
        "max_retries": args.max_retries,
        "success_log": rel(SUCCESS_LOG_PATH),
        "error_log": rel(ERROR_LOG_PATH),
        "output_root": rel(OUTPUT_ROOT),
        "run_status": rel(RUN_STATUS_PATH),
        "api_key_source": "OPENAI_API_KEY" if bool(api_key) else "",
    }
    write_run_summary(summary)
    write_run_status({**base_status, "updated_at": summary["completed_at"], "status": "completed", "status_counts": status_counts, "summary": summary})
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if status_counts.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
