/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Download, Check, Loader2, X, Trash2 } from "lucide-react";
import { OcrCircularArcIcon } from "@/components/icons";
import { useModelsStore } from "../ocr-models.store";
import { Dialog } from "@/components/ui";
import { DEFAULT_OCR_MODEL_ID } from "@squigit/core/config";
import { getErrorDialog, getRemoveOcrModelDialog } from "@squigit/core/helpers";
import styles from "./OCRModelDownloader.module.css";

const CircularProgress: React.FC<{ progress: number }> = ({ progress }) => (
  <div className={styles.circularProgress}>
    <OcrCircularArcIcon
      className={styles.circularChart}
      trackClassName={styles.circleBg}
      arcClassName={styles.circle}
      strokeDasharray={`${progress}, 100`}
    />
  </div>
);

const CircularSpinner: React.FC<{
  paused?: boolean;
  progressHint?: number;
}> = ({ paused = false, progressHint = 0 }) => {
  const dashHead = Math.max(12, Math.min(36, Math.round(progressHint * 0.35)));
  return (
    <div
      className={`${styles.circularProgress} ${paused ? styles.spinnerPaused : ""}`}
    >
      <OcrCircularArcIcon
        className={`${styles.circularChart} ${styles.spinnerOrbit}`}
        trackClassName={styles.circleBg}
        arcClassName={styles.spinnerArc}
        strokeDasharray={`${dashHead}, 100`}
      />
    </div>
  );
};

export const OCRModelDownloader: React.FC = () => {
  const models = useModelsStore((s) => s.models);
  const startDownload = useModelsStore((s) => s.startDownload);
  const cancelDownload = useModelsStore((s) => s.cancelDownload);
  const trashDownloadedModel = useModelsStore((s) => s.trashDownloadedModel);
  const isLoading = useModelsStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [justStartedDownload, setJustStartedDownload] = useState<string | null>(null);
  const [spinnerFor2s, setSpinnerFor2s] = useState<Record<string, boolean>>({});
  const [modelIdToTrash, setModelIdToTrash] = useState<string | null>(null);

  const handleDownload = async (id: string) => {
    try {
      setJustStartedDownload(id);
      setSpinnerFor2s((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setSpinnerFor2s((prev) => ({ ...prev, [id]: false }));
      }, 2000);
      await startDownload(id);
    } catch (error: any) {
      const msg = error.message || error.toString();
      if (msg.toLowerCase().includes("cancelled")) {
        console.log("Download cancelled by user (silent)");
        return;
      }
      console.error("Download failed from component", error);
      setError(msg || "Failed to download model");
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await cancelDownload(id);
  };

  const handleConfirmTrash = async () => {
    if (!modelIdToTrash) return;

    const id = modelIdToTrash;
    setModelIdToTrash(null);
    try {
      await trashDownloadedModel(id);
    } catch (error: any) {
      const msg = error.message || error.toString();
      console.error("Failed to trash downloaded model", error);
      setError(msg || "Failed to remove downloaded model");
    }
  };

  const downloadableModels = models.filter(
    (m) => m.id !== DEFAULT_OCR_MODEL_ID,
  );
  const modelToTrash = downloadableModels.find((m) => m.id === modelIdToTrash);

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
          downloadableModels.map((model) => {
            const isActiveDownload = ["downloading", "checking", "paused"].includes(
              model.state,
            );
            const isInstalled = model.state === "downloaded";

            return (
              <div key={model.id} className={styles.modelRow}>
                <div className={styles.modelRowInfo}>
                  <span className={styles.modelName}>{model.name}</span>
                  <span className={styles.modelSize}>{model.size}</span>
                </div>
                <div className={styles.modelActions}>
                  <button
                    className={styles.trashButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      setModelIdToTrash(model.id);
                    }}
                    disabled={!isInstalled}
                    title={
                      isInstalled
                        ? `Remove ${model.name}`
                        : "Model is not installed"
                    }
                    aria-label={`Remove ${model.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    className={`${styles.downloadButton} ${
                      isActiveDownload ? styles.downloading : ""
                    }`}
                    onClick={(e) => {
                      if (isActiveDownload) {
                        handleCancel(e, model.id);
                      } else {
                        handleDownload(model.id);
                      }
                    }}
                    disabled={model.state === "extracting" || isInstalled}
                    onMouseEnter={() => setHoveredModelId(model.id)}
                    onMouseLeave={() => {
                      setHoveredModelId(null);
                      if (justStartedDownload === model.id) {
                        setJustStartedDownload(null);
                      }
                    }}
                    title={
                      isInstalled
                        ? "Installed"
                        : isActiveDownload
                          ? "Cancel Download"
                          : `Download ${model.name}`
                    }
                  >
                    {model.state === "idle" && <Download size={16} />}

                    {model.state === "checking" &&
                      (hoveredModelId === model.id &&
                      justStartedDownload !== model.id &&
                      !spinnerFor2s[model.id] ? (
                        <X size={16} />
                      ) : (
                        <CircularSpinner progressHint={model.progress || 0} />
                      ))}

                    {model.state === "downloading" &&
                      (hoveredModelId === model.id &&
                      justStartedDownload !== model.id &&
                      !spinnerFor2s[model.id] ? (
                        <X size={16} />
                      ) : spinnerFor2s[model.id] ? (
                        <CircularSpinner progressHint={0} />
                      ) : (model.progress || 0) <= 0 ? (
                        <CircularSpinner progressHint={model.progress || 0} />
                      ) : (
                        <CircularProgress progress={model.progress || 0} />
                      ))}

                    {model.state === "paused" &&
                      (hoveredModelId === model.id &&
                      justStartedDownload !== model.id ? (
                        <X size={16} />
                      ) : (
                        <CircularSpinner
                          paused
                          progressHint={model.progress || 0}
                        />
                      ))}

                    {model.state === "extracting" && (
                      <Loader2 size={16} className={styles.spin} />
                    )}

                    {isInstalled && <Check size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      <Dialog
        isOpen={!!error}
        type={getErrorDialog(error || "")}
        onAction={() => setError(null)}
      />

      <Dialog
        isOpen={!!modelToTrash}
        type={
          modelToTrash ? getRemoveOcrModelDialog(modelToTrash.name) : undefined
        }
        onAction={(key) => {
          if (key === "confirm") {
            void handleConfirmTrash();
          } else {
            setModelIdToTrash(null);
          }
        }}
      />
    </div>
  );
};
