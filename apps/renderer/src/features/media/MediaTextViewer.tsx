/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { forwardRef } from "react";
import {
  MediaCodeEditor,
  type MediaCodeEditorHandle,
} from "./components/MediaCodeEditor";
import styles from "./MediaTextViewer.module.css";

interface MediaTextViewerProps {
  filePath: string;
  extension: string;
  textContent: string;
  canEdit: boolean;
  onTextContentChange: (value: string) => void;
  onSaved: (casPath: string) => void;
}

export type MediaTextViewerHandle = MediaCodeEditorHandle;

export const MediaTextViewer = forwardRef<
  MediaTextViewerHandle,
  MediaTextViewerProps
>(
  (
    {
      filePath,
      extension,
      textContent,
      canEdit,
      onTextContentChange,
      onSaved,
    },
    ref,
  ) => (
    <div className={styles.textViewerWrap}>
      <MediaCodeEditor
        ref={ref}
        filePath={filePath}
        language={extension || "text"}
        value={textContent}
        canEdit={canEdit}
        onValueChange={onTextContentChange}
        onSaved={onSaved}
      />
    </div>
  ),
);

MediaTextViewer.displayName = "MediaTextViewer";
