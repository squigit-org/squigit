/**
 * @license
 * Copyright 2025 a7mddra
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
} from "../../ui";
import {
  generateSearchUrl,
  generateTranslateUrl,
  useLens,
} from "../../../features/google";
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

  // Menu State
  const [menuActive, setMenuActive] = useState(false);
  const [isSelectAllMode, setIsSelectAllMode] = useState(false);

  // Toolbar State
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const menuRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const notchRef = useRef<SVGSVGElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const pageFlatRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const NOTCH_OFFSET = 12;
  const MENU_HEIGHT = 48;

  // Get image source
  const imageSrc = startupImage?.base64 || "";

  // Google Lens hook
  const { isLensLoading, triggerLens } = useLens(
    startupImage,
    sessionLensUrl,
    setSessionLensUrl
  );

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

  // --- Core Menu Logic ---
  const hideMenu = useCallback(() => {
    if (menuRef.current) {
      menuRef.current.classList.remove("animating-layout");
      menuRef.current.classList.remove("active");
      if (notchRef.current) notchRef.current.classList.remove("active");
    }
    setMenuActive(false);
    setIsSelectAllMode(false);
  }, []);

  const getSelectedText = () => {
    return window.getSelection()?.toString().trim() || "";
  };

  const positionMenu = useCallback(
    (
      selectionRectViewport: {
        left: number;
        width: number;
        top: number;
        height?: number;
      },
      isFlatMode: boolean
    ) => {
      const menu = menuRef.current;
      const notch = notchRef.current;
      if (!menu || !notch) return;

      const selectionCenterViewport =
        selectionRectViewport.left + selectionRectViewport.width / 2;
      const selectionTopViewport = selectionRectViewport.top;

      const menuWidth = menu.offsetWidth || 180;

      let menuLeftViewport = selectionCenterViewport - menuWidth / 2;
      let menuTopViewport = selectionTopViewport - MENU_HEIGHT - NOTCH_OFFSET;

      const margin = 10;

      if (menuLeftViewport < margin) {
        menuLeftViewport = margin;
      }
      if (menuLeftViewport + menuWidth > window.innerWidth - margin) {
        menuLeftViewport = window.innerWidth - menuWidth - margin;
      }

      if (menuTopViewport < margin) {
        menuTopViewport = margin;
      }

      const notchAbsoluteX = selectionCenterViewport;
      let notchRelativeX = notchAbsoluteX - menuLeftViewport;
      const cornerRadius = 12;
      const safeZone = cornerRadius + 6;
      notchRelativeX = Math.max(
        safeZone,
        Math.min(menuWidth - safeZone, notchRelativeX)
      );

      menu.style.left = `${menuLeftViewport}px`;
      menu.style.top = `${menuTopViewport}px`;

      if (!isFlatMode) {
        notch.classList.add("active");
        notch.style.left = `${notchRelativeX}px`;
      } else {
        notch.classList.remove("active");
      }
    },
    []
  );

  const renderPage = useCallback(
    (pageIndex: number, animateSlider: boolean = true) => {
      const slider = sliderRef.current;
      const menu = menuRef.current;
      if (
        !slider ||
        !menu ||
        !page1Ref.current ||
        !page2Ref.current ||
        !pageFlatRef.current
      )
        return;

      const p1W = page1Ref.current.offsetWidth;
      const p2W = page2Ref.current.offsetWidth;
      const pFlatW = pageFlatRef.current.offsetWidth;

      const widths = [p1W, p2W, pFlatW];
      let targetWidth = widths[0];
      let slideOffset = 0;

      if (pageIndex === 0) {
        targetWidth = widths[0];
        slideOffset = 0;
      } else if (pageIndex === 1) {
        targetWidth = widths[1];
        slideOffset = -widths[0];
      } else if (pageIndex === 2) {
        targetWidth = widths[2];
        slideOffset = -(widths[0] + widths[1]);
      }

      menu.style.width = `${targetWidth}px`;

      if (animateSlider) {
        slider.style.transition =
          "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";
      } else {
        slider.style.transition = "none";
      }
      slider.style.transform = `translateX(${slideOffset}px)`;
    },
    []
  );

  const showStandardMenu = useCallback(
    (selection: Selection) => {
      setMenuActive(true);

      const menu = menuRef.current;
      const notch = notchRef.current;
      if (!menu || !notch) return;

      menu.classList.remove("animating-layout");
      renderPage(0, false);

      const range = selection.getRangeAt(0);
      const getElementRect = (node: Node | null): DOMRect | null => {
        if (!node) return null;
        if (node.nodeType === Node.TEXT_NODE) {
          return node.parentElement?.getBoundingClientRect() || null;
        }
        return (node as Element).getBoundingClientRect();
      };

      const anchorRect = getElementRect(selection.anchorNode);
      const focusRect = getElementRect(selection.focusNode);
      let topY: number;
      if (anchorRect && focusRect) {
        topY = Math.min(anchorRect.top, focusRect.top);
      } else if (anchorRect) {
        topY = anchorRect.top;
      } else if (focusRect) {
        topY = focusRect.top;
      } else {
        topY = range.getBoundingClientRect().top;
      }
      const rects = Array.from(range.getClientRects());
      const tolerance = 50;
      const validRects = rects.filter((r) => {
        if (r.width === 0 || r.height === 0) return false;
        return (
          Math.abs(r.top - topY) < tolerance ||
          (r.top >= topY - tolerance && r.bottom <= topY + tolerance + 100)
        );
      });

      let left: number, width: number;
      if (validRects.length > 0) {
        left = Math.min(...validRects.map((r) => r.left));
        const right = Math.max(...validRects.map((r) => r.right));
        width = right - left;
      } else {
        const r = range.getBoundingClientRect();
        left = r.left;
        width = r.width;
      }

      const targetRect = {
        left,
        top: topY,
        width,
        height: 0,
      };

      positionMenu(targetRect, false);
      void menu.offsetWidth;
      requestAnimationFrame(() => {
        if (menuRef.current) menuRef.current.classList.add("active");
      });
    },
    [positionMenu, renderPage]
  );

  const switchPage = useCallback(
    (targetIndex: number) => {
      const menu = menuRef.current;
      const notch = notchRef.current;
      if (!menu || !notch) return;

      menu.classList.add("animating-layout");

      const oldWidth = parseFloat(menu.style.width) || menu.offsetWidth;
      const p1W = page1Ref.current?.offsetWidth || 0;
      const p2W = page2Ref.current?.offsetWidth || 0;

      let newWidth = 0;
      if (targetIndex === 0) newWidth = p1W;
      if (targetIndex === 1) newWidth = p2W;

      const widthDiff = newWidth - oldWidth;
      const currentLeft = parseFloat(menu.style.left) || 0;
      const newLeft = currentLeft - widthDiff / 2;

      const margin = 10;
      let clampedLeft = newLeft;
      if (clampedLeft < margin) clampedLeft = margin;
      if (clampedLeft + newWidth > window.innerWidth - margin) {
        clampedLeft = window.innerWidth - newWidth - margin;
      }

      menu.style.width = `${newWidth}px`;
      menu.style.left = `${clampedLeft}px`;

      const moveDelta = clampedLeft - currentLeft;
      const currentNotchLeft = parseFloat(notch.style.left) || 0;
      notch.style.left = `${currentNotchLeft - moveDelta}px`;

      renderPage(targetIndex, true);
    },
    [renderPage]
  );

  const triggerSelectAll = useCallback(() => {
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

    setIsSelectAllMode(true);
    const menu = menuRef.current;
    const wrap = imgWrapRef.current;
    if (!menu || !wrap) return;

    menu.classList.remove("animating-layout");
    renderPage(2, false);

    const wrapRect = wrap.getBoundingClientRect();
    const menuWidth = pageFlatRef.current?.offsetWidth || 250;

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

    menu.style.left = `${targetLeftViewport}px`;
    menu.style.top = `${targetTopViewport}px`;

    notchRef.current?.classList.remove("active");
  }, [data, size.h, renderPage]);

  const handleAction = useCallback(
    (action: string) => {
      if (action === "selectAll") {
        triggerSelectAll();
      } else {
        const text = getSelectedText();
        if (action === "copy") {
          if (text) navigator.clipboard.writeText(text);
        } else if (action === "search") {
          if (text)
            invoke("open_external_url", { url: generateSearchUrl(text) });
        } else if (action === "translate") {
          if (text)
            invoke("open_external_url", { url: generateTranslateUrl(text) });
        }
        hideMenu();
      }
    },
    [triggerSelectAll, hideMenu]
  );

  const handleSelection = useCallback(() => {
    if (isSelectAllMode) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (
      imgWrapRef.current &&
      selection?.anchorNode &&
      !imgWrapRef.current.contains(selection.anchorNode)
    ) {
      return;
    }

    if (!text || !selection?.rangeCount) {
      if (menuActive) hideMenu();
      return;
    }

    showStandardMenu(selection);
  }, [isSelectAllMode, menuActive, hideMenu, showStandardMenu]);

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

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setTimeout(() => handleSelection(), 10);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.includes("Arrow")) {
        setTimeout(() => handleSelection(), 10);
      }
    };

    const onResize = () => hideMenu();

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current && !menuRef.current.contains(target)) {
        if (!target.classList.contains("selectable-text")) {
          window.getSelection()?.removeAllRanges();
        }
        hideMenu();
      }
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuActive, isSelectAllMode, handleSelection, hideMenu]);

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
