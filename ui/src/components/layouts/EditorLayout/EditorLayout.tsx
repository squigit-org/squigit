/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  ForwardedRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLens } from "../../../features/google";
import {
  EditorHeader,
  EditorMenu,
  EditorMenuHandle,
} from "../../../features/editor";
import {
  TextLayer,
  ImageToolbar,
  useTextSelection,
  ScanningOverlay,
  ExpandedView,
} from "../../ui";
import styles from "./EditorLayout.module.css";

interface OCRBox {
  text: string;
  box_coords: number[][];
  confidence?: number;
}

interface EditorLayoutProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string) => void;

  isPanelActive: boolean;
  toggleSettingsPanel: () => void;
  isPanelVisible: boolean;
  isPanelActiveAndVisible: boolean;
  isPanelClosing: boolean;
  settingsButtonRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  settingsPanelRef: ForwardedRef<{ handleClose: () => Promise<boolean> }>;
  prompt: string;
  editingModel: string;
  setPrompt: (prompt: string) => void;
  onEditingModelChange: (model: string) => void;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
  toggleSubview: (isActive: boolean) => void;
  onNewSession: () => void;
  chatTitle: string;
  onDescribeEdits: (description: string) => void;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  isPanelActive,
  toggleSettingsPanel,
  isPanelVisible,
  isPanelActiveAndVisible,
  isPanelClosing,
  settingsButtonRef,
  panelRef,
  settingsPanelRef,
  prompt,
  editingModel,
  setPrompt,
  onEditingModelChange,
  userName,
  userEmail,
  avatarSrc,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  onResetAPIKey,
  toggleSubview,
  onNewSession,
  chatTitle,
  onDescribeEdits,
}) => {
  const [data, setData] = useState<{ text: string; box: number[][] }[]>([]);
  const [loading, setLoading] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);
  const [showTextLayer, setShowTextLayer] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [isExpandedViewOpen, setIsExpandedViewOpen] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorMenuRef = useRef<EditorMenuHandle>(null);

  const [dynamicPaddingTop, setDynamicPaddingTop] = useState(0);

  useEffect(() => {
    const viewer = viewerRef.current;
    const imgWrap = imgWrapRef.current;
    if (!viewer || !imgWrap) return;

    const calculatePadding = () => {
      const viewerHeight = viewer.clientHeight;

      const imgWrapHeight = imgWrap.scrollHeight;

      const freeSpace = viewerHeight - imgWrapHeight;

      if (freeSpace <= 0) {
        setDynamicPaddingTop(0);
        return;
      }

      const topPadding = Math.floor(freeSpace * (2 / 5));

      setDynamicPaddingTop(topPadding);
    };

    calculatePadding();

    viewer.scrollTop = 0;

    const resizeObserver = new ResizeObserver(() => {
      calculatePadding();
    });

    resizeObserver.observe(viewer);
    resizeObserver.observe(imgWrap);

    window.addEventListener("resize", calculatePadding);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", calculatePadding);
    };
  }, [startupImage, size]);

  const imageSrc = startupImage?.base64 || "";

  const { isLensLoading, triggerLens } = useLens(
    startupImage,
    sessionLensUrl,
    setSessionLensUrl
  );

  const { svgRef, handleTextMouseDown } = useTextSelection({
    data,
    onSelectionComplete: (selection) => {
      editorMenuRef.current?.showStandardMenu(selection);
    },
  });

  const scan = useCallback(async () => {
    console.log("Scan called with startupImage:", startupImage);

    if (!startupImage?.base64) {
      console.log("No image to scan");
      return;
    }

    setLoading(true);
    setShowOverlay(true);
    setShowTextLayer(false);
    setError("");

    try {
      let imageData: string;
      let isBase64: boolean;

      if (
        startupImage.isFilePath &&
        startupImage.base64.startsWith("asset://")
      ) {
        imageData = decodeURIComponent(
          startupImage.base64.replace("asset://localhost", "")
        );
        isBase64 = false;
        console.log("OCR: Using file path:", imageData);
      } else {
        imageData = startupImage.base64;
        isBase64 = true;
        console.log(
          "OCR: Using base64 data (length: " + imageData.length + ")"
        );
      }

      console.log("Running OCR via Tauri invoke...");
      const results = await invoke<OCRBox[]>("ocr_image", {
        imageData,
        isBase64,
      });

      console.log("OCR boxes found:", results.length);

      const converted = results.map((r) => ({
        text: r.text,
        box: r.box_coords,
      }));

      setData(converted);

      setData(converted);

      setShowOverlay(false);
      setShowTextLayer(true);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      console.error("OCR Error:", e);
      setShowOverlay(false);
    } finally {
      setLoading(false);
    }
  }, [startupImage]);

  useEffect(() => {
    console.log(
      "Scan effect triggered, startupImage:",
      startupImage?.isFilePath
    );
    if (startupImage) {
      scan();
    }
  }, [startupImage, scan]);

  const onLoad = () => {
    if (imgRef.current) {
      setSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  const handleCopyImage = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }

      ctx.drawImage(img, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

      await invoke("copy_image_to_clipboard", { imageBase64: base64 });

      const { showToast } = await import("../../ui/Notifications/Toast");
      showToast("Copied to clipboard", "success");
    } catch (err) {
      console.error("Failed to copy image:", err);
      const { showToast } = await import("../../ui/Notifications/Toast");
      showToast("Failed to copy", "error");
    }
  }, []);

  const handleExpandClick = useCallback(() => {
    setIsExpandedViewOpen(true);
  }, []);

  const handleExpandClose = useCallback(() => {
    setIsExpandedViewOpen(false);
  }, []);

  const handleExpandSave = useCallback(async () => {
    // TODO: Implement save functionality
    const { showToast } = await import("../../ui/Notifications/Toast");
    showToast("Save feature coming soon", "success");
  }, []);

  const handleDescribeEdits = useCallback(
    (description: string) => {
      setIsExpandedViewOpen(false);
      onDescribeEdits(description);
    },
    [onDescribeEdits]
  );

  if (!startupImage) {
    return (
      <div className={styles.editorLayout}>
        <EditorHeader
          isPanelActive={isPanelActive}
          toggleSettingsPanel={toggleSettingsPanel}
          isPanelVisible={isPanelVisible}
          isPanelActiveAndVisible={isPanelActiveAndVisible}
          isPanelClosing={isPanelClosing}
          settingsButtonRef={settingsButtonRef}
          panelRef={panelRef}
          settingsPanelRef={settingsPanelRef}
          prompt={prompt}
          editingModel={editingModel}
          setPrompt={setPrompt}
          onEditingModelChange={onEditingModelChange}
          userName={userName}
          userEmail={userEmail}
          avatarSrc={avatarSrc}
          onSave={onSave}
          onLogout={onLogout}
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          onResetAPIKey={onResetAPIKey}
          toggleSubview={toggleSubview}
          onNewSession={onNewSession}
        />
        <div className={styles.editorEmpty}>No image loaded</div>
      </div>
    );
  }

  return (
    <div className={styles.editorLayout}>
      <EditorHeader
        isPanelActive={isPanelActive}
        toggleSettingsPanel={toggleSettingsPanel}
        isPanelVisible={isPanelVisible}
        isPanelActiveAndVisible={isPanelActiveAndVisible}
        isPanelClosing={isPanelClosing}
        settingsButtonRef={settingsButtonRef}
        panelRef={panelRef}
        settingsPanelRef={settingsPanelRef}
        prompt={prompt}
        editingModel={editingModel}
        setPrompt={setPrompt}
        onEditingModelChange={onEditingModelChange}
        userName={userName}
        userEmail={userEmail}
        avatarSrc={avatarSrc}
        onSave={onSave}
        onLogout={onLogout}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        onResetAPIKey={onResetAPIKey}
        toggleSubview={toggleSubview}
        onNewSession={onNewSession}
      />
      <div
        className={styles.viewer}
        ref={viewerRef}
        style={{ paddingTop: dynamicPaddingTop }}
      >
        <div className={styles.imageWrap} ref={imgWrapRef}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            onLoad={onLoad}
            onError={() => setError("Failed to load image")}
            draggable={false}
          />

          {showTextLayer && (
            <TextLayer
              data={data}
              size={size}
              svgRef={svgRef}
              onTextMouseDown={handleTextMouseDown}
            />
          )}

          <ScanningOverlay isVisible={showOverlay} />

          <ImageToolbar
            toolbarRef={toolbarRef}
            isLensLoading={isLensLoading}
            onLensClick={triggerLens}
            onCopyImage={handleCopyImage}
            onExpandClick={handleExpandClick}
            imgWrapRef={imgWrapRef}
            imageHeight={imgRef.current?.clientHeight || size.h}
          />
        </div>
      </div>

      <EditorMenu
        ref={editorMenuRef}
        data={data}
        size={size}
        imgRef={imgRef}
        imgWrapRef={imgWrapRef}
        viewerRef={viewerRef}
      />

      {error && <div className={styles.editorError}>{error}</div>}

      <ExpandedView
        isOpen={isExpandedViewOpen}
        imageSrc={imageSrc}
        chatTitle={chatTitle}
        startupImage={startupImage}
        onClose={handleExpandClose}
        onSave={handleExpandSave}
        onSubmit={handleDescribeEdits}
      />
    </div>
  );
};
