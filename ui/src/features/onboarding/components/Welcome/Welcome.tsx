import React, {
  useState,
  useRef,
  DragEvent,
  ChangeEvent,
  ClipboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./Welcome.module.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

interface WelcomeProps {
  onImageReady: (
    data: string | { path?: string; base64?: string; mimeType: string }
  ) => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ onImageReady }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const platformShortcut = React.useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) {
      return (
        <>
          <span className={styles.key}>Cmd ⌘</span> +{" "}
          <span className={styles.key}>Shift ⇧</span> +{" "}
          <span className={styles.key}>A</span>
        </>
      );
    } else if (ua.includes("win")) {
      return (
        <>
          <span className={styles.key}>Win ⊞</span> +{" "}
          <span className={styles.key}>Shift ⇧</span> +{" "}
          <span className={styles.key}>A</span>
        </>
      );
    } else {
      return (
        <>
          <span className={styles.key}>Super</span> +{" "}
          <span className={styles.key}>Shift</span> +{" "}
          <span className={styles.key}>A</span>
        </>
      );
    }
  }, []);

  const processFiles = async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      console.warn("Invalid file type:", file.type);
      return;
    }
    if (file.size > MAX_SIZE) {
      console.warn("File too large");
      return;
    }

    try {
      let result: string | { path?: string; mimeType: string };

      // @ts-ignore - Check for path (Tauri specific)
      if (file.path) {
        // @ts-ignore
        result = await invoke("process_image_path", { path: file.path });
      } else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        result = await invoke("process_image_bytes", {
          bytes: Array.from(bytes),
        });
      }

      onImageReady(result);
    } catch (error) {
      console.error("Failed to process file", error);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) processFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files?.length > 0) {
      e.preventDefault();
      processFiles(e.clipboardData.files);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      triggerFileInput();
    }
  };

  return (
    <div className={styles.container} onPaste={handlePaste} tabIndex={-1}>
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileInputChange}
      />

      <section
        className={`${styles.uploadArea} ${isDragging ? styles.dragging : ""}`}
        tabIndex={0}
        role="button"
        onClick={triggerFileInput}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <svg
          className={styles.uploadSvg}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M21 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"></path>
          <polyline points="7 11 12 6 17 11"></polyline>
          <line x1="12" y1="6" x2="12" y2="18"></line>
        </svg>
        <div className={styles.title}>Upload your image</div>
        <div className={styles.subtitle}>Click, drop, or paste a file</div>
        <div className={styles.hint} aria-hidden="true">
          <span>• JPG, PNG, WEBP</span>
          <span>• Max 20 MB</span>
        </div>
      </section>

      <aside className={styles.rightCol} aria-label="Details">
        <div className={styles.panelTitle}>Quick notes</div>
        <div className={styles.panelBody}>
          To analyze any part of your screen, simply close this window and{" "}
          {platformShortcut}.
        </div>
        <div style={{ height: "8px" }}></div>
        <div className={styles.panelTitle}>Accessibility</div>
        <div className={styles.panelBody}>
          You can tab to the upload area and press Enter to open the file
          dialog.
        </div>

        <div className={styles.footer} aria-hidden="true">
          <p className={styles.footerText}>Spatialshot &copy; 2026</p>
        </div>
      </aside>
    </div>
  );
};
