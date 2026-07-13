/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { PackagePlus } from "lucide-react";
import {
  Dropdown,
  DropdownAction,
  DropdownDivider,
  DropdownItem,
  DropdownSectionTitle,
} from "@/components/ui";
import { SettingsSection } from "@/features/settings";
import { getLanguageCode } from "../ocr-models.types";
import { useModelsStore } from "../ocr-models.store";
import styles from "./OCRModelSwitcher.module.css";

interface OCRModelSwitcherProps {
  currentOcrModel: string;
  onOcrModelChange: (model: string) => void;
  onOpenSettings: (section: SettingsSection) => void;
  disabled?: boolean;
}

export const OCRModelSwitcher: React.FC<OCRModelSwitcherProps> = ({
  currentOcrModel,
  onOcrModelChange,
  onOpenSettings,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const models = useModelsStore((s) => s.models);
  const installedModels = models.filter((m) => m.state === "downloaded");

  const isCurrentModelValid = installedModels.some(
    (m) => m.id === currentOcrModel,
  );
  const effectiveModel = !currentOcrModel
    ? ""
    : isCurrentModelValid
      ? currentOcrModel
      : "";

  return (
    <Dropdown
      className={styles.modelSwitcher}
      label={effectiveModel ? getLanguageCode(effectiveModel) : "Select Model"}
      width={220}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
      title="Select OCR Model"
      chevronSize={14}
      offset={18}
      portal
      zIndex={9999}
      triggerLabelClassName={styles.triggerLabel}
    >
      <DropdownSectionTitle>OCR Model</DropdownSectionTitle>
      <div className={styles.modelList}>
        {installedModels.map((model) => (
          <DropdownItem
            key={model.id}
            className={styles.modelItem}
            isActive={model.id === effectiveModel}
            label={
              <div className={styles.modelInfo}>
                <span className={styles.modelName}>{model.name}</span>
              </div>
            }
            onClick={() => {
              onOcrModelChange(model.id);
              setIsOpen(false);
            }}
          />
        ))}
      </div>

      <DropdownDivider />

      <DropdownAction
        icon={<PackagePlus size={16} />}
        onClick={() => {
          onOpenSettings("models");
          setIsOpen(false);
        }}
      >
        Get more models
      </DropdownAction>
    </Dropdown>
  );
};
