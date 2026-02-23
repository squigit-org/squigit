/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { open } from "@tauri-apps/plugin-shell";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Attachment } from "./attachment.types";
import styles from "./AttachmentStrip.module.css";

// ─── Constants ─────────────────────────────────────────────────────────────

const MIN_THUMB_WIDTH = 30;

const EXT_COLORS: Record<string, string> = {
  // Documents
  pdf: "#e53e3e",
  doc: "#2b579a",
  docx: "#2b579a",
  xls: "#1d6f42",
  xlsx: "#1d6f42",
  ppt: "#d04423",
  pptx: "#d04423",
  rtf: "#6b7280",
  // Text / Code
  txt: "#d97706",
  md: "#4a5568",
  csv: "#065f46",
  json: "#a855f7",
  xml: "#c2410c",
  yaml: "#0ea5e9",
  yml: "#0ea5e9",
  html: "#e34c26",
  css: "#264de4",
  js: "#f7df1e",
  ts: "#3178c6",
  jsx: "#61dafb",
  tsx: "#61dafb",
  py: "#3776ab",
  rs: "#de4f00",
  go: "#00add8",
  java: "#f89820",
  c: "#555555",
  cpp: "#00599c",
  h: "#555555",
  hpp: "#00599c",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBadgeColor(ext: string): string {
  return EXT_COLORS[ext.toLowerCase()] ?? "#6b7280";
}

function getThumbGeometry(
  scrollWidth: number,
  clientWidth: number,
  scrollLeft: number,
) {
  const thumbWidth = Math.max(
    (clientWidth / scrollWidth) * clientWidth,
    MIN_THUMB_WIDTH,
  );
  const scrollableTrack = clientWidth - thumbWidth;
  const scrollableContent = scrollWidth - clientWidth;
  const thumbLeft =
    scrollableContent > 0
      ? (scrollLeft / scrollableContent) * scrollableTrack
      : 0;
  return { thumbWidth, thumbLeft, scrollableTrack, scrollableContent };
}

async function openInDefaultApp(path: string): Promise<void> {
  try {
    await open(path);
  } catch {
    try {
      window.open(convertFileSrc(path), "_blank");
    } catch {
      console.warn("[AttachmentStrip] Failed to open:", path);
    }
  }
}

async function resolveAbsPath(path: string): Promise<string> {
  const match = path.match(/^objects\/[^/]+\/([a-zA-Z0-9_-]+)\.[a-zA-Z0-9]+$/);
  if (!match?.[1]) return path;
  try {
    return await invoke<string>("get_image_path", { hash: match[1] });
  } catch {
    return path;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const FileThumbnail: React.FC<{ attachment: Attachment }> = ({
  attachment,
}) => (
  <div className={styles.fileThumb}>
    <div
      className={styles.fileExtBadge}
      style={{ backgroundColor: getBadgeColor(attachment.extension) }}
    >
      {attachment.extension.toUpperCase().slice(0, 4)}
    </div>
    <div className={styles.fileInfo}>
      <span className={styles.fileName}>{attachment.name}</span>
    </div>
  </div>
);

const ImageThumbnail: React.FC<{ attachment: Attachment }> = ({
  attachment,
}) => {
  const src = attachment.path.startsWith("http")
    ? attachment.path
    : convertFileSrc(attachment.path);

  return (
    <div className={styles.imageThumb}>
      <img src={src} alt={attachment.name} draggable={false} />
    </div>
  );
};

const RemoveButton: React.FC<{
  name: string;
  onRemove: (e: React.MouseEvent) => void;
}> = ({ name, onRemove }) => (
  <button
    className={styles.removeBtn}
    onClick={onRemove}
    aria-label={`Remove ${name}`}
  >
    <svg
      className={styles.cancelIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
);

// ─── Scrollbar thumb drag hook ───────────────────────────────────────────────

interface ScrollbarThumbProps {
  thumbWidth: number;
  thumbLeft: number;
  stripRef: React.RefObject<HTMLDivElement | null>;
  onScrollChange: () => void;
}

const ScrollbarThumb: React.FC<ScrollbarThumbProps> = ({
  thumbWidth,
  thumbLeft,
  stripRef,
  onScrollChange,
}) => {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = true;
      startX.current = e.clientX;
      scrollLeftStart.current = stripRef.current?.scrollLeft ?? 0;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault(); // prevent text selection while dragging
    },
    [stripRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current || !stripRef.current) return;
      const { scrollWidth, clientWidth } = stripRef.current;
      const { scrollableTrack, scrollableContent } = getThumbGeometry(
        scrollWidth,
        clientWidth,
        0,
      );

      if (scrollableTrack > 0) {
        const deltaX = e.clientX - startX.current;
        stripRef.current.scrollLeft =
          scrollLeftStart.current +
          deltaX * (scrollableContent / scrollableTrack);
        onScrollChange();
      }
    },
    [stripRef, onScrollChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [],
  );

  return (
    <div className={styles.scrollbarTrack}>
      <div
        className={styles.scrollbarThumb}
        style={{ width: thumbWidth, transform: `translateX(${thumbLeft}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};

// ─── AttachmentStrip ─────────────────────────────────────────────────────────

export interface AttachmentStripProps {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  onClick?: (attachment: Attachment) => void;
  readOnly?: boolean;
}

interface ScrollState {
  canScroll: boolean;
  thumbWidth: number;
  thumbLeft: number;
}

const INITIAL_SCROLL_STATE: ScrollState = {
  canScroll: false,
  thumbWidth: 0,
  thumbLeft: 0,
};

export const AttachmentStrip: React.FC<AttachmentStripProps> = ({
  attachments,
  onRemove,
  onClick,
  readOnly = false,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] =
    useState<ScrollState>(INITIAL_SCROLL_STATE);

  const updateScroll = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;

    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth) {
      setScrollState((prev) =>
        prev.canScroll === false ? prev : INITIAL_SCROLL_STATE,
      );
      return;
    }

    const { thumbWidth, thumbLeft } = getThumbGeometry(
      scrollWidth,
      clientWidth,
      scrollLeft,
    );
    setScrollState((prev) => {
      if (
        prev.canScroll === true &&
        prev.thumbWidth === thumbWidth &&
        prev.thumbLeft === thumbLeft
      ) {
        return prev;
      }
      return { canScroll: true, thumbWidth, thumbLeft };
    });
  }, []);

  // Measure synchronously after DOM mutations so the thumb is visible on first render.
  useLayoutEffect(() => {
    updateScroll();
  }, [updateScroll, attachments]);

  // Wire up resize + wheel listeners.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    const observer = new ResizeObserver(updateScroll);
    observer.observe(el);

    const handleWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;

      const prev = el.scrollLeft;
      el.scrollLeft += delta;
      if (el.scrollLeft !== prev) e.preventDefault();
      updateScroll();
    };

    window.addEventListener("resize", updateScroll);
    el.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScroll);
      el.removeEventListener("wheel", handleWheel);
    };
  }, [updateScroll]);

  const handleClick = useCallback(
    async (attachment: Attachment) => {
      if (onClick) {
        onClick(attachment);
        return;
      }
      const absPath = attachment.path.startsWith("objects/")
        ? await resolveAbsPath(attachment.path)
        : attachment.path;
      openInDefaultApp(absPath);
    },
    [onClick],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onRemove?.(id);
    },
    [onRemove],
  );

  if (attachments.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.strip} ref={stripRef} onScroll={updateScroll}>
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className={styles.thumbWrapper}
            onClick={() => handleClick(attachment)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleClick(attachment);
            }}
          >
            {attachment.type === "image" ? (
              <ImageThumbnail attachment={attachment} />
            ) : (
              <FileThumbnail attachment={attachment} />
            )}

            {!readOnly && onRemove && (
              <RemoveButton
                name={attachment.name}
                onRemove={(e) => handleRemove(e, attachment.id)}
              />
            )}
          </div>
        ))}
      </div>

      {scrollState.canScroll && (
        <ScrollbarThumb
          thumbWidth={scrollState.thumbWidth}
          thumbLeft={scrollState.thumbLeft}
          stripRef={stripRef}
          onScrollChange={updateScroll}
        />
      )}
    </div>
  );
};
