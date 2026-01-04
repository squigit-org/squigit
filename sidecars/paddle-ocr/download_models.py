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

# Ensure download happens to ./models
os.environ["PADDLEOCR_BASE_PATH"] = "./models"
# Ensure checking is ON so it downloads if missing
os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "False"

print("Starting model download to ./models...")
# Initialize to trigger download
# We need detection, recognition (en), and classification
ocr = PaddleOCR(use_angle_cls=True, lang='en', ocr_version='PP-OCRv4', show_log=True)
print("Download complete.")
