/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { useTextEditor, useTextContextMenu } from "@/hooks";
import { TextContextMenu } from "@/layout";
import { useAppContext } from "@/providers/AppProvider";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  attachmentFromPath,
  buildAttachmentMention,
  getExtension,
  isAcceptedExtension,
  isImageExtension,
} from "@/lib";
import { InputTextarea } from "./InputTextarea";
import { InputCodeEditor, useCodeEditor } from "./InputCodeEditor";
import { InputActions } from "./InputActions";
import { ImageStrip } from "./ImageStrip";
import type { ChatInputProps } from "./chat-input.types";
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
  const app = useAppContext();
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
    commitCodeBlockToTextarea,
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
            ...latestAttachmentsRef.current,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const pendingInlineInsertRef = useRef<string | null>(null);
  const latestValueRef = useRef(value);
  const latestAttachmentsRef = useRef(attachments);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    latestAttachmentsRef.current = attachments;
  }, [attachments]);

  const insertTextAtCaret = React.useCallback(
    (textToInsert: string) => {
      if (!textToInsert) return;

      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(latestValueRef.current + textToInsert);
        return;
      }

      const currentValue = latestValueRef.current;
      const start = textarea.selectionStart ?? currentValue.length;
      const end = textarea.selectionEnd ?? start;
      const nextValue =
        currentValue.slice(0, start) +
        textToInsert +
        currentValue.slice(end);
      const cursorPos = start + textToInsert.length;

      onChange(nextValue);
      window.setTimeout(() => {
        const nextTextarea = textareaRef.current;
        if (!nextTextarea) return;
        nextTextarea.focus();
        nextTextarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [onChange],
  );

  const insertInlineFileLinks = React.useCallback(
    (links: string[]) => {
      if (links.length === 0) return;

      const textToInsert = `${links.join(" ")} `;
      if (isCodeBlockActive) {
        pendingInlineInsertRef.current = textToInsert;
        commitCodeBlockToTextarea();
        return;
      }

      insertTextAtCaret(textToInsert);
    },
    [commitCodeBlockToTextarea, insertTextAtCaret, isCodeBlockActive],
  );

  useEffect(() => {
    if (!pendingInlineInsertRef.current || isCodeBlockActive) {
      return;
    }

    const textToInsert = pendingInlineInsertRef.current;
    pendingInlineInsertRef.current = null;
    window.setTimeout(() => {
      insertTextAtCaret(textToInsert);
    }, 0);
  }, [insertTextAtCaret, isCodeBlockActive, value]);

  const handleFilePaths = React.useCallback(
    async (paths: string[]) => {
      const currentAttachments = latestAttachmentsRef.current;
      const nextAttachments = [...currentAttachments];
      const inlineLinks: string[] = [];

      for (const filePath of paths) {
        const originalName = filePath.split(/[/\\]/).pop() || filePath;
        const ext = getExtension(filePath);
        const isAllowed = isAcceptedExtension(ext);

        if (isImageExtension(ext)) {
          try {
            const result = await invoke<{ hash: string; path: string }>(
              "store_image_from_path",
              { path: filePath },
            );
            app.rememberAttachmentSourcePath(result.path, filePath);
            nextAttachments.push(
              attachmentFromPath(
                result.path,
                undefined,
                originalName,
                filePath,
              ),
            );
          } catch (err) {
            console.error("Failed to store image:", err);
          }
          continue;
        }

        if (isAllowed) {
          try {
            const result = await invoke<{ hash: string; path: string }>(
              "store_file_from_path",
              { path: filePath },
            );
            app.rememberAttachmentSourcePath(result.path, filePath);
            inlineLinks.push(buildAttachmentMention(result.path, originalName));
          } catch (err) {
            console.error("Failed to store file:", err);
          }
          continue;
        }

        try {
          const isText = await invoke<boolean>("validate_text_file", {
            path: filePath,
          });
          if (!isText) {
            console.warn("Selected file is binary and not supported:", filePath);
            continue;
          }

          const result = await invoke<{ hash: string; path: string }>(
            "store_file_from_path",
            { path: filePath },
          );
          app.rememberAttachmentSourcePath(result.path, filePath);
          inlineLinks.push(buildAttachmentMention(result.path, originalName));
        } catch (err) {
          console.error("Failed to validate selected text file:", err);
        }
      }

      if (nextAttachments.length > currentAttachments.length) {
        onAttachmentsChange(nextAttachments);
      }
      if (inlineLinks.length > 0) {
        insertInlineFileLinks(inlineLinks);
      }
    },
    [
      app,
      insertInlineFileLinks,
      onAttachmentsChange,
    ],
  );

  useEffect(() => {
    const unlistenDrop = listen<{ paths: string[] }>(
      "tauri://drag-drop",
      async (event) => {
        const paths = Array.from(event.payload.paths || []);
        if (paths.length === 0) return;
        await handleFilePaths(paths);
      },
    );

    return () => {
      unlistenDrop.then((fn) => fn());
    };
  }, [handleFilePaths]);

  const containerContent = (
    <div
      className={`${styles.container} ${disabled && !isStoppable ? styles.disabled : ""} ${
        variant === "transparent" ? styles.transparentVariant : ""
      }`}
      ref={containerRef}
    >
      <ImageStrip
        attachments={attachments}
        onClick={app.openMediaViewer}
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
          onPaste={async () => {
            try {
              const result = await invoke<{ hash: string; path: string }>(
                "read_clipboard_image",
              );
              if (result && result.path) {
                onAttachmentsChange([
                  ...latestAttachmentsRef.current,
                  attachmentFromPath(result.path),
                ]);
                return;
              }
            } catch (err) {
              // Not an image, fall through to text paste
            }
            handlePaste();
          }}
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
        onStop={() => onStopGeneration?.()}
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
        onFilePaths={async (paths: string[]) => {
          await handleFilePaths(paths);
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
