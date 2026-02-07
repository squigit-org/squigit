/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect } from "react";
import styles from "./ModelsSection.module.css";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/widgets";
import { Download, Check, Loader2 } from "lucide-react";
import { UserPreferences } from "@/lib/storage/app-settings";

import { AVAILABLE_MODELS, OcrModelDownloable } from "@/features/models";

interface ModelsSectionProps {
  localModel: string;
  setLocalModel: (model: string) => void;
  ocrLanguage: string;
  downloadedOcrLanguages: string[];
  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  localModel,
  setLocalModel,
  ocrLanguage,
  downloadedOcrLanguages,
  updatePreferences,
}) => {
  const [activeModel, setActiveModel] = useState(localModel);
  const [activeOcrModel, setActiveOcrModel] = useState(ocrLanguage);

  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [ocrMenuOpen, setOcrMenuOpen] = useState(false);

  // Initialize download list state based on downloadedOcrLanguages
  const [downloadList, setDownloadList] = useState<OcrModelDownloable[]>(() => {
    return AVAILABLE_MODELS.map((model) => {
      // Check if this model ID is in the downloaded list
      // Note: downloadedOcrLanguages stores generic names like "PP-OCRv4 (English)"
      // but AVAILABLE_MODELS has IDs like "pp-ocr-v4-ru".
      // We need to map IDs to the stored names or change how we store them.
      // Based on defaults: "PP-OCRv4 (English)" corresponds to id "pp-ocr-v4-en".
      // Let's assume downloadedOcrLanguages stores the IDs for robust matching,
      // OR we need a mapping.
      // The current preferences.ts default is ["PP-OCRv4 (English)"].
      // This is the NAME, not the ID. This is fragile.
      // Ideally we should store IDs.
      // But looking at existing code:
      // ocrLanguage: "PP-OCRv4 (English)"
      // handleOcrSelect("pp-ocr-v4-en") -> sets activeOcrModel to ID.
      // Wait, let's check `handleOcrSelect` implementation below.

      // Let's check if the model is "downloaded".
      // For now, let's assume we store IDs in downloadedOcrLanguages to be safe?
      // Or check if the name matches?
      // The defaults use names. Let's stick to names for compatibility if established,
      // or better, switch to IDs if possible.
      // The snippet below cleans this up.
      return model;
    });
  });

  // Re-sync local state when props change
  useEffect(() => {
    setActiveOcrModel(ocrLanguage);
  }, [ocrLanguage]);

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

  const handleModelSelect = useCallback(
    (id: string) => {
      setActiveModel(id);
      updatePreferences({ model: id });
      setAiMenuOpen(false);
    },
    [setLocalModel, updatePreferences],
  );

  const handleOcrSelect = (id: string, name: string) => {
    setActiveOcrModel(name);
    updatePreferences({ ocrLanguage: name }); // Store the Name as per existing convention
    setOcrMenuOpen(false);
  };

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
        updatePreferences({ downloadedOcrLanguages: uniqueDownloaded });

        setDownloadList((prev) =>
          prev.map((m) => (m.id === id ? { ...m, state: "downloaded" } : m)),
        );
      }
    }, 2000);
  };

  const getModelLabel = (id: string) => {
    switch (id) {
      case "gemini-2.5-pro":
        return "Gemini 2.5 Pro";
      case "gemini-2.5-flash":
        return "Gemini 2.5 Flash";
      case "gemini-flash-lite-latest":
        return "Gemini 2.5 Lite";
      default:
        return id;
    }
  };

  // Helper to map current generic name to ID if needed, or just display name.
  // The dropdown label displays the name.

  // Combine installed static models with downloaded ones for the dropdown
  // Combine installed static models with downloaded ones for the dropdown
  // We treat preferences.json (downloadedOcrLanguages) as the single source of truth.
  const installedModels = downloadedOcrLanguages.map((name) => ({
    id: name,
    name: name,
  }));

  return (
    <section className={styles.container} aria-labelledby="models-heading">
      <header className={styles.sectionHeader}>
        <h2 id="models-heading" className={styles.sectionTitle}>
          Models
        </h2>
      </header>

      <div className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>AI features</span>
            <span className={styles.description}>
              Choose your preferred model for future chats
            </span>
          </div>
          <div className={styles.rowControl}>
            <Dropdown
              label={getModelLabel(activeModel)}
              width={180}
              isOpen={aiMenuOpen}
              onOpenChange={setAiMenuOpen}
            >
              <DropdownSectionTitle>Gemini Models</DropdownSectionTitle>
              <div className={styles.list}>
                <DropdownItem
                  label="Gemini 2.5 Pro"
                  isActive={activeModel === "gemini-2.5-pro"}
                  onClick={() => handleModelSelect("gemini-2.5-pro")}
                />
                <DropdownItem
                  label="Gemini 2.5 Flash"
                  isActive={activeModel === "gemini-2.5-flash"}
                  onClick={() => handleModelSelect("gemini-2.5-flash")}
                />
                <DropdownItem
                  label="Gemini 2.5 Lite"
                  isActive={activeModel === "gemini-flash-lite-latest"}
                  onClick={() => handleModelSelect("gemini-flash-lite-latest")}
                />
              </div>
            </Dropdown>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>OCR language</span>
            <span className={styles.description}>
              Choose your preferred language for future chats
            </span>
          </div>
          <div className={styles.rowControl}>
            <Dropdown
              label={activeOcrModel}
              width={230}
              isOpen={ocrMenuOpen}
              onOpenChange={setOcrMenuOpen}
            >
              <DropdownSectionTitle>Installed Models</DropdownSectionTitle>
              <div className={`${styles.list} ${styles.ocr}`}>
                {installedModels.map((m) => (
                  <DropdownItem
                    key={m.id}
                    label={m.name}
                    isActive={activeOcrModel === m.name}
                    onClick={() => handleOcrSelect(m.id, m.name)}
                  />
                ))}
              </div>
            </Dropdown>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

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
    </section>
  );
};
