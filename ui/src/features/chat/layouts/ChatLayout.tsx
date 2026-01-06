/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { Message, ChatHeader, ChatArea, ChatInput } from "..";
import { InlineMenu } from "../../../components/ui";
import { generateSearchUrl, generateTranslateUrl } from "../../google";
import "katex/dist/katex.min.css";
import "./ChatLayout.module.css";

export interface ChatLayoutProps {
  messages: Message[];
  streamingText: string;
  isChatMode: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  lastSentMessage: Message | null;

  input: string;
  currentModel: string;

  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;

  chatTitle: string;

  onSend: () => void;
  onModelChange: (model: string) => void;
  onRetry: () => void;
  onInputChange: (value: string) => void;
  onCheckSettings: () => void;
  onReload?: () => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  messages,
  streamingText,
  isChatMode,
  isLoading,
  isStreaming,
  error,
  input,
  currentModel,
  startupImage,
  chatTitle,
  onSend,
  onModelChange,
  onRetry,
  onInputChange,
  onCheckSettings,
  onReload,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  // --- Inline Menu State & Refs ---
  const menuRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const notchRef = useRef<SVGSVGElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const pageFlatRef = useRef<HTMLDivElement>(null);
  const [menuActive, setMenuActive] = useState(false);

  const MENU_HEIGHT = 48;
  const NOTCH_OFFSET = 12;

  useEffect(() => {
    if (!isLoading) {
      setIsRotating(false);
    }
  }, [isLoading]);

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (messages.length > 0) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, isStreaming]);

  // --- Inline Menu Logic ---
  const getSelectedText = () => window.getSelection()?.toString().trim() || "";

  const hideMenu = useCallback(() => {
    if (menuRef.current) {
      menuRef.current.classList.remove("animating-layout", "active");
      notchRef.current?.classList.remove("active");
    }
    setMenuActive(false);
  }, []);

  const renderPage = useCallback((pageIndex: number, animate = true) => {
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

    const widths = [
      page1Ref.current.offsetWidth,
      page2Ref.current.offsetWidth,
      pageFlatRef.current.offsetWidth,
    ];

    let targetWidth = widths[0];
    let slideOffset = 0;
    if (pageIndex === 1) {
      targetWidth = widths[1];
      slideOffset = -widths[0];
    } else if (pageIndex === 2) {
      targetWidth = widths[2];
      slideOffset = -(widths[0] + widths[1]);
    }

    menu.style.width = `${targetWidth}px`;
    slider.style.transition = animate
      ? "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)"
      : "none";
    slider.style.transform = `translateX(${slideOffset}px)`;
  }, []);

  const positionMenu = useCallback(
    (rect: { left: number; width: number; top: number }) => {
      const menu = menuRef.current;
      const notch = notchRef.current;
      if (!menu || !notch) return;

      const centerX = rect.left + rect.width / 2;
      const menuWidth = menu.offsetWidth || 180;
      const margin = 10;

      let menuLeft = centerX - menuWidth / 2;
      let menuTop = rect.top - MENU_HEIGHT - NOTCH_OFFSET;

      if (menuLeft < margin) menuLeft = margin;
      if (menuLeft + menuWidth > window.innerWidth - margin) {
        menuLeft = window.innerWidth - menuWidth - margin;
      }
      if (menuTop < margin) menuTop = margin;

      menu.style.left = `${menuLeft}px`;
      menu.style.top = `${menuTop}px`;

      const notchX = Math.max(18, Math.min(menuWidth - 18, centerX - menuLeft));
      notch.classList.add("active");
      notch.style.left = `${notchX}px`;
    },
    []
  );

  const showMenu = useCallback(
    (selection: Selection) => {
      setMenuActive(true);
      const menu = menuRef.current;
      if (!menu) return;

      menu.classList.remove("animating-layout");
      renderPage(0, false);

      const range = selection.getRangeAt(0);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) return;

      const topY = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));

      positionMenu({ left, top: topY, width: right - left });
      requestAnimationFrame(() => menu.classList.add("active"));
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
      const newWidth =
        targetIndex === 0
          ? page1Ref.current?.offsetWidth || 0
          : page2Ref.current?.offsetWidth || 0;

      const currentLeft = parseFloat(menu.style.left) || 0;
      let newLeft = currentLeft - (newWidth - oldWidth) / 2;

      const margin = 10;
      newLeft = Math.max(
        margin,
        Math.min(window.innerWidth - newWidth - margin, newLeft)
      );

      menu.style.width = `${newWidth}px`;
      menu.style.left = `${newLeft}px`;
      notch.style.left = `${
        parseFloat(notch.style.left) - (newLeft - currentLeft)
      }px`;

      renderPage(targetIndex, true);
    },
    [renderPage]
  );

  const handleAction = useCallback(
    (action: string) => {
      const text = getSelectedText();
      if (action === "copy") {
        if (text) navigator.clipboard.writeText(text);
      } else if (action === "selectAll") {
        if (text) navigator.clipboard.writeText(text);
      } else if (action === "search") {
        if (text) invoke("open_external_url", { url: generateSearchUrl(text) });
      } else if (action === "translate") {
        if (text)
          invoke("open_external_url", { url: generateTranslateUrl(text) });
      }
      hideMenu();
    },
    [hideMenu]
  );

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    // Only handle if selection is in chat area
    if (!scrollContainerRef.current || !selection?.anchorNode) return;
    if (!scrollContainerRef.current.contains(selection.anchorNode)) return;

    if (!text || !selection.rangeCount) {
      if (menuActive) hideMenu();
      return;
    }

    showMenu(selection);
  }, [menuActive, hideMenu, showMenu]);

  // Event listeners
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onMouseUp = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setTimeout(handleSelection, 10);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (menuActive) hideMenu();
    };

    container.addEventListener("mouseup", onMouseUp);
    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", hideMenu);

    return () => {
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", hideMenu);
    };
  }, [menuActive, handleSelection, hideMenu]);

  const handleReload = () => {
    if (onReload) {
      setIsRotating(true);
      onReload();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100">
      <ChatHeader
        chatTitle={chatTitle}
        onReload={handleReload}
        isRotating={isRotating}
        currentModel={currentModel}
        onModelChange={onModelChange}
        isLoading={isLoading}
      />

      <ChatArea
        ref={scrollContainerRef}
        startupImage={startupImage}
        isChatMode={isChatMode}
        isLoading={isLoading}
        streamingText={streamingText}
        error={error}
        onCheckSettings={onCheckSettings}
        onRetry={onRetry}
        prompt={""}
        showUpdate={showUpdate}
        setShowUpdate={setShowUpdate}
        messages={messages}
      />

      <ChatInput
        startupImage={startupImage}
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        isLoading={isLoading}
      />

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
    </div>
  );
};
