/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { StreamRenderer } from "./StreamRenderer";
import styles from "./ChatBubble.module.css";

interface StreamingResponseProps {
  text: string;
  onComplete?: () => void;
}

/**
 * Displays the first AI response with animated token-by-token reveal.
 * Uses StreamRenderer for ChatGPT-style streaming effect.
 */
export const StreamingResponse: React.FC<StreamingResponseProps> = ({
  text,
  onComplete,
}) => {
  if (!text) return null;

  return (
    <div className={styles.streamingContainer} data-component="chat-bubble">
      <div className={`${styles.bubble} ${styles.botBubble}`}>
        <StreamRenderer fullText={text} onComplete={onComplete} />
      </div>
    </div>
  );
};
