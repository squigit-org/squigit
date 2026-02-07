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
        const isDownloaded = downloadedOcrLanguages.some((langName) =>
          langName.includes(model.name),
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
        const newLabel = `PP-OCRv4 (${model.name})`;
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
