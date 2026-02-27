/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppContextMenu } from "@/layout";
import { GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MediaSidebar } from "./components/MediaSidebar";
import { MediaImageViewer } from "./components/MediaImageViewer";
import { MediaPdfViewer } from "./components/MediaPdfViewer";
import { MediaTextViewer } from "./components/MediaTextViewer";
import type { MediaViewerItem } from "./types";
import styles from "./MediaOverlay.module.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface MediaOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaViewerItem | null;
}

export const MediaOverlay: React.FC<MediaOverlayProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  const appRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);

  const activePath = useMemo(
    () => item?.sourcePath || item?.path || "",
    [item?.sourcePath, item?.path],
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    const hasSelection = !!selection && selection.toString().length > 0;

    setContextMenu({ x: e.clientX, y: e.clientY, hasSelection });
  };

  const handleCopySelection = () => {
    const selection = window.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection.toString());
    }
    setContextMenu(null);
  };

  const handleCopyPath = () => {
    if (!activePath) return;
    navigator.clipboard.writeText(activePath);
  };

  const handleReveal = async () => {
    if (!activePath) return;
    try {
      await invoke("reveal_in_file_manager", { path: activePath });
    } catch (error) {
      if (item && activePath !== item.path) {
        try {
          await invoke("reveal_in_file_manager", { path: item.path });
          return;
        } catch {
          // Continue to log original error.
        }
      }
      console.error("[MediaOverlay] Failed to reveal file:", error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const isContextMenu = target.closest('[data-is-context-menu="true"]');
      const isDialog = target.closest('[data-dialog-container="true"]');
      const isTitleBar = target.closest("[data-tauri-drag-region]");

      if (
        isOpen &&
        appRef.current &&
        !appRef.current.contains(target as Node) &&
        !isContextMenu &&
        !isDialog &&
        !isTitleBar
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const renderViewer = () => {
    if (!item) return <div className={styles.emptyText}>No file selected.</div>;

    if (item.kind === "image") {
      return <MediaImageViewer filePath={item.path} name={item.name} />;
    }

    if (item.kind === "pdf") {
      return <MediaPdfViewer filePath={item.path} isOpen={isOpen} />;
    }

    return (
      <MediaTextViewer
        extension={item.extension}
        textContent={item.textContent ?? ""}
      />
    );
  };

  return (
    <div
      className={`${styles.settingsOverlay} ${isOpen ? styles.open : ""}`}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={appRef}
        className={`${styles.container} ${isOpen ? styles.open : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <MediaSidebar
          onClose={onClose}
          onReveal={handleReveal}
          onCopyPath={handleCopyPath}
        />

        <div className={styles.content}>
          <div className={styles.sectionContent}>
            <div className={styles.viewerRoot}>
              <div className={styles.viewerHeader}>
                <h3 className={styles.viewerTitle}>{item?.name || "Viewer"}</h3>
              </div>
              <div className={styles.viewerBody}>{renderViewer()}</div>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <AppContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopySelection}
          hasSelection={contextMenu.hasSelection}
        />
      )}
    </div>
  );
};
