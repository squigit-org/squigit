/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Loader2, Pencil, Save } from "lucide-react";
import { CodeBlock } from "@/components/ui";
import { commands } from "@/platform";
import styles from "./MediaCodeEditor.module.css";

const EDITOR_STYLE: React.CSSProperties = {
  height: "100%",
  maxHeight: "none",
};

export interface MediaCodeEditorHandle {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<boolean>;
  reset: () => void;
}

interface MediaCodeEditorProps {
  filePath: string;
  attachmentPath: string;
  fileName: string;
  threadId?: string;
  language: string;
  value: string;
  canEdit: boolean;
  onValueChange: (value: string) => void;
  onSaved: (casPath: string) => void;
}

export const MediaCodeEditor = forwardRef<
  MediaCodeEditorHandle,
  MediaCodeEditorProps
>(
  (
    {
      filePath,
      attachmentPath,
      fileName,
      threadId,
      language,
      value,
      canEdit,
      onValueChange,
      onSaved,
    },
    forwardedRef,
  ) => {
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savedValue, setSavedValue] = useState(value);
    const [saveError, setSaveError] = useState<string | null>(null);
    const isDirty = value !== savedValue;

    useEffect(() => {
      setIsEditing(false);
      setIsSaving(false);
      setSavedValue(value);
      setSaveError(null);
    }, [filePath]);

    useEffect(() => {
      if (!isEditing) setSavedValue(value);
    }, [isEditing, value]);

    useEffect(() => {
      if (!isEditing) return;

      const focusTimer = window.setTimeout(() => {
        const textarea = editorRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }, 0);

      return () => window.clearTimeout(focusTimer);
    }, [isEditing]);

    const beginEditing = useCallback(() => {
      if (!canEdit) return;
      setSaveError(null);
      setIsEditing(true);
    }, [canEdit]);

    const saveToCas = useCallback(async (): Promise<boolean> => {
      if (isSaving) return false;
      if (value === savedValue) return true;

      setIsSaving(true);
      setSaveError(null);
      try {
        const stored = await commands.storeTextInCas(value, language || "txt");

        if (threadId) {
          await commands.reviseAttachmentCasPath(
            threadId,
            attachmentPath,
            stored.path,
            fileName,
          );
        }

        setSavedValue(value);
        onSaved(stored.path);
        setIsEditing(false);
        return true;
      } catch (error) {
        console.error("[MediaCodeEditor] Failed to save CAS content:", error);
        setSaveError(
          error instanceof Error ? error.message : "Could not save this file.",
        );
        return false;
      } finally {
        setIsSaving(false);
      }
    }, [
      attachmentPath,
      fileName,
      isSaving,
      language,
      onSaved,
      savedValue,
      threadId,
      value,
    ]);

    const reset = useCallback(() => {
      if (value !== savedValue) onValueChange(savedValue);
      setIsEditing(false);
      setIsSaving(false);
      setSaveError(null);
    }, [onValueChange, savedValue, value]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        hasUnsavedChanges: () => isDirty,
        save: saveToCas,
        reset,
      }),
      [isDirty, reset, saveToCas],
    );

    const handleAction = useCallback(() => {
      if (isEditing) {
        if (isDirty) void saveToCas();
        return;
      }
      beginEditing();
    }, [beginEditing, isDirty, isEditing, saveToCas]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (
          isEditing &&
          isDirty &&
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          void saveToCas();
        }
      },
      [isDirty, isEditing, saveToCas],
    );

    const isActionDisabled = !canEdit || (isEditing && (!isDirty || isSaving));

    return (
      <div className={styles.root}>
        <CodeBlock
          ref={editorRef}
          language={language || "text"}
          value={value}
          isEditor
          readOnly={!isEditing}
          onChange={isEditing ? onValueChange : undefined}
          onKeyDown={handleKeyDown}
          actionLabel={isEditing ? "save" : "edit"}
          actionTitle={
            isEditing
              ? isDirty
                ? "Save changes"
                : "No changes to save"
              : canEdit
                ? "Edit file"
                : "Sent attachments cannot be edited"
          }
          actionIcon={
            isSaving ? (
              <Loader2 size={14} className={styles.spinner} />
            ) : isEditing ? (
              <Save size={14} />
            ) : (
              <Pencil size={14} />
            )
          }
          onAction={handleAction}
          actionDisabled={isActionDisabled}
          fillHeight
          style={EDITOR_STYLE}
        />
        {saveError && (
          <div className={styles.saveError} role="alert">
            {saveError}
          </div>
        )}
      </div>
    );
  },
);

MediaCodeEditor.displayName = "MediaCodeEditor";
