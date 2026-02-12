# Copyright 2026 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
OCR Engine - PaddleOCR based text extraction engine.

This module provides the main OCREngine class for extracting text
and bounding boxes from images using PaddleOCR.

@author a7mddra
@version 2.0.0
"""

import os
import sys
import logging
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
from paddleocr import PaddleOCR

from .models import OCRResult, BoundingBox
from .config import EngineConfig

# Maximum side length for detection input. Images larger than this are
# downscaled proportionally before detection, and bounding boxes are
# mapped back to original coordinates. This prevents the detection model
# from doing unnecessary work on 4K/ultrawide screenshots.
MAX_DET_SIDE = 2048


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
        Configure environment variables and runtime settings for PaddleOCR.
        
        Sets up model paths, disables automatic downloads, and limits
        OpenCV internal thread pool to prevent CPU saturation.
        """
        os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "True"
        os.environ["PADDLEOCR_BASE_PATH"] = str(self.config.model_dir)
        
        # Limit OpenCV's internal thread pool (used for image decoding,
        # resizing, etc.). Without this, OpenCV spawns threads per core.
        cv2.setNumThreads(1)
        
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
    
    def _preprocess_image(self, image_path: str) -> Tuple[str, float, Optional[str]]:
        """
        Downscale image if its largest dimension exceeds MAX_DET_SIDE.
        
        Returns the (possibly new) image path, the scale factor applied,
        and the temp file path to clean up (or None if no scaling needed).
        
        @param image_path Path to the original image.
        @return Tuple of (image_path_to_use, scale_factor, temp_path_or_None).
        """
        img = cv2.imread(image_path)
        if img is None:
            # Let PaddleOCR handle the error downstream
            return image_path, 1.0, None
        
        h, w = img.shape[:2]
        max_side = max(h, w)
        
        if max_side <= MAX_DET_SIDE:
            return image_path, 1.0, None
        
        scale = MAX_DET_SIDE / max_side
        new_w = int(w * scale)
        new_h = int(h * scale)
        
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        cv2.imwrite(tmp.name, resized)
        tmp.close()
        
        return tmp.name, scale, tmp.name
    
    def process(self, image_path: str) -> List[OCRResult]:
        """
        Process an image and extract text with bounding boxes.
        
        Large images are automatically downscaled for detection, and
        bounding box coordinates are mapped back to original resolution.
        
        @param image_path Path to the image file.
        @return List of OCRResult objects containing text and coordinates.
        @raises FileNotFoundError If the image file doesn't exist.
        @raises RuntimeError If OCR processing fails.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Downscale large images to prevent CPU overload during detection
        det_path, scale, tmp_path = self._preprocess_image(image_path)
        
        ocr = self._get_ocr()
        
        try:
            result = ocr.ocr(det_path, cls=self.config.use_angle_cls)
        except Exception as e:
            raise RuntimeError(f"OCR processing failed: {e}") from e
        finally:
            # Clean up temp file if we created one
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        
        return self._parse_results(result, scale)
    
    def _parse_results(self, raw_result, scale: float = 1.0) -> List[OCRResult]:
        """
        Parse raw PaddleOCR output into structured results.
        
        If the image was downscaled, bounding box coordinates are mapped
        back to original resolution using the inverse scale factor.
        
        @param raw_result Raw output from PaddleOCR.
        @param scale Scale factor that was applied during preprocessing.
        @return List of structured OCRResult objects.
        """
        if raw_result is None or len(raw_result) == 0 or raw_result[0] is None:
            return []
        
        inv_scale = 1.0 / scale if scale != 1.0 else 1.0
        
        results = []
        for line in raw_result[0]:
            if len(line) >= 2:
                box_coords = line[0]
                text = line[1][0]
                confidence = line[1][1] if len(line[1]) > 1 else 1.0
                
                # Map coordinates back to original image resolution
                if inv_scale != 1.0:
                    box_coords = [
                        [c[0] * inv_scale, c[1] * inv_scale]
                        for c in box_coords
                    ]
                
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
