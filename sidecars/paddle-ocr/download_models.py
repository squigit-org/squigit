# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Download OCR models for the engine.

This script downloads the required PaddleOCR models (detection,
recognition, and classification) to the local cache.

@author a7mddra
@version 1.0.0
"""

from paddleocr import PaddleOCR
import os

os.environ["PADDLEOCR_BASE_PATH"] = "./models"
os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "False"

print("Starting model download to ./models...")
ocr = PaddleOCR(use_angle_cls=True, lang='en', ocr_version='PP-OCRv4', show_log=True)
print("Download complete.")
