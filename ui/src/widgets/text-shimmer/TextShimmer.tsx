/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import styles from "./TextShimmer.module.css";

interface TextShimmerProps {
  /**
   * Whether to show the full variant with cycling status messages
   * (e.g., "Analyzing your image", "Extracting text", etc.)
   * If false, shows a simple "Thinking..." text
   */
  variant?: "full" | "simple";
}

const FULL_MESSAGES = [
  "Analyzing your image",
  "Extracting details",
  "Processing",
  "Generating response",
  "Loading",
  "Thinking",
];

const SIMPLE_MESSAGES = ["Thinking", "Processing", "Generating"];

/**
 * A modern text shimmer component inspired by Cursor's loading animation.
 * Displays text with a gradient glow effect that sweeps across the characters
 * in a smooth loop. The full variant cycles through different status messages
 * at random intervals.
 */
export const TextShimmer: React.FC<TextShimmerProps> = ({
  variant = "full",
}) => {
  const messages = variant === "full" ? FULL_MESSAGES : SIMPLE_MESSAGES;
  const [messageIndex, setMessageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleNext = () => {
      // Random interval between 1.5s and 4s
      const delay = 1500 + Math.random() * 2500;

      timeoutRef.current = setTimeout(() => {
        setIsTransitioning(true);

        // After fade out, change message
        setTimeout(() => {
          setMessageIndex((prev) => (prev + 1) % messages.length);
          setIsTransitioning(false);
        }, 200);

        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [messages.length]);

  const currentMessage = messages[messageIndex];

  return (
    <div className={styles.container} aria-hidden="true">
      <span
        className={`${styles.shimmerText} ${isTransitioning ? styles.fadeOut : styles.fadeIn}`}
      >
        {currentMessage}
        <span className={styles.dots}>...</span>
      </span>
    </div>
  );
};

export default TextShimmer;
