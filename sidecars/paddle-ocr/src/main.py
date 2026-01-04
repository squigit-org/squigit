#!/usr/bin/env python3
# Copyright 2025 a7mddra
# SPDX-License-Identifier: Apache-2.0

"""
OCR Engine CLI - Command-line interface for text extraction.

This is the main entry point for the OCR engine executable.
It processes an image file and outputs detected text with
bounding box coordinates as JSON.

@author a7mddra
@version 1.0.0

@usage
    ocr-engine <image_path>
    
@example
    $ ocr-engine document.png
    [{"text": "Hello World", "box": [[10,20], [100,20], [100,50], [10,50]]}]
"""

import sys
import json
from pathlib import Path

# Add parent to path for module imports when running as script
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from src import OCREngine, NumpyEncoder


def main() -> int:
    """
    Main entry point for the OCR engine CLI.
    
    Processes command-line arguments, runs OCR on the specified
    image, and outputs results as JSON to stdout.
    
    @return Exit code (0 for success, 1 for error).
    """
    # Validate arguments
    if len(sys.argv) < 2:
        error = {"error": "No image path provided"}
        print(json.dumps(error))
        return 1
    
    image_path = sys.argv[1]
    
    # Validate image exists
    if not Path(image_path).exists():
        error = {"error": f"Image not found: {image_path}"}
        print(json.dumps(error))
        return 1
    
    try:
        # Initialize engine and process image
        engine = OCREngine()
        results = engine.process(image_path)
        
        # Convert results to JSON-serializable format
        output = [result.to_dict() for result in results]
        print(json.dumps(output, cls=NumpyEncoder))
        
        return 0
        
    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
