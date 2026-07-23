/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useTextContextMenu } from "@/hooks/editor";
import { platform } from "@/platform";
import {
  attachmentFromPath,
  buildAttachmentMention,
  getExtension,
  isAcceptedExtension,
  isImageExtension,
} from "@squigit/core/brain/attachments";
import { TextContextMenu } from "@/app/layout/menus/TextContextMenu";
import { InputTextarea, type ThreadInputEditorHandle } from "./InputTextarea";
import { InputActions } from "./InputActions";
import { ImageStrip } from "./ImageStrip";
import { CodeEditor } from "./CodeEditor";
import type { ThreadInputProps } from "./thread-input.types";
import styles from "./ThreadInput.module.css";

export const ThreadInput: React.FC<ThreadInputProps> = React.memo(
  ({
    startupImage,
    forceVisible = false,
    isNavigating = false,
    input: value,
    onInputChange: onChange,
    onSend,
    isLoading,
    isSubmittingAttachments = false,
    isAiTyping = false,
    isStoppable = false,
    onStopGeneration,
    placeholder: customPlaceholder,
    variant = "default",
    selectedModel,
    selectedEffort,
    onModelChange,
    onEffortChange,
    attachments,
    onAttachmentsChange,
    onRemoveAttachment,
    onRetryAttachment,
    onCaptureToInput,
    onPreviewAttachment,
    showScrollToBottomButton = false,
    keepScrollToBottomButtonMounted = false,
    scrollToBottomButtonRef,
    onScrollToBottom,
  }) => {
    if (!startupImage && !forceVisible && !isNavigating) return null;

    const placeholder = customPlaceholder || "Ask anything";
    const disabled =
      (isLoading && !isAiTyping) || isSubmittingAttachments;
    const hasUnreadyAttachment = attachments.some(
      (attachment) =>
        attachment.status === "pending" || attachment.status === "failed",
    );

    const [isExpanded, setIsExpanded] = useState(false);
    const [isCodeEditorOpen, setIsCodeEditorOpen] = useState(false);
    const [codeEditorValue, setCodeEditorValue] = useState("");
    const [codeEditorLanguage, setCodeEditorLanguage] = useState("text");
    const [hasSelection, setHasSelection] = useState(false);
    const editorRef = useRef<ThreadInputEditorHandle | null>(null);

    const handleSubmit = () => {
      if (
        !disabled &&
        !isLoading &&
        !hasUnreadyAttachment &&
        (value.trim().length > 0 || attachments.length > 0)
      ) {
        editorRef.current?.resetScroll();
        onSend();
      }
    };

    const {
      data: contextMenuData,
      handleContextMenu,
      handleClose: handleCloseContextMenu,
    } = useTextContextMenu({ hasSelection });

    const isButtonActive =
      !disabled &&
      !isLoading &&
      !hasUnreadyAttachment &&
      (value.trim().length > 0 || attachments.length > 0);
    const shouldRenderScrollToBottomButton =
      !!onScrollToBottom &&
      (showScrollToBottomButton || keepScrollToBottomButtonMounted);

    const containerRef = useRef<HTMLDivElement>(null);
    const latestValueRef = useRef(value);
    const latestAttachmentsRef = useRef(attachments);

    useEffect(() => {
      latestValueRef.current = value;
    }, [value]);

    useEffect(() => {
      latestAttachmentsRef.current = attachments;
    }, [attachments]);

    const appendTextToInput = useCallback(
      (textToAppend: string) => {
        if (!textToAppend) return;

        const nextEditor = editorRef.current;
        if (nextEditor) {
          nextEditor.appendRawText(textToAppend);
          return;
        }

        onChange(latestValueRef.current + textToAppend);
      },
      [onChange],
    );

    const appendCodeBlockToInput = useCallback(
      (language: string, code: string) => {
        const normalizedLanguage = language.trim() || "text";
        const normalizedCode = code
          .replace(/\r\n?/g, "\n")
          .replace(/\n+$/u, "");
        const currentValue = latestValueRef.current;
        const prefix =
          currentValue.length > 0 && !currentValue.endsWith("\n") ? "\n" : "";
        appendTextToInput(
          `${prefix}\`\`\`${normalizedLanguage}\n${normalizedCode}\n\`\`\`\n`,
        );
      },
      [appendTextToInput],
    );

    const insertTextAtCaret = useCallback(
      (textToInsert: string) => {
        if (!textToInsert) return;

        const nextEditor = editorRef.current;
        if (!nextEditor) {
          onChange(latestValueRef.current + textToInsert);
          return;
        }

        nextEditor.insertRawText(textToInsert);
      },
      [onChange],
    );

    const insertInlineFileLinks = useCallback(
      (links: string[]) => {
        if (links.length === 0) return;

        insertTextAtCaret(`${links.join(" ")} `);
      },
      [insertTextAtCaret],
    );

    const handleFilePaths = useCallback(
      async (paths: string[]) => {
        const currentAttachments = latestAttachmentsRef.current;
        const immediateAttachments: typeof currentAttachments = [];
        const immediateLinks: string[] = [];
        const unknownPaths: Array<{
          path: string;
          name: string;
        }> = [];

        for (const filePath of paths) {
          const originalName = filePath.split(/[/\\]/).pop() || filePath;
          const extension = getExtension(originalName);
          if (!isAcceptedExtension(extension)) {
            unknownPaths.push({ path: filePath, name: originalName });
            continue;
          }

          const attachment = attachmentFromPath(
            filePath,
            undefined,
            originalName,
            filePath,
          );
          immediateAttachments.push(attachment);
          if (!isImageExtension(attachment.extension)) {
            immediateLinks.push(
              buildAttachmentMention(filePath, originalName),
            );
          }
        }

        if (immediateAttachments.length > 0) {
          onAttachmentsChange([
            ...currentAttachments,
            ...immediateAttachments,
          ]);
        }
        if (immediateLinks.length > 0) {
          insertInlineFileLinks(immediateLinks);
        }

        const validatedAttachments: typeof currentAttachments = [];
        const validatedLinks: string[] = [];
        for (const candidate of unknownPaths) {
          try {
            const isText = await platform.invoke<boolean>(
              "validate_text_file",
              { path: candidate.path },
            );
            if (!isText) {
              console.warn(
                "Selected file is binary and not supported:",
                candidate.path,
              );
              continue;
            }
            validatedAttachments.push(
              attachmentFromPath(
                candidate.path,
                undefined,
                candidate.name,
                candidate.path,
              ),
            );
            validatedLinks.push(
              buildAttachmentMention(candidate.path, candidate.name),
            );
          } catch (error) {
            console.error("Failed to validate selected text file:", error);
          }
        }

        if (validatedAttachments.length > 0) {
          onAttachmentsChange([
            ...latestAttachmentsRef.current,
            ...validatedAttachments,
          ]);
        }
        if (validatedLinks.length > 0) {
          insertInlineFileLinks(validatedLinks);
        }
      },
      [insertInlineFileLinks, onAttachmentsChange],
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const paths = Array.from(files)
          .map((f) => platform.getPathForFile(f))
          .filter(Boolean);

        if (paths.length > 0) {
          await handleFilePaths(paths);
        }
      },
      [disabled, handleFilePaths],
    );

    const containerContent = (
      <div
        className={`${styles.container} ${disabled && !isStoppable ? styles.disabled : ""} ${
          variant === "transparent" ? styles.transparentVariant : ""
        }`}
        ref={containerRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ImageStrip
          attachments={attachments}
          onClick={onPreviewAttachment}
          onRemove={
            disabled
              ? undefined
              : (id) => {
                  if (onRemoveAttachment) {
                    onRemoveAttachment(id);
                    return;
                  }
                  onAttachmentsChange(
                    attachments.filter((a) => a.id !== id),
                  );
                }
          }
          onRetry={onRetryAttachment}
        />

        <InputTextarea
          ref={editorRef}
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          disabled={disabled}
          placeholder={placeholder}
          onSelectionChange={setHasSelection}
          onContextMenu={handleContextMenu}
          onImagePasted={(path) => {
            onAttachmentsChange([
              ...latestAttachmentsRef.current,
              attachmentFromPath(path),
            ]);
          }}
          attachments={attachments}
          onRetryAttachment={onRetryAttachment}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
        />
        {contextMenuData.isOpen && (
          <TextContextMenu
            x={contextMenuData.x}
            y={contextMenuData.y}
            onClose={handleCloseContextMenu}
            onCopy={() => {
              void editorRef.current?.copySelection();
            }}
            onCut={() => {
              void editorRef.current?.cutSelection();
            }}
            onPaste={() => {
              void editorRef.current?.pasteFromClipboard();
            }}
            onSelectAll={() => editorRef.current?.selectAll()}
            onUndo={() => editorRef.current?.undo()}
            onRedo={() => editorRef.current?.redo()}
            hasSelection={contextMenuData.hasSelection}
          />
        )}

        <InputActions
          onSubmit={handleSubmit}
          onStop={() => onStopGeneration?.()}
          isButtonActive={isButtonActive}
          isAiTyping={isAiTyping}
          isStoppable={isStoppable}
          disabled={disabled}
          isSubmitting={isSubmittingAttachments}
          selectedModel={selectedModel}
          selectedEffort={selectedEffort}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          onTranscript={(text, isFinal) => {
            if (isFinal) {
              const normalizedText = text.trim();
              if (!normalizedText) {
                return;
              }

              const currentValue = latestValueRef.current;
              const prefix =
                currentValue.length > 0 && !/\s$/u.test(currentValue)
                  ? " "
                  : "";
              appendTextToInput(`${prefix}${normalizedText}`);
            }
          }}
          onCaptureToInput={onCaptureToInput}
          onFilePaths={async (paths: string[]) => {
            await handleFilePaths(paths);
          }}
          onOpenCodeEditor={() => setIsCodeEditorOpen(true)}
        />
      </div>
    );

    const codeEditorOverlay = (
      <CodeEditor
        isOpen={isCodeEditorOpen}
        onClose={() => setIsCodeEditorOpen(false)}
        value={codeEditorValue}
        language={codeEditorLanguage}
        onValueChange={setCodeEditorValue}
        onLanguageChange={setCodeEditorLanguage}
        onInsert={(language, code) => {
          appendCodeBlockToInput(language, code);
          setIsCodeEditorOpen(false);
        }}
      />
    );

    if (variant === "transparent") {
      return (
        <>
          {containerContent}
          {codeEditorOverlay}
        </>
      );
    }

    return (
      <>
        <footer className={styles.footer}>
          <div className={styles.inputWrapper}>
            {shouldRenderScrollToBottomButton && (
              <button
                type="button"
                ref={scrollToBottomButtonRef}
                className={`${styles.iconButton} ${styles.scrollToBottomButton} ${
                  !showScrollToBottomButton
                    ? styles.scrollToBottomButtonHidden
                    : ""
                }`}
                onClick={onScrollToBottom}
                aria-label="Scroll to bottom"
                aria-hidden={!showScrollToBottomButton}
                tabIndex={showScrollToBottomButton ? 0 : -1}
              >
                <ArrowDown size={14} />
              </button>
            )}
            {containerContent}
          </div>
        </footer>
        {codeEditorOverlay}
      </>
    );
  },
);

ThreadInput.displayName = "ThreadInput";

export default ThreadInput;
