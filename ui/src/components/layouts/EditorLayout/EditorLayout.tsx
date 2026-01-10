/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
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
  // Settings panel props
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
}) => {
  const [data, setData] = useState<{ text: string; box: number[][] }[]>([]);
  const [loading, setLoading] = useState(false);
  // Separate visibility states for sequential transition
  const [showOverlay, setShowOverlay] = useState(false);
  const [showTextLayer, setShowTextLayer] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Toolbar State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const previousRect = useRef<DOMRect | null>(null);

  // Refs
  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorMenuRef = useRef<EditorMenuHandle>(null);

  // Dynamic padding state - distributes free space in 2:3 ratio (top:bottom)
  const [dynamicPaddingTop, setDynamicPaddingTop] = useState(0);

  // Dynamic padding calculation using ResizeObserver
  useEffect(() => {
    const viewer = viewerRef.current;
    const imgWrap = imgWrapRef.current;
    if (!viewer || !imgWrap) return;

    const calculatePadding = () => {
      // Get viewer's available height
      const viewerHeight = viewer.clientHeight;

      // Get image wrap height (including toolbar padding)
      const imgWrapHeight = imgWrap.scrollHeight;

      // Available free space = viewer height - content height
      // This is the space we can distribute between top and bottom
      const freeSpace = viewerHeight - imgWrapHeight;

      // If no free space or content overflows, no padding (avoid scrollbar)
      if (freeSpace <= 0) {
        setDynamicPaddingTop(0);
        return;
      }

      // Distribute free space in 2:3 ratio (top:bottom)
      // top = 2/5 of free space, bottom = 3/5 of free space (implicit)
      // This gives a slight "push to top" effect
      const topPadding = Math.floor(freeSpace * (2 / 5));

      setDynamicPaddingTop(topPadding);
    };

    // Initial calculation
    calculatePadding();

    // Reset scroll to top to prevent auto-scroll on large images
    viewer.scrollTop = 0;

    // Create ResizeObserver to monitor both viewer and image wrap
    const resizeObserver = new ResizeObserver(() => {
      calculatePadding();
    });

    resizeObserver.observe(viewer);
    resizeObserver.observe(imgWrap);

    // Also listen to window resize for vh unit changes
    window.addEventListener("resize", calculatePadding);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", calculatePadding);
    };
  }, [startupImage, size]); // Re-run when image or size changes

  // Backdrop state
  const [isBackdropVisible, setIsBackdropVisible] = useState(false);

  useLayoutEffect(() => {
    // Sync backdrop visibility
    if (isFullscreen) {
      // Start immediately as requested by user ("both together")
      setIsBackdropVisible(true);
    } else {
      setIsBackdropVisible(false);
    }
  }, [isFullscreen]);

  // Manage body scrollbar to prevent artifacts during transition
  useLayoutEffect(() => {
    if (isFullscreen || isTransitioning) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isFullscreen, isTransitioning]);

  useLayoutEffect(() => {
    const wrap = imgWrapRef.current;
    if (!wrap) return;

    // Measurement for FLIP
    const currentRect = wrap.getBoundingClientRect();

    if (previousRect.current) {
      const prev = previousRect.current;

      // Calculate invert values
      const deltaX = prev.left - currentRect.left;
      const deltaY = prev.top - currentRect.top;
      const deltaW = prev.width / currentRect.width;
      const deltaH = prev.height / currentRect.height;

      // If no change, don't animate (e.g. initial render)
      if (deltaX === 0 && deltaY === 0 && deltaW === 1 && deltaH === 1) {
        return;
      }

      setIsTransitioning(true);

      // Invert: apply transform to make it look like previous state
      wrap.style.transformOrigin = "top left";
      wrap.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})`;
      wrap.style.transition = "none";

      // Force reflow
      void wrap.offsetHeight;

      // Play: remove transform to animate to current state
      wrap.style.transform = "";
      wrap.style.transition = "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)";

      // Cleanup after animation
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        wrap.style.transition = "";
        wrap.style.transform = "";
        previousRect.current = null; // Reset
      }, 300);

      return () => {
        clearTimeout(timer);
        wrap.style.transition = "";
        wrap.style.transform = "";
      };
    }
  }, [isFullscreen]);

  // --- Toolbar actions ---
  const resetToolbarPosition = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    // Clear all inline positioning styles so CSS can take over
    toolbar.style.left = "";
    toolbar.style.right = "";
    toolbar.style.top = "";
    toolbar.style.bottom = "";
  }, []);

  // Capture previous rect before state change
  const toggleFullscreen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (imgWrapRef.current) {
        previousRect.current = imgWrapRef.current.getBoundingClientRect();
      }
      resetToolbarPosition();
      setIsFullscreen((prev) => !prev);
    },
    [resetToolbarPosition]
  );

  // Get image source
  const imageSrc = startupImage?.base64 || "";

  // Google Lens hook
  const { isLensLoading, triggerLens } = useLens(
    startupImage,
    sessionLensUrl,
    setSessionLensUrl
  );

  // Text selection hook - calls EditorMenu.showStandardMenu
  const { svgRef, handleTextMouseDown } = useTextSelection({
    data,
    onSelectionComplete: (selection) => {
      editorMenuRef.current?.showStandardMenu(selection);
    },
  });

  // Auto-scan on image load using Tauri invoke
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
        // Extract file path from asset URL
        imageData = decodeURIComponent(
          startupImage.base64.replace("asset://localhost", "")
        );
        isBase64 = false;
        console.log("OCR: Using file path:", imageData);
      } else {
        // Use base64 data directly
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

      // Convert to expected format (box_coords -> box)
      const converted = results.map((r) => ({
        text: r.text,
        box: r.box_coords,
      }));

      setData(converted);

      setData(converted);

      // Instant transition:
      // Toggle both at the same time. React will auto-batch these updates.
      setShowOverlay(false);
      setShowTextLayer(true);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      console.error("OCR Error:", e);
      setShowOverlay(false); // Hide on error
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

  // toggleFullscreen is now defined above to capture rect

  const handleCopyImage = useCallback(() => {
    console.log("Copy image not implemented yet");
  }, []);

  // --- Effects ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        resetToolbarPosition();
        setIsFullscreen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, resetToolbarPosition]);

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
        />
        <div className={styles.editorEmpty}>No image loaded</div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.editorLayout} ${
        isTransitioning ? styles.isTransitioning : ""
      }`}
    >
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
      />
      <div
        className={styles.viewer}
        ref={viewerRef}
        style={{ paddingTop: dynamicPaddingTop }} // 2:3 ratio - 40% of free space to top
      >
        <div
          className={`${styles.imageWrap} ${
            isFullscreen ? styles.isFullscreen : ""
          }`}
          ref={imgWrapRef}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            onLoad={onLoad}
            onError={() => setError("Failed to load image")}
            draggable={false}
          />

          {showTextLayer && !isFullscreen && !isTransitioning && (
            <TextLayer
              data={data}
              size={size}
              svgRef={svgRef}
              onTextMouseDown={handleTextMouseDown}
            />
          )}

          {!isFullscreen && !isTransitioning && (
            <ScanningOverlay isVisible={showOverlay} />
          )}

          <ImageToolbar
            toolbarRef={toolbarRef}
            isFullscreen={isFullscreen}
            isLensLoading={isLensLoading}
            onLensClick={triggerLens}
            onCopyImage={handleCopyImage}
            onToggleFullscreen={toggleFullscreen}
            imgWrapRef={imgWrapRef}
            isTransitioning={isTransitioning}
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

      <div
        className={`${styles.fullscreenBackdrop} ${
          isBackdropVisible ? styles.visible : ""
        }`}
        aria-hidden="true"
      />

      {error && <div className={styles.editorError}>{error}</div>}
    </div>
  );
};
