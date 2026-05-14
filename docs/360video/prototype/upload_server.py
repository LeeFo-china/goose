#!/usr/bin/env python3
"""
Temporary upload server for 360 panorama phase-0 validation.

It is intentionally separate from production API. Uploaded files are saved under:
  ~/goose-360-prototype/input/<case-name>/
"""

from __future__ import annotations

import cgi
import json
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


BASE_DIR = Path.home() / "goose-360-prototype"
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"
SCRIPT_PATH = BASE_DIR / "stitch_panorama.py"
PYTHON_BIN = BASE_DIR / ".venv" / "bin" / "python"
JOBS_PATH = BASE_DIR / "jobs.json"
MAX_FILE_COUNT = 30
MAX_TOTAL_BYTES = 800 * 1024 * 1024
STITCH_MAX_INPUT_SIDE = 1600
STITCH_TIMEOUT_SECONDS = 420
MAX_HISTORY_JOBS = 80
JOBS_LOCK = threading.Lock()

ERROR_HINTS = {
    "ERR_NEED_MORE_IMGS": "图片有效特征不足，建议增加张数或提高相邻重叠。",
    "ERR_HOMOGRAPHY_EST_FAIL": "图片顺序、重叠或视角差异可能不满足拼接要求。",
    "ERR_CAMERA_PARAMS_ADJUST_FAIL": "相机参数估计失败，通常与照片倾斜、曝光差异或重叠不足有关。",
    "STITCH_TIMEOUT": "拼接超过阶段 0 超时限制，建议减少图片尺寸或拆分测试。",
}


