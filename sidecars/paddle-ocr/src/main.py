#!/usr/bin/env python3
# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_WAIT_POLICY"] = "PASSIVE"

"""
OCR Engine - Command-line and IPC interface for text extraction.

This is the main entry point for the OCR engine executable.
It supports two modes:
1. CLI mode: ocr-engine <image_path>
2. IPC mode: reads JSON from stdin (for Tauri integration)

@author a7mddra
@version 2.1.0

@usage
    # CLI mode
    ocr-engine <image_path>
    
    # IPC mode (stdin JSON)
    echo '{"type":"path","data":"/path/to/image.png"}' | ocr-engine
    echo '{"type":"base64","data":"iVBORw0KGgo..."}' | ocr-engine
"""

import sys
import json
import base64
import tempfile
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from src import OCREngine, NumpyEncoder, EngineConfig


def _create_config(config_dict: dict) -> EngineConfig:
    """
    Create EngineConfig from dictionary.
    
    @param config_dict Dictionary with config values.
    @return Configured EngineConfig object.
    """
    if not config_dict:
        return None
        
    return EngineConfig(
        lang=config_dict.get('lang', 'en'),
        use_angle_cls=config_dict.get('use_angle_cls', True),
        det_model_path=config_dict.get('det_model_dir'),
        rec_model_path=config_dict.get('rec_model_dir'),
        cls_model_path=config_dict.get('cls_model_dir'),
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
        error = {"error": str(e)}
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
        error = {"error": str(e)}
        print(json.dumps(error))
        return 1


def process_stdin() -> int:
    """
    Process IPC request from stdin using length-prefixed protocol.
    
    Protocol:
    1. Read first line: payload length in bytes
    2. Read exactly that many bytes: JSON payload
    3. Stdin stays open — a daemon thread monitors it for CANCEL signal
    
    JSON format:
    - {"type": "path", "data": "/path/to/image.png", "config": {...}}
    - {"type": "base64", "data": "iVBORw0KGgo...", "config": {...}}
    
    @return Exit code (0 for success, 1 for error, 2 for cancelled).
    """
    import threading
    
    def _cancel_listener():
        """
        Daemon thread: reads stdin lines after the payload.
        If 'CANCEL' is received, immediately terminates the process.
        os._exit(2) works even when the main thread is deep in C extensions
        (OpenCV/PaddlePaddle), making it cross-platform safe.
        """
        try:
            for line in sys.stdin:
                if line.strip().upper() == "CANCEL":
                    os._exit(2)
        except Exception:
            pass  # stdin closed or broken pipe — main thread handles exit
    
    try:
        # Read length-prefixed payload
        length_line = sys.stdin.readline().strip()
        if not length_line:
            # Fallback: try to read all remaining stdin (legacy compat)
            raw_input = sys.stdin.read().strip()
            if not raw_input:
                error = {"error": "Empty stdin input"}
                print(json.dumps(error))
                return 1
        else:
            try:
                payload_len = int(length_line)
            except ValueError:
                # Not a number — treat the line itself as the start of raw JSON
                # (legacy mode: entire JSON sent without length prefix)
                remaining = sys.stdin.read()
                raw_input = (length_line + remaining).strip()
                if not raw_input:
                    error = {"error": "Empty stdin input"}
                    print(json.dumps(error))
                    return 1
            else:
                raw_input = sys.stdin.read(payload_len)
                if not raw_input:
                    error = {"error": "Empty payload after length prefix"}
                    print(json.dumps(error))
                    return 1
        
        # Start cancel listener AFTER reading the payload
        # (stdin is now free for cancel signals)
        cancel_thread = threading.Thread(target=_cancel_listener, daemon=True)
        cancel_thread.start()
        
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
            
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON input: {e}"}
        print(json.dumps(error))
        return 1
    except Exception as e:
        error = {"error": str(e)}
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
    else:
        return process_stdin()


if __name__ == "__main__":
    sys.exit(main())

