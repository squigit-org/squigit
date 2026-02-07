import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import styles from "./Welcome.module.css";
import {
  ImageResult,
  createChat,
  storeImageFromPath,
} from "@/lib/storage/chat";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/** Image data from CAS storage. */
export interface CASImageData {
  imageId: string;
  path: string;
}

interface WelcomeProps {
  /** Called when image is stored in CAS with its hash and path. */
  onImageReady: (data: CASImageData) => void;
  isActive?: boolean;
  isGuest?: boolean;
  onLoginRequired?: () => void;
}

export const Welcome: React.FC<WelcomeProps> = ({
  onImageReady,
  isActive = true,
  isGuest = false,
  onLoginRequired,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            <span className={styles.key}>A</span>
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
            <span className={styles.key}>A</span>
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
            <span className={styles.key}>A</span>
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

  // Handle Ctrl+V paste - Rust handles decoding and stores in CAS
  useEffect(() => {
    if (!isActive) return;

    const handlePaste = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (isGuest) {
          onLoginRequired?.();
          return;
        }
        try {
          // Rust now returns { hash, path } instead of base64
          const result = await invoke<ImageResult>("read_clipboard_image");
          if (result) {
            onImageReady({
              imageId: result.hash,
              path: result.path,
            });
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

  // Handle Tauri v2 native drag-drop events
  useEffect(() => {
    if (!isActive) return;

    // Listen for drag hover events
    const unlistenHover = listen<{ paths: string[] }>(
      "tauri://drag-over",
      () => {
        setIsDragging(true);
      },
    );

    // Listen for drag leave events
    const unlistenLeave = listen("tauri://drag-leave", () => {
      setIsDragging(false);
    });

    // Listen for drop events - Tauri v2 provides file paths directly
    const unlistenDrop = listen<{ paths: string[] }>(
      "tauri://drag-drop",
      async (event) => {
        setIsDragging(false);
        const paths = event.payload.paths;

        if (paths && paths.length > 0) {
          const filePath = paths[0];
          // Check if file has allowed extension
          const lowerPath = filePath.toLowerCase();
          const isAllowed = ALLOWED_EXTENSIONS.some((ext) =>
            lowerPath.endsWith(ext),
          );

          if (isAllowed) {
            if (isGuest) {
              onLoginRequired?.();
              return;
            }
            try {
              console.log("Processing dropped file:", filePath);
              const result = await storeImageFromPath(filePath);
              onImageReady({
                imageId: result.hash,
                path: result.path,
              });
            } catch (error) {
              console.error("Failed to process dropped file:", error);
            }
          } else {
            console.warn(
              "Dropped file is not an allowed image type:",
              filePath,
            );
          }
        }
      },
    );

    return () => {
      unlistenHover.then((fn) => fn());
      unlistenLeave.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, [onImageReady, isActive]);

  // Process file - Rust handles storage in CAS
  const handleFileProcess = async (file: File) => {
    if (isGuest) {
      onLoginRequired?.();
      return;
    }
    try {
      // @ts-expect-error Tauri provides file.path for dropped files
      if (file.path) {
        // Use Rust to store the file in CAS
        // @ts-expect-error Tauri provides file.path for dropped files
        const result = await storeImageFromPath(file.path);
        onImageReady({
          imageId: result.hash,
          path: result.path,
        });
      } else {
        // Fallback for web clipboard API - read bytes and store
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        const result = await invoke<{ hash: string; path: string }>(
          "store_image_bytes",
          { bytes },
        );
        onImageReady({
          imageId: result.hash,
          path: result.path,
        });
      }
    } catch (error) {
      console.error("Failed to process file:", error);
    }
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFileProcess(e.target.files[0]);
    }
  };

  return (
    <div
      className={`${styles.container} ${isDragging ? styles.dragging : ""}`}
      tabIndex={-1}
    >
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileInputChange}
      />

      <div className={styles.content}>
        <img src="/assets/raw.svg" alt="SnapLLM logo" className={styles.logo} />
        <h1 className={styles.title}>SnapLLM</h1>

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
              <span className={styles.key} title="Drag">
                D
              </span>
              <span className={styles.keySep}>&</span>
              <span className={styles.key} title="Drop">
                D
              </span>
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
