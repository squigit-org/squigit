/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  type OcrAnnotations,
  type ReverseImageSearchCache,
  saveOcrData,
  saveReverseImageSearchCache,
} from "@squigit/core/config";

export const useAppOcr = (activeSessionId: string | null) => {
  const [sessionLensUrl, setSessionLensUrl] = useState<string | null>(null);
  const [ocrData, setOcrData] = useState<OcrAnnotations>({});
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const activeSessionIdRef = useRef(activeSessionId);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const handleUpdateLensCache = useCallback(
    (cache: ReverseImageSearchCache) => {
      const googleLensUrl = cache.google_lens_url || null;
      setSessionLensUrl(googleLensUrl);
      if (activeSessionId && cache.imgbb_url && googleLensUrl) {
        saveReverseImageSearchCache(
          activeSessionId,
          cache.imgbb_url,
          googleLensUrl,
        ).catch((e) =>
          console.error("Failed to save reverse image search cache", e),
        );
      }
    },
    [activeSessionId],
  );

  const handleUpdateOCRData = useCallback(
    (
      targetThreadId: string | null,
      modelId: string,
      data: { text: string; box: number[][] }[],
    ) => {
      const regions = data.map((d) => ({
        text: d.text,
        bbox: d.box,
      }));
      const threadIdForWrite = targetThreadId || activeSessionIdRef.current;

      if (threadIdForWrite && modelId) {
        saveOcrData(threadIdForWrite, modelId, regions).catch((e) =>
          console.error("Failed to save OCR", e),
        );
      }

      if (
        !threadIdForWrite ||
        threadIdForWrite !== activeSessionIdRef.current ||
        !modelId
      ) {
        return;
      }

      console.log(`[useApp] Updating OCR data for model: ${modelId}`);
      setOcrData((prev) => {
        const newState = {
          ...prev,
          [modelId]: {
            scanned_at: new Date().toISOString(),
            ocr_data: regions,
          },
        };
        console.log(
          `[useApp] New OCR Data keys: ${Object.keys(newState).join(", ")}`,
        );
        return newState;
      });
    },
    [],
  );

  return {
    sessionLensUrl,
    setSessionLensUrl,
    handleUpdateLensCache,
    ocrData,
    setOcrData,
    handleUpdateOCRData,
    isOcrScanning,
    setIsOcrScanning,
  };
};
