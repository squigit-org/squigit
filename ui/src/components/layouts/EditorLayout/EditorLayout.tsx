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
import {
  TextLayer,
  InlineMenu,
  ImageToolbar,
  useTextSelection,
  useInlineMenu,
} from "../../ui";
import { useLens } from "../../../features/google";
import { EditorHeader } from "./EditorHeader";
import "./EditorLayout.css";

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
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Toolbar State
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const MENU_HEIGHT = 48;

  // Get image source
  const imageSrc = startupImage?.base64 || "";

  // Google Lens hook
  const { isLensLoading, triggerLens } = useLens(
    startupImage,
    sessionLensUrl,
    setSessionLensUrl
  );

  // --- Inline Menu (Hook) ---
  const showFlatMenuRef = useRef<
    ((rect: { left: number; width: number; top: number }) => void) | null
  >(null);

  const performSelectAll = useCallback(() => {
    const svg = document.querySelector(".text-layer");
    if (svg) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(svg);
        selection.addRange(range);
      }
    }

    const wrap = imgWrapRef.current;
    if (!wrap) return;

    const wrapRect = wrap.getBoundingClientRect();
    const menuWidth = 250;

    let targetTopViewport = wrapRect.top - MENU_HEIGHT - 20;
    if (data.length > 0) {
      const firstBoxY = data.reduce(
        (min, item) => Math.min(min, item.box[0][1]),
        Infinity
      );
      const imgRect = imgRef.current?.getBoundingClientRect();
      if (imgRect && size.h > 0) {
        const scale = imgRect.height / size.h;
        targetTopViewport = imgRect.top + firstBoxY * scale - MENU_HEIGHT - 20;
      }
    }
    if (targetTopViewport < 10) targetTopViewport = 10;

    const viewerRect = viewerRef.current?.getBoundingClientRect();
    let targetLeftViewport = window.innerWidth / 2 - menuWidth / 2;
    if (viewerRect) {
      targetLeftViewport =
        viewerRect.left + viewerRect.width / 2 - menuWidth / 2;
    }

    if (targetLeftViewport < 10) targetLeftViewport = 10;
    if (targetLeftViewport + menuWidth > window.innerWidth - 10) {
      targetLeftViewport = window.innerWidth - menuWidth - 10;
    }

    if (showFlatMenuRef.current) {
      showFlatMenuRef.current({
        left: targetLeftViewport,
        top: targetTopViewport,
        width: menuWidth,
      });
    }
  }, [data, size.h]);

  const {
    menuRef,
    sliderRef,
    notchRef,
    page1Ref,
    page2Ref,
    pageFlatRef,
    handleAction,
    switchPage,
    showStandardMenu,
    showFlatMenu,
  } = useInlineMenu({
    containerRef: imgWrapRef,
    onSelectAll: performSelectAll,
  });

  // Update the ref
  useEffect(() => {
    showFlatMenuRef.current = showFlatMenu;
  }, [showFlatMenu]);

  // Text selection hook
  const { svgRef, handleTextMouseDown } = useTextSelection({
    data,
    onSelectionComplete: (selection) => {
      showStandardMenu(selection);
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
        console.log("OCR: Using base64 data");
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
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      console.error("OCR Error:", e);
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

  // --- Toolbar actions ---
  const resetToolbarPosition = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    toolbar.style.left = "";
    toolbar.style.top = "";
    toolbar.style.right = "16px";
    toolbar.style.bottom = "16px";
  }, []);

  const toggleFullscreen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      resetToolbarPosition();
      setIsFullscreen((prev) => !prev);
    },
    [resetToolbarPosition]
  );

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
      <div className="editor-layout">
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
        <div className="editor-empty">No image loaded</div>
      </div>
    );
  }

  return (
    <div className="editor-layout">
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
      <div className="viewer" ref={viewerRef}>
        <div
          className={`image-wrap ${isFullscreen ? "is-fullscreen" : ""}`}
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

          <TextLayer
            data={data}
            size={size}
            svgRef={svgRef}
            onTextMouseDown={handleTextMouseDown}
          />

          {loading && <div className="loading">Scanning...</div>}

          <ImageToolbar
            toolbarRef={toolbarRef}
            isFullscreen={isFullscreen}
            isLensLoading={isLensLoading}
            onLensClick={triggerLens}
            onCopyImage={handleCopyImage}
            onToggleFullscreen={toggleFullscreen}
            imgWrapRef={imgWrapRef}
          />
        </div>
      </div>

      <InlineMenu
        menuRef={menuRef}
        sliderRef={sliderRef}
        notchRef={notchRef}
        page1Ref={page1Ref}
        page2Ref={page2Ref}
        pageFlatRef={pageFlatRef}
        onAction={handleAction}
        onSwitchPage={switchPage}
      />

      {error && <div className="editor-error">{error}</div>}
    </div>
  );
};
