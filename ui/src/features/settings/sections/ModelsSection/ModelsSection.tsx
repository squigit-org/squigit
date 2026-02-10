/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect } from "react";
import styles from "./ModelsSection.module.css";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/primitives";
import { UserPreferences } from "@/lib/storage/app-settings";
import { ModelDownloader } from "@/features/models/components/ModelDownloader";

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

  useEffect(() => {
    setActiveOcrModel(ocrLanguage);
  }, [ocrLanguage]);

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

  const handleDownloadComplete = (newDownloadedList: string[]) => {
    updatePreferences({ downloadedOcrLanguages: newDownloadedList });
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

      <ModelDownloader
        downloadedOcrLanguages={downloadedOcrLanguages}
        onDownloadComplete={handleDownloadComplete}
      />
    </section>
  );
};
