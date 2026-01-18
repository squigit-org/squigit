/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./Welcome.module.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface WelcomeProps {
  onImageReady: (
    data: string | { path?: string; base64?: string; mimeType: string },
  ) => void;
  isActive?: boolean;
}

export const Welcome: React.FC<WelcomeProps> = ({
  onImageReady,
  isActive = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const platformInfo = React.useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) {
      return {
        screenshotKeys: (
          <>
            <span className={styles.key}>⌘</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>⇧</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>S</span>
          </>
        ),
        pasteKeys: (
          <>
            <span className={styles.key}>⌘</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>V</span>
          </>
        ),
      };
    } else if (ua.includes("win")) {
      return {
        screenshotKeys: (
          <>
            <span className={styles.key}>Win</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>Shift</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>S</span>
          </>
        ),
        pasteKeys: (
          <>
            <span className={styles.key}>Ctrl</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>V</span>
          </>
        ),
      };
    } else {
      return {
        screenshotKeys: (
          <>
            <span className={styles.key}>Super</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>Shift</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>S</span>
          </>
        ),
        pasteKeys: (
          <>
            <span className={styles.key}>Ctrl</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>V</span>
          </>
        ),
      };
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const handlePaste = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        try {
          const result = await invoke("read_clipboard_image");
          if (result) {
            onImageReady(result as string);
          }
        } catch (error) {
          console.error("Failed to read clipboard image:", error);
        }
      }
    };

    window.addEventListener("keydown", handlePaste);

    return () => {
      window.removeEventListener("keydown", handlePaste);
    };
  }, [onImageReady, isActive]);

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
  };

  const handleFileProcess = async (file: File) => {
    try {
      // @ts-ignore
      if (file.path) {
        // @ts-ignore
        const result = await invoke("read_image_file", { path: file.path });
        // @ts-ignore
        onImageReady(result);
      } else {
        // Fallback
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const result = await invoke("process_image_bytes", {
          bytes: Array.from(bytes),
        });
        // @ts-ignore
        onImageReady(result);
      }
    } catch (error) {
      console.error("Failed to process file", error);
    }
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  return (
    <div
      className={`${styles.container} ${isDragging ? styles.dragging : ""}`}
      tabIndex={-1}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileInputChange}
      />

      <div className={styles.content}>
        <img
          src="/assets/raw.svg"
          alt="Spatialshot logo"
          className={styles.logo}
        />
        <h1 className={styles.title}>Spatialshot</h1>

        <div className={styles.actions}>
          <div className={styles.actionRow}>
            <span className={styles.actionLabel}>
              Analyze part of your screen
            </span>
            <span className={styles.actionKeys}>
              {platformInfo.screenshotKeys}
            </span>
          </div>
          <div className={styles.actionRow}>
            <span className={styles.actionLabel}>Paste an image</span>
            <span className={styles.actionKeys}>{platformInfo.pasteKeys}</span>
          </div>
          <div className={styles.actionRow}>
            <span className={styles.actionLabel}>Drop an image</span>
            <span className={styles.actionKeys}>
              <span className={styles.key}>D</span>
              <span className={styles.keySep}>&</span>
              <span className={styles.key}>D</span>
            </span>
          </div>
        </div>
      </div>

      {isDragging && (
        <div className={styles.dropOverlay}>
          <span>Drop your image here</span>
        </div>
      )}
    </div>
  );
};
