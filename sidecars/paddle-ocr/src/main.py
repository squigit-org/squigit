#!/usr/bin/env python3
# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

import base64
import json
import os
import sys
import tempfile
import threading
import traceback
import warnings
from pathlib import Path

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_WAIT_POLICY"] = "PASSIVE"

# Keep sidecar stderr focused on actionable OCR failures.
warnings.filterwarnings(
    "ignore",
    message=r".*urllib3 .* doesn't match a supported version!.*",
)


def _prepend_env_path(key: str, value: str, sep: str = os.pathsep) -> None:
    current = os.environ.get(key, "")
    parts = [p for p in current.split(sep) if p]
    if value in parts:
        return
    if current:
        os.environ[key] = f"{value}{sep}{current}"
    else:
        os.environ[key] = value


def _get_frozen_runtime_root() -> str | None:
    if not getattr(sys, "frozen", False):
        return None
    if hasattr(sys, "_MEIPASS"):
        return str(sys._MEIPASS)
    return str(Path(sys.executable).resolve().parent)


def _configure_frozen_lib_paths() -> None:
    """
    Ensure Paddle bundled shared libs are discoverable in frozen builds.
    """
    runtime_root = _get_frozen_runtime_root()
    if not runtime_root:
        return

    paddle_lib_dir = os.path.join(runtime_root, "paddle", "libs")
    if not os.path.isdir(paddle_lib_dir):
        return

    if os.name == "nt":
        _prepend_env_path("PATH", paddle_lib_dir, ";")
    elif sys.platform == "darwin":
        _prepend_env_path("DYLD_LIBRARY_PATH", paddle_lib_dir, ":")
        _prepend_env_path("PATH", paddle_lib_dir, ":")
    else:
        _prepend_env_path("LD_LIBRARY_PATH", paddle_lib_dir, ":")
        _prepend_env_path("PATH", paddle_lib_dir, ":")


_configure_frozen_lib_paths()

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from src import OCREngine, NumpyEncoder, EngineConfig


def _format_exception(exc: Exception) -> str:
    if os.environ.get("OCR_DEBUG_TRACEBACK", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return f"{exc}\n{traceback.format_exc()}"
    return str(exc)


def _create_config(config_dict: dict) -> EngineConfig:
    """
    Create EngineConfig from dictionary.

    @param config_dict Dictionary with config values.
    @return Configured EngineConfig object.
    """
    if not config_dict:
        return None

    return EngineConfig(
        lang=config_dict.get("lang", "en"),
        use_angle_cls=config_dict.get("use_angle_cls", True),
        det_model_path=config_dict.get("det_model_dir"),
        rec_model_path=config_dict.get("rec_model_dir"),
        cls_model_path=config_dict.get("cls_model_dir"),
    )


def process_path(image_path: str, config_dict: dict = None) -> int:
    """
    Process an image file by path.

    @param image_path Path to the image file.
    @param config_dict Optional configuration dictionary.
    @return Exit code (0 for success, 1 for error).
    """
    if not Path(image_path).exists():
        error = {"error": f"Image not found: {image_path}"}
        print(json.dumps(error))
        return 1

    try:
        config = _create_config(config_dict)
        engine = OCREngine(config)
        results = engine.process(image_path)
        output = [result.to_dict() for result in results]
        print(json.dumps(output, cls=NumpyEncoder))
        return 0
    except Exception as e:
        error = {"error": _format_exception(e)}
        print(json.dumps(error))
        return 1


def process_base64(base64_data: str, config_dict: dict = None) -> int:
    """
    Process a base64-encoded image.

    @param base64_data Base64-encoded image data.
    @param config_dict Optional configuration dictionary.
    @return Exit code (0 for success, 1 for error).
    """
    try:
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]

        image_bytes = base64.b64decode(base64_data)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            config = _create_config(config_dict)
            engine = OCREngine(config)
            results = engine.process(tmp_path)
            output = [result.to_dict() for result in results]
            print(json.dumps(output, cls=NumpyEncoder))
            return 0
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        error = {"error": _format_exception(e)}
        print(json.dumps(error))
        return 1


