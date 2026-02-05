/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from "react";
import styles from "./ModelsSection.module.css";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/widgets";
import { Download, Check, Loader2 } from "lucide-react";
import { UserPreferences } from "@/lib/config/preferences";

interface OcrModelDownloable {
  id: string;
  name: string;
  size: string;
  state: "idle" | "downloading" | "downloaded";
}

interface ModelsSectionProps {
  localModel: string;
  setLocalModel: (model: string) => void;
  ocrLanguage: string;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

const AVAILABLE_MODELS: OcrModelDownloable[] = [
  { id: "pp-ocr-v4-ru", name: "Russian", size: "12 MB", state: "idle" },
  { id: "pp-ocr-v4-ko", name: "Korean", size: "15 MB", state: "idle" },
  { id: "pp-ocr-v4-ja", name: "Japanese", size: "14 MB", state: "idle" },
  { id: "pp-ocr-v4-es", name: "Spanish", size: "11 MB", state: "idle" },
  { id: "pp-ocr-v4-it", name: "Italian", size: "11 MB", state: "idle" },
  { id: "pp-ocr-v4-pt", name: "Portuguese", size: "11 MB", state: "idle" },
  { id: "pp-ocr-v4-hi", name: "Hindi", size: "18 MB", state: "idle" },
];

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  localModel,
  setLocalModel,
  ocrLanguage,
  updatePreferences,
}) => {
  const [activeModel, setActiveModel] = useState(localModel);
  const [activeOcrModel, setActiveOcrModel] = useState(ocrLanguage);

  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [ocrMenuOpen, setOcrMenuOpen] = useState(false);

  const [downloadList, setDownloadList] = useState(AVAILABLE_MODELS);

  const handleModelSelect = useCallback(
    (id: string) => {
      setActiveModel(id);
      updatePreferences({ model: id });
      setAiMenuOpen(false);
    },
    [setLocalModel, updatePreferences],
  );

  const handleOcrSelect = (id: string) => {
    setActiveOcrModel(id);
    setOcrMenuOpen(false);
  };

  const handleDownload = (id: string) => {
    setDownloadList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, state: "downloading" } : m)),
    );

    setTimeout(() => {
      setDownloadList((prev) =>
        prev.map((m) => (m.id === id ? { ...m, state: "downloaded" } : m)),
      );
    }, 3000);
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

  const getOcrLabel = (id: string) => {
    const ocrModels = [
      { id: "pp-ocr-v4-en", name: "English" },
      { id: "pp-ocr-v4-ar", name: "Arabic" },
      { id: "pp-ocr-v4-zh", name: "Chinese" },
      { id: "pp-ocr-v4-fr", name: "French" },
      { id: "pp-ocr-v4-de", name: "German" },
    ];
    const found = ocrModels.find((m) => m.id === id);
    return found ? found.name : "Select Model";
  };

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
            <span className={styles.label}>OCR model</span>
            <span className={styles.description}>
              Choose your preferred model for future chats
            </span>
          </div>
          <div className={styles.rowControl}>
            <Dropdown
              label={getOcrLabel(activeOcrModel)}
              width={200}
              isOpen={ocrMenuOpen}
              onOpenChange={setOcrMenuOpen}
            >
              <DropdownSectionTitle>Installed Models</DropdownSectionTitle>
              <div className={`${styles.list} ${styles.ocr}`}>
                <DropdownItem
                  label="PP-OCRv4 (English)"
                  isActive={activeOcrModel === "pp-ocr-v4-en"}
                  onClick={() => handleOcrSelect("pp-ocr-v4-en")}
                />
                <DropdownItem
                  label="PP-OCRv4 (Arabic)"
                  isActive={activeOcrModel === "pp-ocr-v4-ar"}
                  onClick={() => handleOcrSelect("pp-ocr-v4-ar")}
                />
                <DropdownItem
                  label="PP-OCRv4 (Chinese)"
                  isActive={activeOcrModel === "pp-ocr-v4-zh"}
                  onClick={() => handleOcrSelect("pp-ocr-v4-zh")}
                />
                <DropdownItem
                  label="PP-OCRv4 (French)"
                  isActive={activeOcrModel === "pp-ocr-v4-fr"}
                  onClick={() => handleOcrSelect("pp-ocr-v4-fr")}
                />
                <DropdownItem
                  label="PP-OCRv4 (German)"
                  isActive={activeOcrModel === "pp-ocr-v4-de"}
                  onClick={() => handleOcrSelect("pp-ocr-v4-de")}
                />
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
