# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import shutil
import tarfile
from pathlib import Path

import requests

BASE_URL = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0"
SCRIPT_DIR = Path(__file__).parent.resolve()
MODELS_DIR = SCRIPT_DIR / "models"

MODELS = [
    "PP-OCRv5_server_det_infer.tar",
    "en_PP-OCRv5_mobile_rec_infer.tar",
    "PP-LCNet_x1_0_textline_ori_infer.tar",
]


def _model_dir_name(archive_name: str) -> str:
    return archive_name.removesuffix("_infer.tar")


def _has_model_graph(model_dir: Path) -> bool:
    return (model_dir / "inference.pdmodel").exists() or (
        model_dir / "inference.json"
    ).exists()


def _is_model_ready(model_dir: Path) -> bool:
    return _has_model_graph(model_dir) and (
        model_dir / "inference.pdiparams"
    ).exists()


def _normalize_model_dir(model_name: str) -> Path:
    canonical = MODELS_DIR / model_name
    inferred = MODELS_DIR / f"{model_name}_infer"

    if _is_model_ready(canonical):
        return canonical

    if _is_model_ready(inferred):
        if canonical.exists():
            shutil.rmtree(canonical)
        inferred.rename(canonical)
        return canonical

    return canonical


def download_file(url: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with output_path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)


def extract_archive(archive_path: Path, destination: Path) -> None:
    with tarfile.open(archive_path, "r") as archive:
        try:
            archive.extractall(path=destination, filter="data")
        except TypeError:
            archive.extractall(path=destination)


def ensure_model(archive_name: str) -> None:
    model_name = _model_dir_name(archive_name)
    model_dir = _normalize_model_dir(model_name)

    if _is_model_ready(model_dir):
        print(f"Model already present: {model_name}")
        return

    for stale_dir in [model_dir, MODELS_DIR / f"{model_name}_infer"]:
        if stale_dir.exists():
            shutil.rmtree(stale_dir)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = MODELS_DIR / archive_name
    url = f"{BASE_URL}/{archive_name}"

    print(f"Downloading {archive_name}...")
    download_file(url, archive_path)

    print(f"Extracting {archive_name}...")
    extract_archive(archive_path, MODELS_DIR)

    if archive_path.exists():
        archive_path.unlink()

    model_dir = _normalize_model_dir(model_name)
    if not _is_model_ready(model_dir):
        raise RuntimeError(
            f"Model extraction incomplete for {model_name}: missing inference files"
        )


def main() -> None:
    print("Preparing bundled PP-OCRv5 models...")
    for archive_name in MODELS:
        ensure_model(archive_name)
    print("All bundled models are ready.")


if __name__ == "__main__":
    main()