def process_stdin() -> int:
    """
    Process IPC request from stdin using length-prefixed protocol.

    Protocol:
    1. Read first line: payload length in bytes
    2. Read exactly that many bytes: JSON payload
    3. Stdin stays open - a daemon thread monitors it for CANCEL signal

    JSON format:
    - {"type": "path", "data": "/path/to/image.png", "config": {...}}
    - {"type": "base64", "data": "iVBORw0KGgo...", "config": {...}}

    @return Exit code (0 for success, 1 for error, 2 for cancelled).
    """
    stdin_buffer = sys.stdin.buffer

    def _read_exact(stream, total_bytes: int) -> bytes:
        chunks = []
        received = 0
        while received < total_bytes:
            chunk = stream.read(total_bytes - received)
            if not chunk:
                break
            chunks.append(chunk)
            received += len(chunk)
        return b"".join(chunks)

    def _cancel_listener():
        """
        Daemon thread: reads stdin lines after the payload.
        If 'CANCEL' is received, immediately terminates the process.
        os._exit(2) works even when the main thread is deep in C extensions
        (OpenCV/PaddlePaddle), making it cross-platform safe.
        """
        try:
            for line in stdin_buffer:
                if line.decode("utf-8", errors="ignore").strip().upper() == "CANCEL":
                    os._exit(2)
        except Exception:
            pass  # stdin closed or broken pipe - main thread handles exit

    try:
        # Read length-prefixed payload from bytes stream to match Rust's byte count.
        length_line_bytes = stdin_buffer.readline()
        length_line = length_line_bytes.decode("utf-8", errors="replace").strip()

        if not length_line:
            # Legacy fallback: raw JSON with no length prefix.
            raw_payload_bytes = stdin_buffer.read().strip()
            if not raw_payload_bytes:
                error = {"error": "Empty stdin input"}
                print(json.dumps(error))
                return 1
        else:
            try:
                payload_len = int(length_line)
            except ValueError:
                # Legacy mode: first line is JSON content.
                remaining = stdin_buffer.read()
                raw_payload_bytes = (length_line_bytes + remaining).strip()
                if not raw_payload_bytes:
                    error = {"error": "Empty stdin input"}
                    print(json.dumps(error))
                    return 1
            else:
                raw_payload_bytes = _read_exact(stdin_buffer, payload_len)
                if len(raw_payload_bytes) != payload_len:
                    error = {
                        "error": (
                            f"Incomplete payload: expected {payload_len} bytes, "
                            f"received {len(raw_payload_bytes)} bytes"
                        )
                    }
                    print(json.dumps(error))
                    return 1

        # Start cancel listener AFTER reading the payload
        # (stdin is now free for cancel signals).
        cancel_thread = threading.Thread(target=_cancel_listener, daemon=True)
        cancel_thread.start()

        raw_input = raw_payload_bytes.decode("utf-8")
        request = json.loads(raw_input)

        req_type = request.get("type", "")
        data = request.get("data", "")
        config = request.get("config", None)

        if not data:
            error = {"error": "Missing 'data' field in request"}
            print(json.dumps(error))
            return 1

        if req_type == "path":
            return process_path(data, config)
        elif req_type == "base64":
            return process_base64(data, config)
        else:
            error = {"error": f"Unknown request type: {req_type}"}
            print(json.dumps(error))
            return 1

    except UnicodeDecodeError as e:
        error = {"error": f"Invalid UTF-8 input: {e}"}
        print(json.dumps(error))
        return 1
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON input: {e}"}
        print(json.dumps(error))
        return 1
    except Exception as e:
        error = {"error": _format_exception(e)}
        print(json.dumps(error))
        return 1


def main() -> int:
    """
    Main entry point for the OCR engine.

    Determines mode based on command-line arguments:
    - With args: CLI mode (process file path)
    - Without args: IPC mode (read from stdin with cancel support)

    @return Exit code (0 for success, 1 for error, 2 for cancelled).
    """
    if len(sys.argv) >= 2:
        return process_path(sys.argv[1])
    return process_stdin()


if __name__ == "__main__":
    sys.exit(main())
