/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef, useState } from "react";
import { useTextEditor, useTextContextMenu } from "@/hooks";
import { TextContextMenu } from "@/shell";
import { invoke } from "@tauri-apps/api/core";
import {
  AttachmentStrip,
  isImageExtension,
  getExtension,
  attachmentFromPath,
  ACCEPTED_EXTENSIONS,
} from "../AttachmentStrip";
import { InputTextarea } from "./InputTextarea";
import { InputCodeEditor, useCodeEditor } from "./InputCodeEditor";
import { InputActions } from "./InputActions";
import type { ChatInputProps } from "./types";
import styles from "./ChatInput.module.css";

export const ChatInput: React.FC<ChatInputProps> = ({
  startupImage,
  input: value,
  onInputChange: onChange,
  onSend,
  isLoading,
  isAiTyping = false,
  isStoppable = false,
  onStopGeneration,
  placeholder: customPlaceholder,
  variant = "default",
  selectedModel,
  onModelChange,
  attachments,
  onAttachmentsChange,
  onCaptureToInput,
}) => {
  if (!startupImage) return null;

  const placeholder = customPlaceholder || "Ask anything";
  const disabled = isLoading && !isAiTyping;

  const [isExpanded, setIsExpanded] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shadowRef = useRef<HTMLTextAreaElement>(null);
  const codeTaRef = useRef<HTMLTextAreaElement>(null);

  const {
    isCodeBlockActive,
    codeLanguage,
    codeValue,
    setCodeValue,
    handleChange,
    handleCodeKeyDown,
    resetCodeEditor,
  } = useCodeEditor({
    value,
    onChange,
    textareaRef,
  });

  const handleSubmit = () => {
    if (
      !disabled &&
      !isLoading &&
      (value.trim().length > 0 ||
        codeValue.trim().length > 0 ||
        attachments.length > 0)
    ) {
      onSend();
      resetCodeEditor();
    }
  };

  const {
    ref: editorRef,
    handleKeyDown: editorKeyDown,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    undo,
    redo,
  } = useTextEditor({
    value,
    onChange: (newValue) => {
      onChange(newValue);
    },
    onSubmit: handleSubmit,
    preventNewLine: false,
  });

  useLayoutEffect(() => {
    if (editorRef.current) {
      // @ts-ignore
      textareaRef.current = editorRef.current;
    }
  }, [editorRef.current]);

  const {
    data: contextMenuData,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu();

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept Ctrl+V for images
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      try {
        const result = await invoke<{ hash: string; path: string }>(
          "read_clipboard_image",
        );
        if (result && result.path) {
          onAttachmentsChange([
            ...attachments,
            attachmentFromPath(result.path),
          ]);
        }
      } catch (err) {
        // Not an image or clipboard error, allow default paste behavior
      }
    }
    editorKeyDown(e);
  };

  const isButtonActive =
    !disabled &&
    !isLoading &&
    (value.trim().length > 0 ||
      codeValue.trim().length > 0 ||
      attachments.length > 0);

  const containerContent = (
    <div
      className={`${styles.container} ${disabled && !isStoppable ? styles.disabled : ""} ${
        variant === "transparent" ? styles.transparentVariant : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={async (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        let newAttachments = [...attachments];

        for (const file of files) {
          try {
            // @ts-expect-error Tauri attaches .path to dropped files
            const path = file.path;
            if (path) {
              const ext = getExtension(path);
              const isAllowed = ACCEPTED_EXTENSIONS.includes(ext);

              if (isAllowed) {
                if (isImageExtension(ext)) {
                  const result = await invoke<{ hash: string; path: string }>(
                    "store_image_from_path",
                    { path },
                  );
                  newAttachments.push(attachmentFromPath(result.path));
                } else {
                  newAttachments.push(attachmentFromPath(path));
                }
              }
            }
          } catch (err) {
            console.error("Failed to process dropped file:", err);
          }
        }

        if (newAttachments.length !== attachments.length) {
          onAttachmentsChange(newAttachments);
        }
      }}
    >
      <AttachmentStrip
        attachments={attachments}
        onRemove={(id) =>
          onAttachmentsChange(attachments.filter((a) => a.id !== id))
        }
      />

      <InputTextarea
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        isCodeBlockActive={isCodeBlockActive}
        placeholder={placeholder}
        editorRef={editorRef}
        shadowRef={shadowRef}
        textareaRef={textareaRef}
        onContextMenu={handleContextMenu}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      {contextMenuData.isOpen && !isCodeBlockActive && (
        <TextContextMenu
          x={contextMenuData.x}
          y={contextMenuData.y}
          onClose={handleCloseContextMenu}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onUndo={undo}
          onRedo={redo}
          hasSelection={hasSelection}
        />
      )}

      <InputCodeEditor
        isCodeBlockActive={isCodeBlockActive}
        codeLanguage={codeLanguage}
        codeValue={codeValue}
        onCodeValueChange={setCodeValue}
        onCodeKeyDown={handleCodeKeyDown}
        isExpanded={isExpanded}
        codeTaRef={codeTaRef}
      />

      <InputActions
        onSubmit={handleSubmit}
        onStop={onStopGeneration}
        isButtonActive={isButtonActive}
        isAiTyping={isAiTyping}
        isStoppable={isStoppable}
        disabled={disabled}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        onTranscript={(text, isFinal) => {
          if (isFinal) {
            onChange((value + " " + text).trim());
          }
        }}
        onCaptureToInput={onCaptureToInput}
        onFileSelect={async (file: File) => {
          // @ts-expect-error Tauri paths
          const path = file.path;
          if (path) {
            const ext = getExtension(path);
            if (isImageExtension(ext)) {
              try {
                const result = await invoke<{ hash: string; path: string }>(
                  "store_image_from_path",
                  { path },
                );
                onAttachmentsChange([
                  ...attachments,
                  attachmentFromPath(result.path),
                ]);
              } catch (err) {
                console.error("Failed to store image:", err);
              }
            } else {
              onAttachmentsChange([...attachments, attachmentFromPath(path)]);
            }
          }
        }}
      />
    </div>
  );

  if (variant === "transparent") {
    return containerContent;
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.inputWrapper}>{containerContent}</div>
    </footer>
  );
};

export default ChatInput;
