/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OcrModel {
  id: string;
  name: string;
  lang: string;
  size: string;
  downloadUrl: string;
}

export interface OcrModelStatus extends OcrModel {
  state:
    | "idle"
    | "checking"
    | "downloading"
    | "paused"
    | "downloaded"
    | "extracting";
  progress?: number;
}

export const AVAILABLE_MODELS: OcrModel[] = [
  {
    id: "pp-ocr-v4-en",
    name: "PP-OCR-V4 English",
    lang: "en",
    size: "11 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-ru",
    name: "PP-OCR-V4 Russian",
    lang: "ru",
    size: "12 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv3/multilingual/cyrillic_PP-OCRv3_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-ko",
    name: "PP-OCR-V4 Korean",
    lang: "ko",
    size: "15 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/korean_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-ja",
    name: "PP-OCR-V4 Japanese",
    lang: "ja",
    size: "14 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/japan_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-zh",
    name: "PP-OCR-V4 Chinese",
    lang: "ch",
    size: "16 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-es",
    name: "PP-OCR-V4 Spanish",
    lang: "es",
    size: "11 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/spanish_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-it",
    name: "PP-OCR-V4 Italian",
    lang: "it",
    size: "11 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/it_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-pt",
    name: "PP-OCR-V4 Portuguese",
    lang: "pt",
    size: "11 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/pt_PP-OCRv4_rec_infer.tar",
  },
  {
    id: "pp-ocr-v4-hi",
    name: "PP-OCR-V4 Hindi",
    lang: "hi",
    size: "18 MB",
    downloadUrl:
      "https://paddleocr.bj.bcebos.com/PP-OCRv4/multilingual/hindi_PP-OCRv4_rec_infer.tar",
  },
];

export const getLanguageCode = (modelId: string) => {
  if (!modelId) return "EN";
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return model ? model.lang.toUpperCase() : "EN";
};
