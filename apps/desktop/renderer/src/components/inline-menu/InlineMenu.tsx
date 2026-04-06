/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { InlineChevronLeft, InlineChevronRight } from "@/assets";
import styles from "./InlineMenu.module.css";

interface InlineMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  sliderRef: React.RefObject<HTMLDivElement | null>;
  page1Ref: React.RefObject<HTMLDivElement | null>;
  page2Ref: React.RefObject<HTMLDivElement | null>;
  pageFlatRef: React.RefObject<HTMLDivElement | null>;
  onAction: (action: string) => void;
  onSwitchPage: (pageIndex: number) => void;
}

export const InlineMenu: React.FC<
  InlineMenuProps & { id?: string; className?: string }
> = ({
  menuRef,
  sliderRef,
  page1Ref,
  page2Ref,
  pageFlatRef,
  onAction,
  onSwitchPage,
  id,
  className,
}) => {
  return (
    <div
      id={id}
      className={`${styles.menu} ${className || ""}`}
      ref={menuRef}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className={styles.menuSlider} ref={sliderRef}>
        <div className={styles.menuPage} ref={page1Ref}>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("copy");
            }}
          >
            Copy
          </div>
          <div className={styles.divider}></div>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("selectAll");
            }}
          >
            Select All
          </div>
          <div className={styles.divider}></div>
          <div
            className={`${styles.menuItem} ${styles.navArrow}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onSwitchPage(1);
            }}
          >
            <InlineChevronRight size={20} />
          </div>
        </div>

        <div className={styles.menuPage} ref={page2Ref}>
          <div
            className={`${styles.menuItem} ${styles.navArrow}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onSwitchPage(0);
            }}
          >
            <InlineChevronLeft size={20} />
          </div>
          <div className={styles.divider}></div>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("search");
            }}
          >
            Search
          </div>
          <div className={styles.divider}></div>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("translate");
            }}
          >
            Translate
          </div>
        </div>

        <div className={styles.menuPage} ref={pageFlatRef}>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("copy");
            }}
          >
            Copy
          </div>
          <div className={styles.divider}></div>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("search");
            }}
          >
            Search
          </div>
          <div className={styles.divider}></div>
          <div
            className={styles.menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onAction("translate");
            }}
          >
            Translate
          </div>
        </div>
      </div>
    </div>
  );
};
