/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./ModelDownloader.module.css";
import { Download, Check, Loader2 } from "lucide-react";
import { useModelsStore } from "../../store";

export const ModelDownloader: React.FC = () => {
  const models = useModelsStore((s) => s.models);
  const startDownload = useModelsStore((s) => s.startDownload);
  const isLoading = useModelsStore((s) => s.isLoading);

  const handleDownload = async (id: string) => {
    try {
      await startDownload(id);
    } catch (error) {
      console.error("Download failed from component", error);
    }
  };

  const downloadableModels = models.filter((m) => m.id !== "pp-ocr-v4-en");

  return (
    <div className={styles.downloadSection}>
      <div className={styles.downloadHeader}>
        <div className={styles.downloadTitle}>Get more models</div>
        <div className={styles.downloadDesc}>
          Download additional OCR language models
        </div>
      </div>

      <div className={styles.modelList}>
        {isLoading && <p>Loading model list...</p>}
        {!isLoading &&
          downloadableModels.map((model) => (
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
                title={
                  model.state === "downloaded"
                    ? "Installed"
                    : `Download ${model.name}`
                }
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
