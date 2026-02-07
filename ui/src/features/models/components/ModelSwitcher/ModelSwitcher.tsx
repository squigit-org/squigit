/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from "react";
import { ChevronDown, Check, ChevronLeft, PackagePlus } from "lucide-react";
import { MODELS } from "@/lib/config/models";
import styles from "./ModelSwitcher.module.css";
import { SettingsSection } from "@/shell";

interface ModelSwitcherProps {
  currentModel: string;
  onModelChange: (modelId: string) => void;
  isLoading: boolean;
  isHidden?: boolean;
  onOpenSettings: (section: SettingsSection) => void;
  ocrEnabled: boolean;
  downloadedOcrLanguages: string[];
  currentOcrModel: string;
  onOcrModelChange: (model: string) => void;
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
  currentModel,
  onModelChange,
  isLoading,
  isHidden = false,
  onOpenSettings,
  ocrEnabled,
  downloadedOcrLanguages,
  currentOcrModel,
  onOcrModelChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showOcrMenu, setShowOcrMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ocrMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const orderedModels = [
    MODELS.find((m) => m.id === "gemini-2.5-pro"),
    MODELS.find((m) => m.id === "gemini-2.5-flash"),
    MODELS.find((m) => m.id === "gemini-flash-lite-latest"),
  ].filter((m): m is (typeof MODELS)[number] => !!m);
  const selectedModel = MODELS.find((m) => m.id === currentModel);

  const handleOCRModelSelect = (modelId: string) => {
    onOcrModelChange(modelId);
    setShowOcrMenu(false);
  };

  const ocrModels = downloadedOcrLanguages.map((name) => ({
    id: name, // Using name as ID for now to match TitleBar/Settings behavior
    name: name,
  }));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

  const handleOcrMouseEnter = () => {
    if (ocrMenuTimeoutRef.current) {
      clearTimeout(ocrMenuTimeoutRef.current);
      ocrMenuTimeoutRef.current = null;
    }
    setShowOcrMenu(true);
  };

  const handleOcrMouseLeave = () => {
    ocrMenuTimeoutRef.current = setTimeout(() => {
      setShowOcrMenu(false);
    }, 150);
  };

  return (
    <div
      className={`${styles.modelSwitcher} ${isHidden ? styles.hidden : ""}`}
      ref={containerRef}
    >
      <button
        ref={buttonRef}
        disabled={isLoading}
        className={`${styles.trigger} ${isOpen ? styles.active : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          {selectedModel?.id === "gemini-2.5-pro"
            ? "2.5 pro"
            : selectedModel?.id === "gemini-2.5-flash"
              ? "2.5 flash"
              : selectedModel?.id === "gemini-flash-lite-latest"
                ? "2.5 lite"
                : "Select Model"}
        </span>
        <ChevronDown
          size={18}
          className={`${styles.chevron} ${isOpen ? styles.rotate : ""}`}
        />
      </button>

      <div className={`${styles.dropdown} ${isOpen ? styles.open : ""}`}>
        <div className={styles.sectionTitle}>Model</div>
        <div className={styles.modelList}>
          {orderedModels.map((model) => (
            <button
              key={model.id}
              className={`${styles.modelItem} ${
                model.id === currentModel ? styles.activeModel : ""
              }`}
              onClick={() => handleModelSelect(model.id)}
            >
              <div className={styles.modelInfo}>
                <span className={styles.modelName}>{model.name}</span>
              </div>
              {model.id === currentModel && (
                <Check size={14} className={styles.checkIcon} />
              )}
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        <div className={styles.actions}>
          {ocrEnabled ? (
            <div
              className={styles.ocrWrapper}
              onMouseEnter={handleOcrMouseEnter}
              onMouseLeave={handleOcrMouseLeave}
            >
              <button
                className={`${styles.actionButton} ${styles.extraButton}`}
              >
                <ChevronLeft size={14} />
                <span>OCR Model</span>
              </button>
              <div
                className={`${styles.sideDropdown} ${showOcrMenu ? styles.visible : ""}`}
              >
                <div className={styles.sectionTitle}>OCR Model</div>
                <div className={styles.ocrModelList}>
                  {ocrModels.map((model) => (
                    <button
                      key={model.id}
                      className={`${styles.modelItem} ${
                        model.id === currentOcrModel ? styles.activeModel : ""
                      }`}
                      onClick={() => handleOCRModelSelect(model.id)}
                    >
                      <div className={styles.modelInfo}>
                        <span className={styles.modelName}>{model.name}</span>
                      </div>
                      {model.id === currentOcrModel && (
                        <Check size={14} className={styles.checkIcon} />
                      )}
                    </button>
                  ))}
                </div>
                <div className={styles.divider} />
                <div className={styles.actions}>
                  <button
                    className={styles.actionButton}
                    onClick={() => {
                      onOpenSettings("models");
                      setIsOpen(false);
                      setShowOcrMenu(false);
                    }}
                  >
                    <PackagePlus size={18} />
                    <span>Get more models</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              className={`${styles.actionButton} ${styles.extraButton} ${styles.disabled}`}
              disabled
            >
              <ChevronLeft size={14} />
              <span>OCR Model</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
