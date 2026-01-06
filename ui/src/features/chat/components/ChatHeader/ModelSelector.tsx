/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { MODELS } from "../../../../lib/config/models";
import styles from "./ChatHeader.module.css";

interface ModelSelectorProps {
  currentModel: string;
  onModelChange: (modelId: string) => void;
  isLoading: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  onModelChange,
  isLoading,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const orderedModels = [
    MODELS.find((m) => m.id === "gemini-2.5-pro"),
    MODELS.find((m) => m.id === "gemini-2.5-flash"),
    MODELS.find((m) => m.id === "gemini-flash-lite-latest"),
  ].filter((m): m is (typeof MODELS)[number] => !!m);
  const selectedModel = MODELS.find((m) => m.id === currentModel);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!next && buttonRef.current) {
        buttonRef.current.blur();
      }
      return next;
    });
  };

  return (
    <div className={styles.selectorContainer} ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        disabled={isLoading}
        className={styles.selectorButton}
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
          className={`${styles.chevron} ${isOpen ? styles.open : ""}`}
        />
      </button>

      {isOpen && (
        <div className={styles.dropdownMenu}>
          <ul className={styles.dropdownList}>
            {orderedModels.map((model) => (
              <li
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className={`${styles.dropdownItem} ${
                  model.id === currentModel ? styles.selected : ""
                }`}
              >
                <span>{model.name}</span>
                {model.id === currentModel && (
                  <Check size={16} className={styles.checkIcon} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
