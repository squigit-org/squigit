# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
OCR Engine - PaddleOCR based text extraction engine.

This module provides the main OCREngine class for extracting text
and bounding boxes from images using PaddleOCR.

@author a7mddra
@version 1.0.0
"""

import os
import sys
import logging
from pathlib import Path
from typing import List, Optional

from paddleocr import PaddleOCR

from .models import OCRResult, BoundingBox
from .config import EngineConfig


class OCREngine:
    """
    Main OCR engine class for text extraction from images.
    
    This class wraps PaddleOCR and provides a clean interface for
    extracting text with bounding box coordinates from images.
    
    @example
        engine = OCREngine()
        results = engine.process("image.png")
        for result in results:
            print(f"{result.text} at {result.box}")
    """
    
    def __init__(self, config: Optional[EngineConfig] = None):
        """
        Initialize the OCR engine.
        
        @param config Engine configuration. Uses defaults if not provided.
        """
        self.config = config or EngineConfig()
        self._setup_environment()
        self._ocr: Optional[PaddleOCR] = None
    
    def _setup_environment(self) -> None:
        """
        Configure environment variables for PaddleOCR.
        
        Sets up model paths and disables automatic downloads
        when running as a frozen executable.
        """
        os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "True"
        os.environ["PADDLEOCR_BASE_PATH"] = str(self.config.model_dir)
        
        logging.getLogger("ppocr").setLevel(logging.ERROR)
    
    def _get_ocr(self) -> PaddleOCR:
        """
        Lazily initialize and return the PaddleOCR instance.
        
        @return Configured PaddleOCR instance.
        @raises RuntimeError If initialization fails.
        """
        if self._ocr is None:
            try:
                self._ocr = PaddleOCR(
                    use_angle_cls=self.config.use_angle_cls,
                    lang=self.config.lang,
                    show_log=False,
                    det_model_dir=str(self.config.det_model_dir),
                    rec_model_dir=str(self.config.rec_model_dir),
                    cls_model_dir=str(self.config.cls_model_dir),
                )
            except Exception as e:
                raise RuntimeError(f"Failed to initialize PaddleOCR: {e}") from e
        return self._ocr
    
    def process(self, image_path: str) -> List[OCRResult]:
        """
        Process an image and extract text with bounding boxes.
        
        @param image_path Path to the image file.
        @return List of OCRResult objects containing text and coordinates.
        @raises FileNotFoundError If the image file doesn't exist.
        @raises RuntimeError If OCR processing fails.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        ocr = self._get_ocr()
        
        try:
            result = ocr.ocr(image_path, cls=self.config.use_angle_cls)
        except Exception as e:
            raise RuntimeError(f"OCR processing failed: {e}") from e
        
        return self._parse_results(result)
    
    def _parse_results(self, raw_result) -> List[OCRResult]:
        """
        Parse raw PaddleOCR output into structured results.
        
        @param raw_result Raw output from PaddleOCR.
        @return List of structured OCRResult objects.
        """
        if raw_result is None or len(raw_result) == 0 or raw_result[0] is None:
            return []
        
        results = []
        for line in raw_result[0]:
            if len(line) >= 2:
                box_coords = line[0]
                text = line[1][0]
                confidence = line[1][1] if len(line[1]) > 1 else 1.0
                
                box = BoundingBox(
                    top_left=box_coords[0],
                    top_right=box_coords[1],
                    bottom_right=box_coords[2],
                    bottom_left=box_coords[3],
                )
                
                results.append(OCRResult(
                    text=text,
                    box=box,
                    confidence=confidence,
                ))
        
        return results
