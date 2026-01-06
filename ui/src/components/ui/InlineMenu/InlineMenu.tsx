/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface InlineMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  sliderRef: React.RefObject<HTMLDivElement | null>;
  notchRef: React.RefObject<SVGSVGElement | null>;
  page1Ref: React.RefObject<HTMLDivElement | null>;
  page2Ref: React.RefObject<HTMLDivElement | null>;
  pageFlatRef: React.RefObject<HTMLDivElement | null>;
  onAction: (action: string) => void;
  onSwitchPage: (pageIndex: number) => void;
}

export const InlineMenu: React.FC<InlineMenuProps> = ({
  menuRef,
  sliderRef,
  notchRef,
  page1Ref,
  page2Ref,
  pageFlatRef,
  onAction,
  onSwitchPage,
}) => {
  return (
    <div id="context-menu" ref={menuRef}>
      <div className="menu-slider" id="menu-slider" ref={sliderRef}>
        {/* Page 1: Copy, Select All, More */}
        <div className="menu-page" id="page-1" ref={page1Ref}>
          <div
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction("copy")}
          >
            Copy
          </div>
          <div className="divider"></div>
          <div
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction("selectAll")}
          >
            Select All
          </div>
          <div className="divider"></div>
          <div
            className="menu-item nav-arrow"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onSwitchPage(1);
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
        <div className="menu-page" id="page-2" ref={page2Ref}>
          <div
            className="menu-item nav-arrow"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onSwitchPage(0);
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
            onClick={() => onAction("search")}
          >
            Search
          </div>
          <div className="divider"></div>
          <div
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction("translate")}
          >
            Translate
          </div>
        </div>

        {/* Flat Page: Copy, Search, Translate (for Select All mode) */}
        <div className="menu-page" id="page-flat" ref={pageFlatRef}>
          <div
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction("copy")}
          >
            Copy
          </div>
          <div className="divider"></div>
          <div
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction("search")}
          >
            Search
          </div>
          <div className="divider"></div>
          <div
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction("translate")}
          >
            Translate
          </div>
        </div>
      </div>

      <svg
        id="notch"
        viewBox="0 0 20 10"
        xmlns="http://www.w3.org/2000/svg"
        ref={notchRef}
      >
        <path d="M0 0 C4 0 6 2 10 10 C14 2 16 0 20 0 Z" />
      </svg>
    </div>
  );
};
