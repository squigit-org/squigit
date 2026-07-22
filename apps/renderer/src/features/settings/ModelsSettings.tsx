/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from "react";
import styles from "./ModelsSettings.module.css";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/components/ui";
import { DEFAULT_OCR_MODEL_ID, MODELS } from "@squigit/core/config";
import {
  EffortMenu,
  formatEffortLabel,
} from "./components/EffortMenu";
import type {
  ModelEffort,
  ModelId,
  UserPreferences,
} from "@squigit/core/config";
import {
  OCRModelDownloader,
  useModelsStore,
  getModelById,
} from "@/features/ocr";

interface ModelSettingsProps {
  localModel: ModelId;
  effort: ModelEffort;
  ocrLanguage: string;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  isWizard?: boolean;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  localModel,
  effort,
  ocrLanguage,
  updatePreferences,
  isWizard,
}) => {
  const models = useModelsStore((s) => s.models);
  const installedModels = models.filter((m) => m.state === "downloaded");
  const [activeModel, setActiveModel] = useState(localModel);
  const [ocrMenuOpen, setOcrMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  useEffect(() => {
    setActiveModel(localModel);
  }, [localModel]);

  const activeOcrModel =
    installedModels.find((m) => m.id === ocrLanguage) ??
    getModelById(DEFAULT_OCR_MODEL_ID);

  const handleModelSelect = useCallback(
    (id: ModelId) => {
      setActiveModel(id);
      updatePreferences({ model: id });
      setAiMenuOpen(false);
    },
    [updatePreferences],
  );

  const handleOcrSelect = (id: string) => {
    updatePreferences({ ocrLanguage: id });
    setOcrMenuOpen(false);
  };

  const getModelLabel = (id: string) =>
    MODELS.find((model) => model.id === id)?.name || id;

  return (
    <section
      className={`${styles.container} ${isWizard ? styles.wizardContainer : ""}`}
      aria-labelledby="models-heading"
    >
      {!isWizard && (
        <header className={styles.sectionHeader}>
          <h2 id="models-heading" className={styles.sectionTitle}>
            Models
          </h2>
        </header>
      )}

      <div className={`${styles.group} ${isWizard ? styles.wizardGroup : ""}`}>
        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>
              {isWizard ? "Default model" : "AI features"}
            </span>
            <span className={styles.description}>
              Choose your preferred model for future squigits
            </span>
          </div>
          <div className={styles.rowControl}>
            <Dropdown
              label={`Gemini ${getModelLabel(activeModel)} ${formatEffortLabel(
                effort,
              )}`}
              width={180}
              isOpen={aiMenuOpen}
              onOpenChange={setAiMenuOpen}
              direction={isWizard ? "up" : "down"}
            >
              <div className={styles.list}>
                {MODELS.map((model) => (
                  <DropdownItem
                    key={model.id}
                    label={`Gemini ${model.name}`}
                    isActive={activeModel === model.id}
                    onClick={() => handleModelSelect(model.id)}
                  />
                ))}
                <EffortMenu
                  effort={effort}
                  zIndex={10000}
                  onSelect={(nextEffort) =>
                    updatePreferences({ effort: nextEffort })
                  }
                />
              </div>
            </Dropdown>
          </div>
        </div>

        {!isWizard && (
          <>
            <div className={styles.divider} />

            <div className={styles.row}>
              <div className={styles.rowMeta}>
                <span className={styles.label}>OCR language</span>
                <span className={styles.description}>
                  Set the default language for text recognition
                </span>
              </div>
              <div className={styles.rowControl}>
                <Dropdown
                  label={activeOcrModel?.name || "Select Model"}
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
                        isActive={activeOcrModel?.id === m.id}
                        onClick={() => handleOcrSelect(m.id)}
                      />
                    ))}
                  </div>
                </Dropdown>
              </div>
            </div>
          </>
        )}
      </div>

      {!isWizard && (
        <>
          <div className={styles.divider} />
          <OCRModelDownloader />
        </>
      )}
    </section>
  );
};
