/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from "react";
import { Paperclip, ArrowUp, Square, Camera, Code2 } from "lucide-react";
import { platform } from "@/platform";
import { ACCEPTED_EXTENSIONS } from "@squigit/core/brain/attachments";
import { MODELS } from "@squigit/core/config";
import type { ModelEffort, ModelId } from "@squigit/core/config";
import {
  Dropdown,
  DropdownItem,
  Tooltip,
} from "@/components/ui";
import { VoiceButton } from "./VoiceButton";
import {
  EffortMenu,
  formatEffortLabel,
} from "@/features/settings/components/EffortMenu";
import styles from "./ThreadInput.module.css";

const getModelTriggerLabel = (name: string) => {
  const tokens = name.trim().split(/\s+/);
  return tokens.length > 1 ? tokens.slice(1).join(" ") : name;
};

const AI_MODELS = MODELS.map((m) => ({
  id: m.id,
  label: m.name,
  triggerLabel: getModelTriggerLabel(m.name),
}));

interface InputActionsProps {
  onSubmit: () => void;
  onStop?: () => void;
  isButtonActive: boolean;
  isAiTyping: boolean;
  isStoppable: boolean;
  disabled: boolean;
  selectedModel: ModelId;
  selectedEffort: ModelEffort;
  onModelChange: (model: ModelId) => void;
  onEffortChange: (effort: ModelEffort) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onCaptureToInput?: () => void;
  onFilePaths?: (paths: string[]) => void;
  onOpenCodeEditor?: () => void;
}

export const InputActions: React.FC<InputActionsProps> = ({
  onSubmit,
  onStop,
  isButtonActive,
  isAiTyping,
  isStoppable,
  disabled,
  selectedModel,
  selectedEffort,
  onModelChange,
  onEffortChange,
  onTranscript,
  onCaptureToInput,
  onFilePaths,
  onOpenCodeEditor,
}) => {
  const [showFileButtonTooltip, setShowFileButtonTooltip] = useState(false);
  const [showCodeButtonTooltip, setShowCodeButtonTooltip] = useState(false);
  const [showKeepProgressTooltip, setShowKeepProgressTooltip] = useState(false);
  const [showPrimaryActionTooltip, setShowPrimaryActionTooltip] =
    useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const codeButtonRef = useRef<HTMLButtonElement>(null);
  const keepProgressInfoRef = useRef<HTMLButtonElement>(null);
  const primaryActionRef = useRef<HTMLDivElement>(null);

  const handlePaperclipClick = async () => {
    try {
      const result = await platform.dialog.open({
        multiple: true,
        filters: [
          {
            name: "Supported Files",
            extensions: ACCEPTED_EXTENSIONS,
          },
          {
            name: "All Files",
            extensions: ["*"],
          },
        ],
      });
      if (result) {
        const paths = Array.isArray(result) ? result : [result];
        onFilePaths?.(paths);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleModelSelect = useCallback(
    (id: ModelId) => {
      onModelChange(id);
      setAiMenuOpen(false);
    },
    [onModelChange],
  );

  const selectedModelName =
    AI_MODELS.find((m) => m.id === selectedModel)?.triggerLabel || "Auto";
  const selectedModelLabel = `${selectedModelName} ${formatEffortLabel(
    selectedEffort,
  )}`;
  const isStopAction = isAiTyping || isStoppable;
  const primaryActionLabel = isStopAction
    ? "Stop"
    : isButtonActive
      ? "Send"
      : "Ask Anything";

  return (
    <div className={styles.actions}>
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

        <button
          className={styles.iconButton}
          aria-label="Write code"
          ref={codeButtonRef}
          onMouseEnter={() => setShowCodeButtonTooltip(true)}
          onMouseLeave={() => setShowCodeButtonTooltip(false)}
          onClick={onOpenCodeEditor}
        >
          <Code2 size={18} />
        </button>
        <Tooltip
          text="write code"
          parentRef={codeButtonRef}
          show={showCodeButtonTooltip}
          above
        />

        <div className={styles.keepProgressGroup}>
          <button
            className={styles.toggleItem}
            aria-label="Keep Progress"
            ref={keepProgressInfoRef}
            onMouseEnter={() => setShowKeepProgressTooltip(true)}
            onMouseLeave={() => setShowKeepProgressTooltip(false)}
            onClick={async () => {
              setShowKeepProgressTooltip(false);
              // Wait for the next macro task so React flushes the DOM updates and the tooltip disappears
              await new Promise((r) => setTimeout(r, 0));
              onCaptureToInput?.();
            }}
          >
            <Camera size={16} />
            <span>Keep Progress</span>
          </button>
          <Tooltip
            text="Bring your screen directly to the thread"
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
          {AI_MODELS.map((model) => (
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
          <EffortMenu
            effort={selectedEffort}
            onSelect={onEffortChange}
            placement="right-end"
          />
        </Dropdown>
      </div>

      <div className={styles.rightActions}>
        <VoiceButton onTranscript={onTranscript} disabled={disabled} />

        <div
          ref={primaryActionRef}
          className={styles.primaryAction}
          onMouseEnter={() => setShowPrimaryActionTooltip(true)}
          onMouseLeave={() => setShowPrimaryActionTooltip(false)}
        >
          {isStopAction ? (
            <button
              className={styles.stopButton}
              onClick={() => {
                setShowPrimaryActionTooltip(false);
                onStop?.();
              }}
              aria-label={primaryActionLabel}
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              className={`${styles.submitButton} ${isButtonActive ? styles.submitActive : ""}`}
              onClick={() => {
                setShowPrimaryActionTooltip(false);
                onSubmit();
              }}
              disabled={!isButtonActive}
              aria-label={primaryActionLabel}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
        <Tooltip
          text={primaryActionLabel}
          parentRef={primaryActionRef}
          show={showPrimaryActionTooltip}
          above
        />
      </div>
    </div>
  );
};
