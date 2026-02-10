/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import styles from "./ModelDownloader.module.css";
import { Download, Check, Loader2 } from "lucide-react";
import { AVAILABLE_MODELS, OcrModelDownloable } from "@/features/models";

interface ModelDownloaderProps {
  downloadedOcrLanguages: string[];
  onDownloadComplete: (newDownloadedList: string[]) => void;
}

export const ModelDownloader: React.FC<ModelDownloaderProps> = ({
  downloadedOcrLanguages,
  onDownloadComplete,
}) => {
  // Initialize download list state
  const [downloadList, setDownloadList] = useState<OcrModelDownloable[]>(() => {
    return AVAILABLE_MODELS.map((model) => model);
  });

  // Update download list state when preferences change
  useEffect(() => {
    setDownloadList((prev) =>
      prev.map((model) => {
        const isDownloaded = downloadedOcrLanguages.some(
          (lang) => lang === model.id || lang.includes(model.name),
        );
        if (isDownloaded && model.state !== "downloaded") {
          return { ...model, state: "downloaded" };
        }
        return model;
      }),
    );
  }, [downloadedOcrLanguages]);

  const handleDownload = (id: string) => {
    setDownloadList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, state: "downloading" } : m)),
    );

    setTimeout(() => {
      const model = downloadList.find((m) => m.id === id);
      if (model) {
        // Add to preferences
        // We use the full ID for tracking downloads now, or just the model name?
        // User said: "just add the suffix of it (after v4-******) in the model switcher"
        // But for ModelDownloader checking if downloaded:
        // const isDownloaded = downloadedOcrLanguages.some((langName) => langName.includes(model.name));
        // If downloadedOcrLanguages contains "Russian", and model.name is "Russian", it works.
        // If downloadedOcrLanguages contains "pp-ocr-v4-ru", it MIGHT NOT work if we check includes(name).
        // Let's assume downloadedOcrLanguages stores the ID or the Name.
        // Previously it stored `PP-OCRv4 (${model.name})`.
        // Now let's store the ID `pp-ocr-v4-ru` or just `ru`?
        // The user said: "the id: "pp-ocr-v4-ru", is the real form in pp server so we can download them"
        // So we should probably store the full ID in the downloaded list to be safe, or the model name.
        // The existing check `langName.includes(model.name)` suggests we store something containing the name.
        // Let's store the full ID for correctness.
        const newLabel = model.id;
        const newDownloaded = [...downloadedOcrLanguages, newLabel];
        // Remove duplicates just in case
        const uniqueDownloaded = Array.from(new Set(newDownloaded));
        onDownloadComplete(uniqueDownloaded);

        setDownloadList((prev) =>
          prev.map((m) => (m.id === id ? { ...m, state: "downloaded" } : m)),
        );
      }
    }, 2000);
  };

  return (
    <div className={styles.downloadSection}>
      <div className={styles.downloadHeader}>
        <div className={styles.downloadTitle}>Get more models</div>
        <div className={styles.downloadDesc}>
          Download additional OCR models from the web
        </div>
      </div>

      <div className={styles.modelList}>
        {downloadList.map((model) => (
          <div key={model.id} className={styles.modelRow}>
            <div className={styles.modelRowInfo}>
              <span className={styles.modelName}>{model.name}</span>
              <span className={styles.modelSize}>{model.size}</span>
            </div>
            <button
              className={`${styles.downloadButton} ${
                model.state === "downloading" ? styles.downloading : ""
              }`}
              onClick={() => handleDownload(model.id)}
              disabled={model.state !== "idle"}
              title={model.state === "downloaded" ? "Installed" : "Download"}
            >
              {model.state === "idle" && <Download size={16} />}
              {model.state === "downloading" && (
                <Loader2 size={16} className={styles.spin} />
              )}
              {model.state === "downloaded" && <Check size={16} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
