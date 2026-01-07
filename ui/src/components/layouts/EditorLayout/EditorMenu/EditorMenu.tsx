/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  generateSearchUrl,
  generateTranslateUrl,
} from "../../../../features/google";
import "./EditorMenu.css";

interface OCRBox {
  text: string;
  box: number[][];
}

interface EditorMenuProps {
  data: OCRBox[];
  size: { w: number; h: number };
  imgRef: React.RefObject<HTMLImageElement | null>;
  imgWrapRef: React.RefObject<HTMLDivElement | null>;
  viewerRef: React.RefObject<HTMLDivElement | null>;
}

export interface EditorMenuHandle {
  showStandardMenu: (selection: Selection) => void;
  hideMenu: () => void;
}

export const EditorMenu = forwardRef<EditorMenuHandle, EditorMenuProps>(
  ({ data, size, imgRef, imgWrapRef, viewerRef }, ref) => {
    const [menuActive, setMenuActive] = useState(false);
    const [isSelectAllMode, setIsSelectAllMode] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const sliderRef = useRef<HTMLDivElement>(null);
    const notchRef = useRef<SVGSVGElement>(null);
    const page1Ref = useRef<HTMLDivElement>(null);
    const page2Ref = useRef<HTMLDivElement>(null);
    const pageFlatRef = useRef<HTMLDivElement>(null);

    const NOTCH_OFFSET = 12;
    const MENU_HEIGHT = 48;

    const getSelectedText = () => {
      return window.getSelection()?.toString().trim() || "";
    };

    const hideMenu = useCallback(() => {
      if (menuRef.current) {
        menuRef.current.classList.remove("animating-layout");
        menuRef.current.classList.remove("active");
        if (notchRef.current) notchRef.current.classList.remove("active");
      }
      setMenuActive(false);
      setIsSelectAllMode(false);
    }, []);

    const positionMenu = useCallback(
      (
        selectionRectViewport: {
          left: number;
          width: number;
          top: number;
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
          targetTopViewport =
            imgRect.top + firstBoxY * scale - MENU_HEIGHT - 20;
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

      void menu.offsetWidth;
      requestAnimationFrame(() => {
        if (menuRef.current) menuRef.current.classList.add("active");
      });
    }, [data, size.h, imgRef, imgWrapRef, viewerRef, renderPage]);

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

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        showStandardMenu,
        hideMenu,
      }),
      [showStandardMenu, hideMenu]
    );

    // Event listeners
    useEffect(() => {
      const onMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (menuRef.current && !menuRef.current.contains(target)) {
          if (!target.classList.contains("selectable-text")) {
            window.getSelection()?.removeAllRanges();
          }
          hideMenu();
        }
      };

      const onResize = () => hideMenu();

      document.addEventListener("mousedown", onMouseDown);
      window.addEventListener("resize", onResize);

      return () => {
        document.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("resize", onResize);
      };
    }, [menuActive, isSelectAllMode, hideMenu]);

    return (
      <div id="editor-menu" ref={menuRef}>
        <div className="menu-slider" ref={sliderRef}>
          {/* Page 1: Copy, Select All, More */}
          <div className="menu-page" ref={page1Ref}>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("copy")}
            >
              Copy
            </div>
            <div className="divider"></div>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("selectAll")}
            >
              Select All
            </div>
            <div className="divider"></div>
            <div
              className="menu-item nav-arrow"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                switchPage(1);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>

          {/* Page 2: Back, Search, Translate */}
          <div className="menu-page" ref={page2Ref}>
            <div
              className="menu-item nav-arrow"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                switchPage(0);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </div>
            <div className="divider"></div>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("search")}
            >
              Search
            </div>
            <div className="divider"></div>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("translate")}
            >
              Translate
            </div>
          </div>

          {/* Flat Page: Copy, Search, Translate (for Select All mode) */}
          <div className="menu-page" ref={pageFlatRef}>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("copy")}
            >
              Copy
            </div>
            <div className="divider"></div>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("search")}
            >
              Search
            </div>
            <div className="divider"></div>
            <div
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAction("translate")}
            >
              Translate
            </div>
          </div>
        </div>

        <svg
          id="editor-menu-notch"
          viewBox="0 0 20 10"
          xmlns="http://www.w3.org/2000/svg"
          ref={notchRef}
        >
          <path d="M0 0 C4 0 6 2 10 10 C14 2 16 0 20 0 Z" />
        </svg>
      </div>
    );
  }
);

EditorMenu.displayName = "EditorMenu";
