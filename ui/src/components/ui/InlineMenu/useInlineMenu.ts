/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  generateSearchUrl,
  generateTranslateUrl,
} from "../../../features/google";

const MENU_HEIGHT = 48;
const NOTCH_OFFSET = 12;

interface UseInlineMenuOptions {
  /** Ref to the container element (for scoping text selection) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Custom handler for "Select All" action */
  onSelectAll?: () => void;
  /** Called when menu is shown */
  onMenuShow?: () => void;
  /** Called when menu is hidden */
  onMenuHide?: () => void;
}

export const useInlineMenu = ({
  containerRef,
  onSelectAll,
  onMenuShow,
  onMenuHide,
}: UseInlineMenuOptions) => {
  // Refs
  const menuRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const notchRef = useRef<SVGSVGElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const pageFlatRef = useRef<HTMLDivElement>(null);

  // State
  const [menuActive, setMenuActive] = useState(false);
  const [isSelectAllMode, setIsSelectAllMode] = useState(false);
  // Track when container is available (refs don't trigger re-renders)
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(
    null
  );

  // Sync containerElement with containerRef after every render
  useEffect(() => {
    // Check if ref has been populated and state needs updating
    if (containerRef.current && containerRef.current !== containerElement) {
      setContainerElement(containerRef.current);
    }
  });

  // Unique ID for this hook instance to handle global exclusivity
  const hookId = useRef(Math.random().toString(36).substr(2, 9)).current;

  // Helper functions
  const getSelectedText = useCallback(() => {
    return window.getSelection()?.toString().trim() || "";
  }, []);

  const hideMenu = useCallback(() => {
    if (menuRef.current) {
      menuRef.current.classList.remove("animating-layout");
      menuRef.current.classList.remove("active");
      if (notchRef.current) notchRef.current.classList.remove("active");
    }
    setMenuActive(false);
    setIsSelectAllMode(false);
    onMenuHide?.();
  }, [onMenuHide]);

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

  const positionMenu = useCallback(
    (
      selectionRectViewport: { left: number; width: number; top: number },
      showNotch: boolean = true
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

      if (showNotch) {
        notch.classList.add("active");
        notch.style.left = `${notchRelativeX}px`;
      } else {
        notch.classList.remove("active");
      }
    },
    []
  );

  const showStandardMenu = useCallback(
    (selection: Selection) => {
      setMenuActive(true);
      onMenuShow?.();

      // Notify other instances to close
      window.dispatchEvent(
        new CustomEvent("global-inline-menu-show", { detail: { id: hookId } })
      );

      const menu = menuRef.current;
      const notch = notchRef.current;
      if (!menu || !notch) return;

      menu.classList.remove("animating-layout");
      renderPage(0, false);

      const range = selection.getRangeAt(0);
      const rects = Array.from(range.getClientRects()).filter(
        (r) => r.width > 0 && r.height > 0
      );

      if (rects.length === 0) {
        // Fallback to bounding rect if no client rects
        const r = range.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;

        positionMenu(
          {
            left: r.left,
            top: r.top,
            width: r.width,
          },
          true
        );
      } else {
        // Calculate bounding box of the visual selection
        // Y position: Top of the first visual line (minimum top value)
        const topY = Math.min(...rects.map((r) => r.top));

        // X position: Full width of the visual selection
        const minLeft = Math.min(...rects.map((r) => r.left));
        const maxRight = Math.max(...rects.map((r) => r.right));
        const width = maxRight - minLeft;

        const targetRect = {
          left: minLeft,
          top: topY,
          width,
        };

        positionMenu(targetRect, true);
      }

      void menu.offsetWidth;
      requestAnimationFrame(() => {
        if (menuRef.current) menuRef.current.classList.add("active");
      });
    },
    [positionMenu, renderPage, onMenuShow, hookId]
  );

  const showFlatMenu = useCallback(
    (targetRect: { left: number; width: number; top: number }) => {
      setMenuActive(true);
      setIsSelectAllMode(true);
      onMenuShow?.();

      // Notify other instances to close
      window.dispatchEvent(
        new CustomEvent("global-inline-menu-show", { detail: { id: hookId } })
      );

      const menu = menuRef.current;
      if (!menu) return;

      menu.classList.remove("animating-layout");
      renderPage(2, false);

      positionMenu(targetRect, false);
      void menu.offsetWidth;
      requestAnimationFrame(() => {
        if (menuRef.current) menuRef.current.classList.add("active");
      });
    },
    [positionMenu, renderPage, onMenuShow, hookId]
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

  const handleAction = useCallback(
    (action: string) => {
      if (action === "selectAll") {
        if (onSelectAll) {
          onSelectAll();
        } else {
          // Default: just copy all selected text
          const text = getSelectedText();
          if (text) navigator.clipboard.writeText(text);
          hideMenu();
        }
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
    [hideMenu, onSelectAll, getSelectedText]
  );

  const handleSelection = useCallback(() => {
    if (isSelectAllMode) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    // Only handle selection within the container
    if (
      containerRef.current &&
      selection?.anchorNode &&
      !containerRef.current.contains(selection.anchorNode)
    ) {
      return;
    }

    if (!text || !selection?.rangeCount) {
      if (menuActive) hideMenu();
      return;
    }

    showStandardMenu(selection);
  }, [isSelectAllMode, menuActive, hideMenu, showStandardMenu, containerRef]);

  // Selection event listeners - only register when container exists
  useEffect(() => {
    // Global listener for exclusivity
    const onGlobalShow = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.id !== hookId && menuActive) {
        hideMenu();
      }
    };
    window.addEventListener("global-inline-menu-show", onGlobalShow);

    if (!containerElement) {
      return () =>
        window.removeEventListener("global-inline-menu-show", onGlobalShow);
    }

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
      // Only handle if click is within or targets the menu
      if (menuRef.current && !menuRef.current.contains(target)) {
        // Don't clear selection for selectable-text elements
        if (!target.classList.contains("selectable-text")) {
          // Clear selection logic...
          // If we click OUTSIDE the container, we should still hide the menu?
          // The user says "clicking somewhere not hiding the menu".
          // If I click inside Chat but Editor menu is open, Editor menu should hide.

          // If the click is NOT in our container, handleSelection logic usually ignores it.
          // But here we want to HIDE.
          if (menuActive) {
            // If we clicked outside the menu...
            hideMenu();
            // Should we also clear selection?
            if (containerElement.contains(target)) {
              window.getSelection()?.removeAllRanges();
            }
          }
        } else if (menuActive) {
          hideMenu();
        }
      }
    };

    // We need a GLOBAL mouse down to close menu if clicked completely outside container
    const onGlobalMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuActive && menuRef.current && !menuRef.current.contains(target)) {
        // If clicked outside container entirely
        if (!containerElement.contains(target)) {
          hideMenu();
        }
      }
    };

    // Scope mouseup to container only
    containerElement.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    // Use global mousedown for hiding?
    // The previous code had: containerElement.addEventListener("mousedown", onMouseDown);
    // If we only listen on container, clicks outside won't close it.
    // Let's use document for mousedown to catch all clicks.
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      window.removeEventListener("global-inline-menu-show", onGlobalShow);
      containerElement.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [
    menuActive,
    isSelectAllMode,
    handleSelection,
    hideMenu,
    containerElement,
    hookId,
  ]);

  return {
    // Refs for InlineMenu component
    menuRef,
    sliderRef,
    notchRef,
    page1Ref,
    page2Ref,
    pageFlatRef,
    // State
    menuActive,
    isSelectAllMode,
    // Actions
    hideMenu,
    showStandardMenu,
    showFlatMenu,
    handleAction,
    switchPage,
    getSelectedText,
    renderPage,
    positionMenu,
  };
};
