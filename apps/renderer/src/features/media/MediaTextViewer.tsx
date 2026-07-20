/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { MediaCodeEditor } from "./components/MediaCodeEditor";
import styles from "./MediaTextViewer.module.css";

interface MediaTextViewerProps {
  filePath: string;
  fileName: string;
  threadId?: string;
  extension: string;
  textContent: string;
  onTextContentChange: (value: string) => void;
  onSaved: () => void;
}

export const MediaTextViewer: React.FC<MediaTextViewerProps> = ({
  filePath,
  fileName,
  threadId,
  extension,
  textContent,
  onTextContentChange,
  onSaved,
}) => {
  return (
    <div className={styles.textViewerWrap}>
      <MediaCodeEditor
        filePath={filePath}
        fileName={fileName}
        threadId={threadId}
        language={extension || "text"}
        value={textContent}
        onValueChange={onTextContentChange}
        onSaved={onSaved}
      />
    </div>
  );
};
