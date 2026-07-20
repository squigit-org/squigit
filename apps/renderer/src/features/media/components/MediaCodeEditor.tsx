/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { CodeBlock } from "@/components/ui";
import { commands, platform } from "@/platform";
import styles from "./MediaCodeEditor.module.css";

const EDITOR_STYLE: React.CSSProperties = {
  height: "100%",
  maxHeight: "none",
};

interface MediaCodeEditorProps {
  filePath: string;
  fileName: string;
  threadId?: string;
  language: string;
  value: string;
  onValueChange: (value: string) => void;
  onSaved: () => void;
}

export const MediaCodeEditor: React.FC<MediaCodeEditorProps> = ({
  filePath,
  fileName,
  threadId,
  language,
  value,
  onValueChange,
  onSaved,
}) => {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setIsEditing(false);
    setIsSaving(false);
    setSaveError(null);
  }, [filePath]);

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
    setSaveError(null);
    setIsEditing(true);
  }, []);

  const saveToCas = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await platform.fs.writeTextFile(filePath, value);

      if (threadId) {
        try {
          await commands.registerAttachmentSource(
            threadId,
            filePath,
            filePath,
            fileName,
          );
        } catch (error) {
          console.warn(
            "[MediaCodeEditor] Could not pin the edited attachment to CAS:",
            error,
          );
        }
      }

      onSaved();
      setIsEditing(false);
    } catch (error) {
      console.error("[MediaCodeEditor] Failed to save CAS content:", error);
      setSaveError(
        error instanceof Error ? error.message : "Could not save this file.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [fileName, filePath, isSaving, onSaved, threadId, value]);

  const handleAction = useCallback(() => {
    if (isEditing) {
      void saveToCas();
      return;
    }
    beginEditing();
  }, [beginEditing, isEditing, saveToCas]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        isEditing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        void saveToCas();
      }
    },
    [isEditing, saveToCas],
  );

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
        actionTitle={isEditing ? "Save changes" : "Edit file"}
        actionIcon={isEditing ? <Save size={14} /> : <Pencil size={14} />}
        onAction={handleAction}
        actionDisabled={isSaving}
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
};