def safe_case_name(value: str | None) -> str:
    raw = (value or "").strip().lower()
    raw = re.sub(r"[^a-z0-9._-]+", "-", raw)
    raw = raw.strip(".-")
    if not raw:
        raw = time.strftime("case-%Y%m%d-%H%M%S")
    return raw[:80]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_jobs_unlocked() -> dict:
    if not JOBS_PATH.exists():
        return {}
    try:
        return json.loads(JOBS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_jobs_unlocked(jobs: dict) -> None:
    ordered_items = sorted(
        jobs.items(),
        key=lambda item: item[1].get("updated_at") or item[1].get("created_at") or "",
        reverse=True,
    )[:MAX_HISTORY_JOBS]
    JOBS_PATH.write_text(
        json.dumps(dict(ordered_items), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def output_manifest(case_name: str) -> dict | None:
    manifest_path = OUTPUT_DIR / case_name / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def build_output_urls(case_name: str) -> dict:
    return {
        "manifest_url": f"output/{case_name}/manifest.json",
        "viewer_url": f"viewer?manifest=output/{case_name}/manifest.json",
        "preview_url": f"output/{case_name}/preview.jpg",
        "panorama_url": f"output/{case_name}/panorama.jpg",
    }


def hydrate_jobs_from_outputs(jobs: dict) -> dict:
    if not OUTPUT_DIR.exists():
        return jobs

    for manifest_path in sorted(OUTPUT_DIR.glob("*/manifest.json")):
        case_name = manifest_path.parent.name
        if case_name in jobs:
            continue
        manifest = output_manifest(case_name) or {}
        updated_at = datetime.fromtimestamp(
            manifest_path.stat().st_mtime,
            tz=timezone.utc,
        ).isoformat()
        jobs[case_name] = {
            "case_name": case_name,
            "status": "succeeded",
            "status_label": "拼接成功",
            "created_at": updated_at,
            "updated_at": updated_at,
            "source_count": manifest.get("source_count"),
            "max_input_side": manifest.get("max_input_side"),
            "width": manifest.get("width"),
            "height": manifest.get("height"),
            **build_output_urls(case_name),
        }
    return jobs


def get_jobs() -> dict:
    with JOBS_LOCK:
        jobs = hydrate_jobs_from_outputs(read_jobs_unlocked())
        write_jobs_unlocked(jobs)
        return jobs


def save_job(case_name: str, patch: dict) -> dict:
    with JOBS_LOCK:
        jobs = hydrate_jobs_from_outputs(read_jobs_unlocked())
        existing = jobs.get(case_name, {})
        job = {
            **existing,
            **patch,
            "case_name": case_name,
            "updated_at": now_iso(),
        }
        job.setdefault("created_at", job["updated_at"])
        jobs[case_name] = job
        write_jobs_unlocked(jobs)
        return job


def public_job(job: dict) -> dict:
    return {
        key: value
        for key, value in job.items()
        if key not in {"input_dir", "output_dir", "stdout", "stderr"}
    }


def list_jobs() -> list[dict]:
    jobs = get_jobs()
    return [
        public_job(job)
        for job in sorted(
            jobs.values(),
            key=lambda item: item.get("updated_at") or item.get("created_at") or "",
            reverse=True,
        )
    ]


def parse_stitch_error(result: dict) -> tuple[str, str]:
    if result.get("error"):
        code = str(result["error"])
    else:
        text = f"{result.get('stderr') or ''}\n{result.get('stdout') or ''}"
        matched = re.search(r"OpenCV stitch failed:\s*([A-Z0-9_]+)", text)
        code = matched.group(1) if matched else "STITCH_FAILED"
    return code, ERROR_HINTS.get(code, "拼接失败，请检查图片顺序、重叠比例和拍摄稳定性。")


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler: BaseHTTPRequestHandler, status: int, content: str, content_type: str = "text/html; charset=utf-8") -> None:
    body = content.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def serve_file(handler: BaseHTTPRequestHandler, root: Path, relative_path: str) -> None:
    target = (root / relative_path).resolve()
    root_resolved = root.resolve()
    if not str(target).startswith(str(root_resolved)) or not target.is_file():
        text_response(handler, 404, "Not found", "text/plain; charset=utf-8")
        return

    content_type = "application/octet-stream"
    if target.suffix.lower() in {".jpg", ".jpeg"}:
        content_type = "image/jpeg"
    elif target.suffix.lower() == ".json":
        content_type = "application/json; charset=utf-8"
    elif target.suffix.lower() == ".html":
        content_type = "text/html; charset=utf-8"

    data = target.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def run_stitch(case_name: str) -> dict:
    case_input_dir = INPUT_DIR / case_name
    case_output_dir = OUTPUT_DIR / case_name
    case_output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        str(PYTHON_BIN),
        str(SCRIPT_PATH),
        str(case_input_dir),
        str(case_output_dir),
        "--max-input-side",
        str(STITCH_MAX_INPUT_SIDE),
        "--make-tiles",
        "--run-dzsave",
    ]
    started_at = time.time()
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=STITCH_TIMEOUT_SECONDS,
    )
    duration_ms = round((time.time() - started_at) * 1000)
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "duration_ms": duration_ms,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        **build_output_urls(case_name),
    }


def run_stitch_job(case_name: str) -> None:
    save_job(
        case_name,
        {
            "status": "running",
            "status_label": "拼接中",
            "started_at": now_iso(),
        },
    )
    try:
        result = run_stitch(case_name)
    except subprocess.TimeoutExpired as exc:
        result = {
            "ok": False,
            "error": "STITCH_TIMEOUT",
            "duration_ms": STITCH_TIMEOUT_SECONDS * 1000,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
        }
    except Exception as exc:
        result = {
            "ok": False,
            "error": type(exc).__name__,
            "message": str(exc),
        }

    if result.get("ok"):
        manifest = output_manifest(case_name) or {}
        save_job(
            case_name,
            {
                "status": "succeeded",
                "status_label": "拼接成功",
                "finished_at": now_iso(),
                "duration_ms": result.get("duration_ms"),
                "source_count": manifest.get("source_count"),
                "max_input_side": manifest.get("max_input_side"),
                "width": manifest.get("width"),
                "height": manifest.get("height"),
                **build_output_urls(case_name),
            },
        )
        return

    error_code, error_hint = parse_stitch_error(result)
    save_job(
        case_name,
        {
            "status": "failed",
            "status_label": "拼接失败",
            "finished_at": now_iso(),
            "duration_ms": result.get("duration_ms"),
            "error_code": error_code,
            "error_hint": error_hint,
            "message": result.get("message"),
            "stdout": result.get("stdout"),
            "stderr": result.get("stderr"),
        },
    )


