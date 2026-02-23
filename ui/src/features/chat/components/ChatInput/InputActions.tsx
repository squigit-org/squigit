/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from "react";
import { Paperclip, ArrowUp, Square, Camera } from "lucide-react";
import { MODELS } from "@/lib/config";
import { Tooltip } from "@/primitives/tooltip/Tooltip";
import {
  Dropdown,
  DropdownItem,
  DropdownSectionTitle,
} from "@/primitives/dropdown";
import { VoiceButton } from "./VoiceButton";
import styles from "./ChatInput.module.css";

const GEMINI_MODELS = MODELS.map((m) => ({
  id: m.id,
  label: m.name,
  triggerLabel: m.name.replace("Gemini ", ""),
}));

import { ACCEPTED_EXTENSIONS } from "../AttachmentStrip";

interface InputActionsProps {
  onSubmit: () => void;
  onStop?: () => void;
  isButtonActive: boolean;
  isAiTyping: boolean;
  isStoppable: boolean;
  disabled: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onCaptureToInput?: () => void;
  onFileSelect?: (file: File) => void;
}

export const InputActions: React.FC<InputActionsProps> = ({
  onSubmit,
  onStop,
  isButtonActive,
  isAiTyping,
  isStoppable,
  disabled,
  selectedModel,
  onModelChange,
  onTranscript,
  onCaptureToInput,
  onFileSelect,
}) => {
  const [showFileButtonTooltip, setShowFileButtonTooltip] = useState(false);
  const [showKeepProgressTooltip, setShowKeepProgressTooltip] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const keepProgressInfoRef = useRef<HTMLButtonElement>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);

  const handlePaperclipClick = () => {
    hiddenFileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect?.(e.target.files[0]);
    }
    e.target.value = "";
  };

  const handleModelSelect = useCallback(
    (id: string) => {
      onModelChange(id);
      setAiMenuOpen(false);
    },
    [onModelChange],
  );

  const selectedModelLabel =
    GEMINI_MODELS.find((m) => m.id === selectedModel)?.triggerLabel || "Auto";

  return (
    <div className={styles.actions}>
      <input
        type="file"
        ref={hiddenFileInputRef}
        style={{ display: "none" }}
        accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        onChange={handleFileChange}
      />
      <div className={styles.leftActions}>
        <button
          className={styles.iconButton}
          aria-label="Attach file"
          ref={fileButtonRef}
          onMouseEnter={() => setShowFileButtonTooltip(true)}
          onMouseLeave={() => setShowFileButtonTooltip(false)}
          onClick={handlePaperclipClick}
        >
          <Paperclip size={18} />
        </button>
        <Tooltip
          text="Add photos & files"
          parentRef={fileButtonRef}
          show={showFileButtonTooltip}
          above
        />

        <div className={styles.keepProgressGroup}>
          <button
            className={styles.toggleItem}
            aria-label="Keep Progress"
            ref={keepProgressInfoRef}
            onMouseEnter={() => setShowKeepProgressTooltip(true)}
            onMouseLeave={() => setShowKeepProgressTooltip(false)}
            onClick={onCaptureToInput}
          >
            <Camera size={16} />
            <span>Keep Progress</span>
          </button>
          <Tooltip
            text="Bring your screen directly to the chat"
            parentRef={keepProgressInfoRef}
            show={showKeepProgressTooltip}
            above
          />
        </div>

        <Dropdown
          label={selectedModelLabel}
          direction="up"
          isOpen={aiMenuOpen}
          onOpenChange={setAiMenuOpen}
          width={180}
          align="left"
        >
          <DropdownSectionTitle>Model</DropdownSectionTitle>
          {GEMINI_MODELS.map((model) => (
            <div
              key={model.id}
              style={{
                marginTop: "2px",
              }}
            >
              <DropdownItem
                label={model.label}
                isActive={model.id === selectedModel}
                onClick={() => handleModelSelect(model.id)}
              />
            </div>
          ))}
        </Dropdown>
      </div>

      <div className={styles.rightActions}>
        <VoiceButton onTranscript={onTranscript} disabled={disabled} />

        {isAiTyping || isStoppable ? (
          <button
            className={styles.stopButton}
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className={`${styles.submitButton} ${isButtonActive ? styles.submitActive : ""}`}
            onClick={onSubmit}
            disabled={!isButtonActive}
            aria-label="Submit"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
};
