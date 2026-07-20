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
  attachmentPath: string;
  fileName: string;
  threadId?: string;
  extension: string;
  textContent: string;
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
      attachmentPath,
      fileName,
      threadId,
      extension,
      textContent,
      onTextContentChange,
      onSaved,
    },
    ref,
  ) => (
    <div className={styles.textViewerWrap}>
      <MediaCodeEditor
        ref={ref}
        filePath={filePath}
        attachmentPath={attachmentPath}
        fileName={fileName}
        threadId={threadId}
        language={extension || "text"}
        value={textContent}
        onValueChange={onTextContentChange}
        onSaved={onSaved}
      />
    </div>
  ),
);

MediaTextViewer.displayName = "MediaTextViewer";