def start_stitch_job(case_name: str) -> None:
    thread = threading.Thread(
        target=run_stitch_job,
        args=(case_name,),
        name=f"stitch-{case_name}",
        daemon=True,
    )
    thread.start()


class UploadHandler(BaseHTTPRequestHandler):
    server_version = "Goose360Upload/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/" or path == "/upload":
            text_response(self, 200, UPLOAD_HTML)
            return
        if path == "/health":
            json_response(self, 200, {"ok": True, "service": "goose-360-upload"})
            return
        if path == "/api/jobs":
            json_response(self, 200, {"ok": True, "jobs": list_jobs()})
            return
        if path.startswith("/api/jobs/"):
            case_name = safe_case_name(unquote(path.removeprefix("/api/jobs/")))
            job = get_jobs().get(case_name)
            if not job:
                json_response(self, 404, {"ok": False, "message": "任务不存在"})
                return
            json_response(self, 200, {"ok": True, "job": public_job(job)})
            return
        if path == "/viewer":
            serve_file(self, BASE_DIR, "viewer.html")
            return
        if path.startswith("/output/"):
            serve_file(self, OUTPUT_DIR, unquote(path.removeprefix("/output/")))
            return
        text_response(self, 404, "Not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/upload":
            json_response(self, 404, {"ok": False, "message": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length") or "0")
        if content_length > MAX_TOTAL_BYTES:
            json_response(self, 413, {"ok": False, "message": "上传总大小超过 800MB"})
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": str(content_length),
            },
        )

        case_name = safe_case_name(form.getfirst("case_name"))
        run_after_upload = form.getfirst("run_stitch") == "1"
        files = form["files"] if "files" in form else []
        if not isinstance(files, list):
            files = [files]
        files = [item for item in files if getattr(item, "filename", None)]

        if len(files) < 3:
            json_response(self, 400, {"ok": False, "message": "至少需要上传 3 张图片"})
            return
        if len(files) > MAX_FILE_COUNT:
            json_response(self, 400, {"ok": False, "message": f"最多上传 {MAX_FILE_COUNT} 张图片"})
            return

        case_input_dir = INPUT_DIR / case_name
        if case_input_dir.exists():
            shutil.rmtree(case_input_dir)
        case_input_dir.mkdir(parents=True, exist_ok=True)

        saved_files = []
        for index, item in enumerate(files, start=1):
            original_name = Path(item.filename).name
            suffix = Path(original_name).suffix.lower()
            if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
                suffix = ".jpg"
            target = case_input_dir / f"{index:03d}{suffix}"
            with target.open("wb") as output:
                shutil.copyfileobj(item.file, output)
            saved_files.append(target.name)

        payload = {
            "ok": True,
            "case_name": case_name,
            "saved_count": len(saved_files),
            "saved_files": saved_files,
            "input_dir": str(case_input_dir),
        }

        job = save_job(
            case_name,
            {
                "status": "uploaded",
                "status_label": "已上传",
                "created_at": now_iso(),
                "source_count": len(saved_files),
                "saved_count": len(saved_files),
                "saved_files": saved_files,
                "input_dir": str(case_input_dir),
                "expected_angle_step": form.getfirst("expected_angle_step") or "30",
                "capture_direction": form.getfirst("capture_direction") or "clockwise",
                "max_input_side": STITCH_MAX_INPUT_SIDE,
            },
        )
        payload["job"] = public_job(job)

        if run_after_upload:
            payload["job"] = public_job(
                save_job(
                    case_name,
                    {
                        "status": "queued",
                        "status_label": "等待拼接",
                    },
                )
            )
            start_stitch_job(case_name)

        json_response(self, 200, payload)

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {self.client_address[0]} {format % args}")


UPLOAD_HTML = r"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>360 全景多图上传</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #17201b;
        --muted: #5e6b62;
        --line: #d8ded6;
        --paper: #f8f7f1;
        --panel: #ffffff;
        --accent: #0d6b57;
        --accent-2: #b8432f;
        --ok: #137c48;
        --bad: #a43125;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100dvh;
        background:
          linear-gradient(135deg, rgb(13 107 87 / 0.1), transparent 34%),
          linear-gradient(215deg, rgb(184 67 47 / 0.08), transparent 28%),
          var(--paper);
        color: var(--ink);
        font: 16px/1.55 ui-serif, Georgia, "Times New Roman", serif;
      }

      button,
      input {
        font: inherit;
      }

      .shell {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }

      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 20px;
        align-items: end;
        border-bottom: 1px solid var(--line);
        padding-bottom: 18px;
        margin-bottom: 20px;
      }

      h1 {
        margin: 0;
        font-size: clamp(30px, 7vw, 64px);
        line-height: 0.95;
        letter-spacing: 0;
      }

      .subtitle {
        margin: 10px 0 0;
        max-width: 720px;
        color: var(--muted);
      }

      .badge {
        border: 1px solid var(--ink);
        padding: 8px 10px;
        border-radius: 999px;
        background: var(--panel);
        white-space: nowrap;
        font-size: 14px;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
      }

      .panel-head {
        padding: 16px 18px;
        border-bottom: 1px solid var(--line);
      }

      .panel-head h2 {
        margin: 0;
        font-size: 18px;
      }

      .panel-body {
        padding: 18px;
      }

      label {
        display: block;
        margin-bottom: 7px;
        font-weight: 700;
      }

      .field {
        margin-bottom: 16px;
      }

      input[type="text"],
      input[type="number"] {
        width: 100%;
        height: 44px;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 0 12px;
        background: #fff;
        color: var(--ink);
      }

      input:focus,
      button:focus {
        outline: 3px solid rgb(13 107 87 / 0.24);
        outline-offset: 2px;
      }

      .hint {
        color: var(--muted);
        font-size: 14px;
        margin-top: 6px;
      }

      .rules {
        display: grid;
        gap: 9px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .rules li {
        display: flex;
        gap: 9px;
        align-items: flex-start;
        color: var(--muted);
      }

      .rules li::before {
        content: "";
        width: 7px;
        height: 7px;
        margin-top: 9px;
        border-radius: 50%;
        background: var(--accent);
        flex: 0 0 auto;
      }

      .drop {
        border: 2px dashed #9aa89e;
        border-radius: 8px;
        min-height: 170px;
        display: grid;
        place-items: center;
        padding: 20px;
        text-align: center;
        background: rgb(255 255 255 / 0.72);
      }

      .drop.drag {
        border-color: var(--accent);
        background: rgb(13 107 87 / 0.08);
      }

      .drop strong {
        display: block;
        font-size: 20px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-top: 16px;
      }

      .btn {
        min-height: 44px;
        border: 1px solid var(--ink);
        border-radius: 6px;
        padding: 10px 14px;
        background: var(--ink);
        color: #fff;
        cursor: pointer;
      }

      .btn.secondary {
        background: #fff;
        color: var(--ink);
      }

      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .thumbs {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
        gap: 10px;
      }

      .thumb {
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
        background: #fff;
      }

      .thumb[draggable="true"] {
        cursor: grab;
      }

      .thumb img {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        display: block;
      }

      .thumb-meta {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 8px;
        font-size: 13px;
      }

      .index {
        font-variant-numeric: tabular-nums;
        color: #fff;
        background: var(--accent);
        border-radius: 999px;
        min-width: 32px;
        text-align: center;
        padding: 2px 6px;
      }

      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
      }

      .remove {
        width: 32px;
        height: 32px;
        border: 1px solid var(--line);
        background: #fff;
        border-radius: 6px;
        cursor: pointer;
      }

      .status {
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: #fff;
        white-space: pre-wrap;
        color: var(--muted);
      }

      .status.ok { border-color: rgb(19 124 72 / 0.4); color: var(--ok); }
      .status.bad { border-color: rgb(164 49 37 / 0.4); color: var(--bad); }

      .history {
        margin-top: 18px;
      }

      .panel-head.row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .text-btn {
        min-height: 36px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #fff;
        color: var(--ink);
        padding: 6px 10px;
        cursor: pointer;
      }

      .jobs {
        display: grid;
        gap: 10px;
      }

      .job {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        background: #fff;
      }

      .job-title {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        font-weight: 700;
      }

      .job-meta {
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
      }

      .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
        font-weight: 700;
        color: var(--muted);
      }

      .pill.running,
      .pill.queued {
        border-color: rgb(13 107 87 / 0.35);
        color: var(--accent);
      }

      .pill.succeeded {
        border-color: rgb(19 124 72 / 0.35);
        color: var(--ok);
      }

      .pill.failed {
        border-color: rgb(164 49 37 / 0.35);
        color: var(--bad);
      }

      .job-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      @media (max-width: 820px) {
        header,
        .grid {
          grid-template-columns: 1fr;
        }

        .badge {
          width: fit-content;
        }

        .job {
          grid-template-columns: 1fr;
        }

        .job-actions {
          justify-content: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div>
          <h1>360 全景<br />多图上传</h1>
          <p class="subtitle">按拍摄顺序上传同一站位的环绕照片。上传后可以直接触发阶段 0 拼接验证。</p>
        </div>
        <div class="badge" id="countBadge">0 张 / 建议 12 张</div>
      </header>

      <section class="grid">
        <aside class="panel">
          <div class="panel-head"><h2>拍摄要求</h2></div>
          <div class="panel-body">
            <ul class="rules">
              <li>默认 12 张，最低 8 张，最多 30 张。</li>
              <li>每张间隔约 30°，相邻照片重叠 30%-50%。</li>
              <li>必须顺时针或逆时针连续拍摄，不能乱序。</li>
              <li>站在同一个点，只旋转身体和手机。</li>
              <li>手机高度和水平角度保持一致。</li>
              <li>避开白墙、镜面、玻璃等特征点不足场景。</li>
            </ul>
          </div>
        </aside>

        <section class="panel">
          <div class="panel-head"><h2>上传图片</h2></div>
          <div class="panel-body">
            <div class="field">
              <label for="caseName">案例名称</label>
              <input id="caseName" type="text" placeholder="例如 living-room-01" />
              <div class="hint">只能用于服务器目录名；空白时会自动生成。</div>
            </div>

            <div class="field">
              <label for="angleStep">每张间隔角度</label>
              <input id="angleStep" type="number" min="10" max="60" value="30" />
            </div>

            <div class="field">
              <label>图片文件</label>
              <div class="drop" id="drop">
                <div>
                  <strong>拖入图片，或点击选择</strong>
                  <div class="hint">支持 JPG / PNG / WebP，上传前可拖动缩略图调整顺序。</div>
                  <input id="fileInput" type="file" accept="image/*" multiple hidden />
                </div>
              </div>
            </div>

            <div class="thumbs" id="thumbs"></div>

            <div class="actions">
              <button class="btn" id="uploadBtn" type="button">上传并拼接</button>
              <button class="btn secondary" id="uploadOnlyBtn" type="button">只上传</button>
              <button class="btn secondary" id="clearBtn" type="button">清空</button>
            </div>

            <div class="status" id="status">等待选择图片。</div>
          </div>
        </section>
      </section>

      <section class="panel history">
        <div class="panel-head row">
          <h2>验证记录</h2>
          <button class="text-btn" id="refreshHistoryBtn" type="button">刷新</button>
        </div>
        <div class="panel-body">
          <div class="jobs" id="historyList"></div>
        </div>
      </section>
    </main>

    <script>
      const fileInput = document.querySelector("#fileInput");
      const drop = document.querySelector("#drop");
      const thumbs = document.querySelector("#thumbs");
      const statusBox = document.querySelector("#status");
      const countBadge = document.querySelector("#countBadge");
      const uploadBtn = document.querySelector("#uploadBtn");
      const uploadOnlyBtn = document.querySelector("#uploadOnlyBtn");
      const clearBtn = document.querySelector("#clearBtn");
      const historyList = document.querySelector("#historyList");
      const refreshHistoryBtn = document.querySelector("#refreshHistoryBtn");
      const files = [];
      let dragIndex = null;
      let pollTimer = null;

      function setStatus(text, type = "") {
        statusBox.className = `status ${type}`;
        statusBox.textContent = text;
      }

      function render() {
        countBadge.textContent = `${files.length} 张 / 建议 12 张`;
        thumbs.innerHTML = "";
        files.forEach((file, index) => {
          const item = document.createElement("article");
          item.className = "thumb";
          item.draggable = true;
          item.dataset.index = index;
          const url = URL.createObjectURL(file);
          item.innerHTML = `
            <img src="${url}" alt="${file.name}" />
            <div class="thumb-meta">
              <span class="index">${String(index + 1).padStart(3, "0")}</span>
              <span class="name" title="${file.name}">${file.name}</span>
              <button class="remove" type="button" aria-label="删除">×</button>
            </div>
          `;
          item.querySelector(".remove").addEventListener("click", () => {
            files.splice(index, 1);
            render();
          });
          item.addEventListener("dragstart", () => { dragIndex = index; });
          item.addEventListener("dragover", (event) => event.preventDefault());
          item.addEventListener("drop", (event) => {
            event.preventDefault();
            const targetIndex = Number(item.dataset.index);
            if (dragIndex === null || dragIndex === targetIndex) return;
            const [moved] = files.splice(dragIndex, 1);
            files.splice(targetIndex, 0, moved);
            dragIndex = null;
            render();
          });
          thumbs.appendChild(item);
        });
      }

      function statusText(job) {
        const parts = [
          job.source_count ? `${job.source_count} 张` : null,
          job.duration_ms ? `${Math.round(job.duration_ms / 1000)} 秒` : null,
          job.width && job.height ? `${job.width}x${job.height}` : null,
        ].filter(Boolean);
        return parts.join(" · ");
      }

      function jobTime(job) {
        const value = job.updated_at || job.created_at;
        if (!value) return "-";
        return new Date(value).toLocaleString("zh-CN", { hour12: false });
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function renderJobs(jobs) {
        if (!jobs.length) {
          historyList.innerHTML = `<div class="hint">暂无验证记录。</div>`;
          return;
        }

        historyList.innerHTML = "";
        jobs.forEach((job) => {
          const item = document.createElement("article");
          item.className = "job";
          const viewerUrl = job.viewer_url ? new URL(job.viewer_url, location.href).toString() : "";
          const previewUrl = job.preview_url ? new URL(job.preview_url, location.href).toString() : "";
          item.innerHTML = `
            <div>
              <div class="job-title">
                <span>${escapeHtml(job.case_name)}</span>
                <span class="pill ${escapeHtml(job.status)}">${escapeHtml(job.status_label || job.status)}</span>
              </div>
              <div class="job-meta">${escapeHtml(statusText(job))} · ${escapeHtml(jobTime(job))}</div>
              ${job.error_hint ? `<div class="job-meta">${escapeHtml(job.error_code || "STITCH_FAILED")}：${escapeHtml(job.error_hint)}</div>` : ""}
            </div>
            <div class="job-actions">
              ${viewerUrl ? `<button class="text-btn" data-open="${escapeHtml(viewerUrl)}" type="button">预览</button>` : ""}
              ${previewUrl ? `<button class="text-btn" data-open="${escapeHtml(previewUrl)}" type="button">图片</button>` : ""}
            </div>
          `;
          item.querySelectorAll("[data-open]").forEach((button) => {
            button.addEventListener("click", () => window.open(button.dataset.open, "_blank"));
          });
          historyList.appendChild(item);
        });
      }

      async function fetchJobs() {
        const response = await fetch("api/jobs");
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.message || "读取任务记录失败");
        }
        renderJobs(data.jobs || []);
        return data.jobs || [];
      }

      async function fetchJob(caseName) {
        const response = await fetch(`api/jobs/${encodeURIComponent(caseName)}`);
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.message || "读取任务状态失败");
        }
        return data.job;
      }

      async function pollJob(caseName) {
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }

        try {
          const job = await fetchJob(caseName);
          await fetchJobs();
          if (job.status === "succeeded") {
            const viewerUrl = new URL(job.viewer_url, location.href).toString();
            setStatus(`拼接成功：${job.case_name}\n${statusText(job)}\n预览：${viewerUrl}`, "ok");
            window.open(viewerUrl, "_blank");
            return;
          }
          if (job.status === "failed") {
            setStatus(`拼接失败：${job.case_name}\n${job.error_code || "STITCH_FAILED"}：${job.error_hint || "请检查图片质量和顺序。"}`, "bad");
            return;
          }
          setStatus(`任务处理中：${job.case_name}\n${statusText(job)}\n页面会自动刷新状态。`);
          pollTimer = setTimeout(() => pollJob(caseName), 2500);
        } catch (error) {
          setStatus(`状态查询失败：${error.message}`, "bad");
        }
      }

      function addFiles(list) {
        for (const file of list) {
          if (!file.type.startsWith("image/")) continue;
          files.push(file);
        }
        if (files.length > 30) {
          files.length = 30;
          setStatus("最多保留 30 张图片。", "bad");
        } else {
          setStatus(`已选择 ${files.length} 张。可拖动缩略图调整顺序。`);
        }
        render();
      }

      drop.addEventListener("click", () => fileInput.click());
      drop.addEventListener("dragover", (event) => {
        event.preventDefault();
        drop.classList.add("drag");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
      drop.addEventListener("drop", (event) => {
        event.preventDefault();
        drop.classList.remove("drag");
        addFiles(event.dataTransfer.files);
      });
      fileInput.addEventListener("change", () => addFiles(fileInput.files));
      clearBtn.addEventListener("click", () => {
        files.length = 0;
        fileInput.value = "";
        render();
        setStatus("已清空。");
      });

      async function upload(runStitch) {
        if (files.length < 3) {
          setStatus("至少需要 3 张图片。建议上传 12 张。", "bad");
          return;
        }
        const form = new FormData();
        form.append("case_name", document.querySelector("#caseName").value);
        form.append("capture_direction", "clockwise");
        form.append("expected_angle_step", document.querySelector("#angleStep").value || "30");
        form.append("run_stitch", runStitch ? "1" : "0");
        files.forEach((file) => form.append("files", file, file.name));

        uploadBtn.disabled = true;
        uploadOnlyBtn.disabled = true;
        setStatus(runStitch ? "上传中，完成后会立即拼接。请不要关闭页面。" : "上传中...");
        try {
          const response = await fetch("api/upload", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok || !data.ok) {
            setStatus(data.message || "上传失败。", "bad");
            return;
          }
          let message = `上传完成：${data.case_name}\n保存 ${data.saved_count} 张图片\n目录：${data.input_dir}`;
          if (runStitch && data.job) {
            message += `\n\n任务已创建：${data.job.status_label || data.job.status}\n页面会自动刷新状态。`;
            setStatus(message);
            await fetchJobs();
            pollJob(data.case_name);
          } else {
            setStatus(message, "ok");
            await fetchJobs();
          }
        } catch (error) {
          setStatus(`请求失败：${error.message}`, "bad");
        } finally {
          uploadBtn.disabled = false;
          uploadOnlyBtn.disabled = false;
        }
      }

      uploadBtn.addEventListener("click", () => upload(true));
      uploadOnlyBtn.addEventListener("click", () => upload(false));
      refreshHistoryBtn.addEventListener("click", () => {
        fetchJobs().catch((error) => setStatus(`刷新失败：${error.message}`, "bad"));
      });
      render();
      fetchJobs().catch(() => {});
    </script>
  </body>
</html>
"""


def main() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", 5179), UploadHandler)
    print("360 upload server listening on http://0.0.0.0:5179")
    server.serve_forever()


if __name__ == "__main__":
    main()
