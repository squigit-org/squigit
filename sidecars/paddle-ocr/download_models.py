# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

import os
import requests
import tarfile
from pathlib import Path

HOME = Path.home()
CACHE_DIR = HOME / ".paddleocr" / "whl"

MODELS = [
    {
        "url": "https://paddleocr.bj.bcebos.com/PP-OCRv3/english/en_PP-OCRv3_det_infer.tar",
        "dest_dir": CACHE_DIR / "det" / "en"
    },
    {
        "url": "https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_rec_infer.tar",
        "dest_dir": CACHE_DIR / "rec" / "en"
    },
    {
        "url": "https://paddleocr.bj.bcebos.com/dygraph_v2.0/ch/ch_ppocr_mobile_v2.0_cls_infer.tar",
        "dest_dir": CACHE_DIR / "cls"
    }
]

def download_and_extract(url, dest_dir):
    filename = url.split("/")[-1]
    tar_path = dest_dir / filename
    
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    if tar_path.exists():
        print(f"File already exists: {tar_path}, skipping download.")
    else:
        print(f"Downloading {url}...")
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(tar_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    
    print(f"Extracting {filename} to {dest_dir}...")
    with tarfile.open(tar_path, "r") as tar:
        tar.extractall(path=dest_dir)

def main():
    print("Starting manual model download...")
    for model in MODELS:
        try:
            download_and_extract(model["url"], model["dest_dir"])
        except Exception as e:
            print(f"Failed to process {model['url']}: {e}")
            exit(1)
    print("All models downloaded and extracted successfully.")

if __name__ == "__main__":
    main()
