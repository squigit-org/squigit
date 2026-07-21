/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { commands, platform } from "@/platform";
import { Dialog, WidgetOverlay } from "@/components/ui";
import { AppContextMenu } from "@/app/layout/menus/AppContextMenu";
import { ImageThreadsMenu } from "@/app/layout/menus/ImageThreadsMenu";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  MediaSidebar,
  MediaImageViewer,
  MediaPdfViewer,
  MediaTextViewer,
  type MediaGalleryItem,
  type MediaTextViewerHandle,
  type MediaViewerItem,
} from "@/features/media";
import styles from "./MediaOverlay.module.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface MediaOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaViewerItem | null;
  onRevealInThread?: (threadId: string) => void;
}

export const MediaOverlay: React.FC<MediaOverlayProps> = ({
  isOpen,
  onClose,
  item,
  onRevealInThread,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);
  const [threadMenu, setThreadMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [activeImage, setActiveImage] = useState<MediaGalleryItem | null>(null);
  const [activeTextContent, setActiveTextContent] = useState("");
  const [activeTextPath, setActiveTextPath] = useState("");
  const [textUsesCasPath, setTextUsesCasPath] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] =
    useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const textViewerRef = useRef<MediaTextViewerHandle>(null);
  const isThreadOpenedImage =
    item?.kind === "image" && item?.openedFromThread === true;

  const activePath = useMemo(
    () =>
      activeImage?.path ||
      (item?.kind === "text" ? activeTextPath : item?.path) ||
      "",
    [activeImage?.path, activeTextPath, item?.kind, item?.path],
  );
  const activeSourcePath =
    activeImage?.sourcePath || item?.sourcePath || undefined;
  const activeImageThreads = activeImage?.imageThreads || item?.imageThreads;

  useEffect(() => {
    setActiveImage(
      item?.kind === "image"
        ? {
            path: item.path,
            sourcePath: item.sourcePath,
            name: item.name,
            extension: item.extension,
            imageThreads: item.imageThreads,
          }
        : null,
    );
    setActiveTextContent(item?.kind === "text" ? item.textContent ?? "" : "");
    setActiveTextPath(item?.kind === "text" ? item.path : "");
    setTextUsesCasPath(false);
    setShowUnsavedChangesDialog(false);
    setThreadMenu(null);
    setIsCopied(false);
    setIsCopying(false);
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen) textViewerRef.current?.reset();
  }, [isOpen]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    const hasSelection = !!selection && selection.toString().length > 0;

    setThreadMenu(null);
    setContextMenu({ x: e.clientX, y: e.clientY, hasSelection });
  };

  const handleCopySelection = () => {
    const selection = window.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection.toString());
    }
    setContextMenu(null);
  };

  const handleCopy = async () => {
    if (!activePath || isCopying) return;
    setIsCopying(true);
    try {
      if (item?.kind === "image") {
        await platform.invoke("copy_image_from_path_to_clipboard", {
          path: activePath,
        });
      } else if (item?.kind === "text") {
        await navigator.clipboard.writeText(activeTextContent);
      } else {
        let copyPath = activePath;
        if (activeSourcePath) {
          try {
            if (await platform.fs.exists(activeSourcePath)) {
              copyPath = activeSourcePath;
            }
          } catch {
            // The CAS path remains the reliable fallback.
          }
        }
        await navigator.clipboard.writeText(copyPath);
      }
      setIsCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setIsCopied(false);
        copiedTimerRef.current = null;
      }, 1800);
    } catch (error) {
      console.error("[MediaOverlay] Failed to copy media:", error);
    } finally {
      setIsCopying(false);
    }
  };

  const handleReveal = async () => {
    if (!activePath) return;

    const candidates = textUsesCasPath
      ? [activePath]
      : (Array.from(
          new Set([activeSourcePath, activePath].filter((path) => !!path)),
        ) as string[]);
    let lastError: unknown;

    for (const path of candidates) {
      let exists: boolean | null = null;
      try {
        exists = await platform.fs.exists(path);
      } catch (error) {
        lastError = error;
      }
      if (exists === false) continue;

      try {
        await commands.revealInFileManager(path);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    console.error(
      "[MediaOverlay] Failed to reveal file:",
      lastError || new Error("The media file no longer exists."),
    );
  };

  const handleActiveImageChange = useCallback((image: MediaGalleryItem) => {
    setActiveImage(image);
    setThreadMenu(null);
    setIsCopied(false);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, []);

  const handleTextContentChange = useCallback((value: string) => {
    setActiveTextContent(value);
    setIsCopied(false);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, []);

  const handleTextSaved = useCallback((casPath: string) => {
    setActiveTextPath(casPath);
    setTextUsesCasPath(true);
  }, []);

  const handleRequestClose = useCallback(() => {
    if (textViewerRef.current?.hasUnsavedChanges()) {
      setShowUnsavedChangesDialog(true);
      return;
    }

    textViewerRef.current?.reset();
    onClose();
  }, [onClose]);

  const handleUnsavedChangesAction = useCallback(
    async (actionKey: string) => {
      if (actionKey === "cancel") {
        setShowUnsavedChangesDialog(false);
        return;
      }

      if (actionKey === "discard") {
        setShowUnsavedChangesDialog(false);
        textViewerRef.current?.reset();
        onClose();
        return;
      }

      if (actionKey === "save") {
        const didSave = await textViewerRef.current?.save();
        if (didSave) {
          setShowUnsavedChangesDialog(false);
          onClose();
        }
      }
    },
    [onClose],
  );

  const handleRevealInThread = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (!activeImageThreads?.length || !onRevealInThread) return;
    const button = event.currentTarget.getBoundingClientRect();
    setContextMenu(null);
    setThreadMenu((current) =>
      current
        ? null
        : { x: button.right, y: button.top },
    );
  };

  const renderViewer = () => {
    if (!item) return <div className={styles.emptyText}>No file selected.</div>;

    if (item.kind === "image") {
      return (
        <MediaImageViewer
          filePath={item.path}
          name={item.name}
          isGallery={item.isGallery === true}
          galleryItems={item.galleryItems}
          initialIndex={item.galleryIndex}
          onActiveItemChange={handleActiveImageChange}
        />
      );
    }

    if (item.kind === "pdf") {
      return <MediaPdfViewer filePath={item.path} isOpen={isOpen} />;
    }

    return (
      <MediaTextViewer
        ref={textViewerRef}
        filePath={activeTextPath || item.path}
        attachmentPath={item.attachmentPath || item.path}
        fileName={item.name}
        threadId={item.threadId}
        extension={item.extension}
        textContent={activeTextContent}
        canEdit={item.openedFromThread !== true}
        onTextContentChange={handleTextContentChange}
        onSaved={handleTextSaved}
      />
    );
  };

  return (
    <>
      <WidgetOverlay
        isOpen={isOpen}
        onClose={handleRequestClose}
        onContextMenu={handleContextMenu}
        sectionContentClassName={styles.sectionContent}
        sidebarBottom={
          <MediaSidebar
            onReveal={handleReveal}
            onCopy={handleCopy}
            copyLabel={
              item?.kind === "image"
                ? "Copy as image"
                : item?.kind === "text"
                  ? "Copy content"
                  : "Copy path"
            }
            isCopied={isCopied}
            isCopying={isCopying}
            isRevealInThreadActive={threadMenu !== null}
            onRevealInThread={
              item?.kind === "image" &&
              activeImageThreads?.length &&
              !isThreadOpenedImage
                ? handleRevealInThread
                : undefined
            }
          />
        }
      >
        <div className={styles.viewerRoot}>
          {item?.kind !== "image" && (
            <div className={styles.viewerHeader}>
              <h3 className={styles.viewerTitle}>{item?.name || "Viewer"}</h3>
            </div>
          )}
          <div
            className={styles.viewerBody}
            onPointerDownCapture={() => setThreadMenu(null)}
          >
            {renderViewer()}
          </div>
        </div>
      </WidgetOverlay>
      {contextMenu && (
        <AppContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopySelection}
          hasSelection={contextMenu.hasSelection}
        />
      )}
      {threadMenu && activeImageThreads && onRevealInThread && (
        <ImageThreadsMenu
          x={threadMenu.x}
          y={threadMenu.y}
          threads={activeImageThreads}
          onClose={() => setThreadMenu(null)}
          onSelect={onRevealInThread}
        />
      )}
      <Dialog
        isOpen={showUnsavedChangesDialog}
        type="UNSAVED_MEDIA_CHANGES"
        onAction={(actionKey) => void handleUnsavedChangesAction(actionKey)}
      />
    </>
  );
};
