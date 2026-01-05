# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
Configuration for OCR Engine.

This module defines the configuration options for the OCR engine
including model paths and processing settings.

@author a7mddra
@version 1.0.0
"""

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _get_base_dir() -> Path:
    """
    Determine the base directory for model files.
    
    When running as a frozen PyInstaller executable, uses the
    temporary extraction directory. Otherwise uses the script
    directory.
    
    @return Path to the base directory.
    """
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    else:
        return Path(__file__).parent.parent.absolute()


@dataclass
class EngineConfig:
    """
    Configuration settings for the OCR engine.
    
    Controls model paths, language settings, and processing options.
    
    @example
        config = EngineConfig(lang='en', use_angle_cls=True)
        engine = OCREngine(config)
    """
    
    lang: str = 'en'
    
    use_angle_cls: bool = True
    
    base_dir: Optional[Path] = None
    
    def __post_init__(self):
        """Initialize computed paths after dataclass init."""
        if self.base_dir is None:
            self.base_dir = _get_base_dir()
    
    @property
    def model_dir(self) -> Path:
        """
        Get the models directory path.
        
        @return Path to the models directory.
        """
        return self.base_dir / "models"
    
    @property
    def det_model_dir(self) -> Path:
        """
        Get the detection model directory path.
        
        @return Path to detection model.
        """
        return self.model_dir / "en_PP-OCRv3_det"
    
    @property
    def rec_model_dir(self) -> Path:
        """
        Get the recognition model directory path.
        
        @return Path to recognition model.
        """
        return self.model_dir / "en_PP-OCRv4_rec"
    
    @property
    def cls_model_dir(self) -> Path:
        """
        Get the classification model directory path.
        
        @return Path to classification model.
        """
        return self.model_dir / "ch_ppocr_mobile_v2.0_cls"
