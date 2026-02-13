import React, { useState, useRef, useEffect } from "react";
import { usePlatform } from "@/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import styles from "./Welcome.module.css";
import { ImageResult, storeImageFromPath } from "@/lib/storage";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export interface CASImageData {
  imageId: string;
  path: string;
}

interface WelcomeProps {
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

  /* eslint-disable react-hooks/exhaustive-deps */
  const { isMac, isWin, modSymbol, shiftSymbol } = usePlatform();

  const platformInfo = React.useMemo(() => {
    if (isMac) {
      return {
        screenshotKeys: (
          <>
            <span className={styles.key}>{modSymbol}</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>{shiftSymbol}</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>A</span>
          </>
        ),
        pasteKeys: (
          <>
            <span className={styles.key}>{modSymbol}</span>
            <span className={styles.keySep}>+</span>
            <span className={styles.key}>V</span>
          </>
        ),
      };
    } else if (isWin) {
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
  }, [isMac, isWin, modSymbol, shiftSymbol]);

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
        // @ts-expect-error Tauri provides file.path for dropped files
        const result = await storeImageFromPath(file.path);
        onImageReady({
          imageId: result.hash,
          path: result.path,
        });
      } else {
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
        <svg
          className={styles.logo}
          width="827"
          height="827"
          viewBox="0 0 827 827"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M116.791 593.519C116.897 624.434 129.224 654.054 151.085 675.915C172.946 697.776 202.565 710.104 233.48 710.21H326.953V827H233.28C202.632 826.987 172.287 820.938 143.978 809.197C115.668 797.457 89.9473 780.254 68.2852 758.573C46.6231 736.893 29.4429 711.157 17.7266 682.837C6.01032 654.517 -0.0131451 624.166 0 593.519V500.047H116.791V593.519ZM662.22 603.163C678.913 596.249 697.281 594.44 715.002 597.965C732.723 601.49 749 610.191 761.776 622.967C774.553 635.743 783.254 652.021 786.779 669.742C790.304 687.463 788.494 705.831 781.58 722.523C774.666 739.216 762.957 753.484 747.934 763.522C732.91 773.561 715.248 778.919 697.18 778.919C672.951 778.919 649.714 769.293 632.582 752.161C615.45 735.029 605.825 711.793 605.825 687.564C605.825 669.496 611.183 651.834 621.221 636.811C631.259 621.787 645.527 610.077 662.22 603.163ZM326.953 116.862H233.48C202.565 116.968 172.946 129.304 151.085 151.178C129.224 173.052 116.897 202.689 116.791 233.624V326.953H0V233.424C0.0131396 202.757 6.06309 172.393 17.8037 144.065C29.5443 115.738 46.7462 90.0024 68.4268 68.3271C90.1074 46.6518 115.842 29.4608 144.162 17.7373C172.482 6.01382 202.833 -0.0131094 233.48 0H326.953V116.862ZM593.719 0C624.367 0.0131396 654.712 6.06309 683.022 17.8037C711.332 29.5443 737.053 46.7462 758.715 68.4268C780.377 90.1074 797.557 115.842 809.273 144.162C820.99 172.482 827.013 202.833 827 233.48V326.953H710.209V233.48C710.103 202.565 697.775 172.946 675.914 151.085C654.053 129.224 624.434 116.897 593.519 116.791H500.046V0H593.719Z"
            fill="var(--neutral-100)"
          />
          <path
            d="M413.877 63.4409C413.877 256.226 569.55 412.651 762.047 413.871L764.314 413.877C570.773 413.877 413.877 570.773 413.877 764.314C413.877 571.529 258.205 415.103 65.7075 413.884L63.4409 413.877C256.982 413.877 413.877 256.982 413.877 63.4409Z"
            fill="var(--neutral-100)"
          />
        </svg>
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
