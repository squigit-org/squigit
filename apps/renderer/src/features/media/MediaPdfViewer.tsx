/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { platform } from "@/platform";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist/types/src/display/api";
import { ZoomSlider } from "./components/ZoomSlider";
import styles from "./MediaPdfViewer.module.css";

interface MediaPdfViewerProps {
  filePath: string;
  isOpen: boolean;
}

interface Size {
  width: number;
  height: number;
}

const MAX_ZOOM_SCALE = 3;
const PAGE_GAP = 14;
const QUALITY_RENDER_DELAY_MS = 180;
const MAX_CANVAS_DIMENSION = 4096;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const MediaPdfViewer: React.FC<MediaPdfViewerProps> = ({
  filePath,
  isOpen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderGenerationRef = useRef(0);
  const hasRenderedRef = useRef(false);
  const previousZoomScaleRef = useRef(1);
  const scrollFrameRef = useRef<number | null>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const isCancellingPageEditRef = useRef(false);
  const navigationTargetRef = useRef<number | null>(null);
  const pageHoldTimeoutRef = useRef<number | null>(null);
  const pageHoldIntervalRef = useRef<number | null>(null);
  const didTriggerPageHoldRef = useRef(false);
  const dragRef = useRef({
    active: false,
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [renderedSize, setRenderedSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const [zoomPosition, setZoomPosition] = useState(0);

  const zoomScale = 1 + zoomPosition * (MAX_ZOOM_SCALE - 1);

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    const updateViewportWidth = () => setViewportWidth(scrollArea.clientWidth);
    updateViewportWidth();

    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(scrollArea);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pagesEl = pagesRef.current;
    const scrollArea = scrollRef.current;
    if (!isOpen || !pagesEl || !scrollArea) return;

    let cancelled = false;
    const loadingTask = getDocument({
      url: platform.convertFileSrc(filePath),
      isEvalSupported: false,
    });

    renderGenerationRef.current += 1;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    documentRef.current = null;
    hasRenderedRef.current = false;
    previousZoomScaleRef.current = 1;
    navigationTargetRef.current = null;
    dragRef.current.active = false;

    setIsDragging(false);
    setIsInitialLoading(true);
    setError(null);
    setPageCount(0);
    setCurrentPage(1);
    setIsEditingPage(false);
    setPageInput("1");
    setRenderedSize({ width: 0, height: 0 });
    setZoomPosition(0);
    pagesEl.replaceChildren();
    scrollArea.scrollLeft = 0;
    scrollArea.scrollTop = 0;

    void loadingTask.promise
      .then((pdf) => {
        if (cancelled) return;
        documentRef.current = pdf;
        setPageCount(pdf.numPages);
        setDocumentRevision((revision) => revision + 1);
      })
      .catch((pdfError: unknown) => {
        if (cancelled) return;
        console.error("[MediaOverlay] Failed to load PDF:", pdfError);
        setError("Failed to load PDF preview.");
        setIsInitialLoading(false);
      });

    return () => {
      cancelled = true;
      renderGenerationRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      documentRef.current = null;
      hasRenderedRef.current = false;
      void loadingTask.destroy();
      pagesEl.replaceChildren();
    };
  }, [filePath, isOpen]);

  useEffect(() => {
    const pdf = documentRef.current;
    const pagesEl = pagesRef.current;
    if (!isOpen || !pdf || !pagesEl || viewportWidth <= 0) return;

    let cancelled = false;
    const generation = ++renderGenerationRef.current;
    const isFirstRender = !hasRenderedRef.current;
    const delay = isFirstRender ? 0 : QUALITY_RENDER_DELAY_MS;

    const renderPdf = async () => {
      try {
        const fragment = document.createDocumentFragment();
        const baseWidth = Math.max(1, viewportWidth - 28);
        const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
        let totalHeight = 0;
        let widestPage = 0;
        let renderedPages = 0;

        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
          if (cancelled || generation !== renderGenerationRef.current) return;

          const page = await pdf.getPage(pageIndex);
          const viewportAtOne = page.getViewport({ scale: 1 });
          const cssScale = baseWidth / viewportAtOne.width;
          const cssViewport = page.getViewport({ scale: cssScale });

          const requestedRenderScale = cssScale * zoomScale;
          const requestedViewport = page.getViewport({
            scale: requestedRenderScale,
          });
          const dimensionLimit = Math.min(
            1,
            MAX_CANVAS_DIMENSION / (requestedViewport.width * deviceScale),
            MAX_CANVAS_DIMENSION / (requestedViewport.height * deviceScale),
          );
          const renderViewport = page.getViewport({
            scale: requestedRenderScale * dimensionLimit,
          });

          const pageWrap = document.createElement("div");
          pageWrap.className = styles.pdfPage;
          pageWrap.style.width = `${cssViewport.width}px`;
          pageWrap.style.height = `${cssViewport.height}px`;

          const canvas = document.createElement("canvas");
          canvas.className = styles.pdfCanvas;
          canvas.width = Math.max(
            1,
            Math.floor(renderViewport.width * deviceScale),
          );
          canvas.height = Math.max(
            1,
            Math.floor(renderViewport.height * deviceScale),
          );
          canvas.style.width = `${cssViewport.width}px`;
          canvas.style.height = `${cssViewport.height}px`;

          const context = canvas.getContext("2d");
          if (!context) continue;

          pageWrap.appendChild(canvas);
          fragment.appendChild(pageWrap);

          const renderTask = page.render({
            canvas,
            canvasContext: context,
            viewport: renderViewport,
            transform:
              deviceScale === 1
                ? undefined
                : [deviceScale, 0, 0, deviceScale, 0, 0],
          });
          renderTaskRef.current = renderTask;
          await renderTask.promise;
          renderTaskRef.current = null;

          widestPage = Math.max(widestPage, cssViewport.width);
          totalHeight += cssViewport.height;
          renderedPages += 1;
        }

        if (cancelled || generation !== renderGenerationRef.current) return;

        totalHeight += Math.max(0, renderedPages - 1) * PAGE_GAP;
        pagesEl.replaceChildren(fragment);
        setRenderedSize({ width: widestPage, height: totalHeight });
        hasRenderedRef.current = true;
        setCurrentPage((page) => clamp(page, 1, pdf.numPages));
        setIsInitialLoading(false);
      } catch (pdfError) {
        const wasCancelled =
          cancelled ||
          generation !== renderGenerationRef.current ||
          (pdfError instanceof Error &&
            pdfError.name === "RenderingCancelledException");
        if (wasCancelled) return;

        if (isFirstRender) {
          console.error("[MediaOverlay] Failed to render PDF:", pdfError);
          setError("Failed to load PDF preview.");
          setIsInitialLoading(false);
        } else {
          console.warn("[MediaOverlay] PDF quality refresh failed:", pdfError);
        }
      }
    };

    const timeout = window.setTimeout(() => void renderPdf(), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (generation === renderGenerationRef.current) {
        renderTaskRef.current?.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [documentRevision, isOpen, viewportWidth, zoomScale]);

  useLayoutEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    const previousScale = previousZoomScaleRef.current;
    if (previousScale === zoomScale) return;

    navigationTargetRef.current = null;
    const scaleRatio = zoomScale / previousScale;
    scrollArea.scrollLeft =
      (scrollArea.scrollLeft + scrollArea.clientWidth / 2) * scaleRatio -
      scrollArea.clientWidth / 2;
    scrollArea.scrollTop =
      (scrollArea.scrollTop + scrollArea.clientHeight / 2) * scaleRatio -
      scrollArea.clientHeight / 2;
    previousZoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  useEffect(() => {
    if (isEditingPage) {
      pageInputRef.current?.focus();
      pageInputRef.current?.select();
      return;
    }

    setPageInput(String(currentPage));
  }, [currentPage, isEditingPage]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      if (pageHoldTimeoutRef.current !== null) {
        window.clearTimeout(pageHoldTimeoutRef.current);
      }
      if (pageHoldIntervalRef.current !== null) {
        window.clearInterval(pageHoldIntervalRef.current);
      }
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollArea = scrollRef.current;
    if (!scrollArea || event.button !== 0) return;

    navigationTargetRef.current = null;

    const bounds = scrollArea.getBoundingClientRect();
    const isOnVerticalScrollbar =
      event.clientX > bounds.left + scrollArea.clientWidth;
    const isOnHorizontalScrollbar =
      event.clientY > bounds.top + scrollArea.clientHeight;
    if (isOnVerticalScrollbar || isOnHorizontalScrollbar) return;

    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollArea.scrollLeft,
      scrollTop: scrollArea.scrollTop,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollArea = scrollRef.current;
    if (!scrollArea || !dragRef.current.active) return;

    scrollArea.scrollLeft =
      dragRef.current.scrollLeft - (event.clientX - dragRef.current.x);
    scrollArea.scrollTop =
      dragRef.current.scrollTop - (event.clientY - dragRef.current.y);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    navigationTargetRef.current = null;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.04 : -0.04;
    setZoomPosition((current) => clamp(current + delta, 0, 1));
  };

  const updateCurrentPage = () => {
    const scrollArea = scrollRef.current;
    const pagesEl = pagesRef.current;
    if (!scrollArea || !pagesEl || pagesEl.children.length === 0) return;

    const viewportTop = scrollArea.scrollTop;
    const viewportBottom = viewportTop + scrollArea.clientHeight;

    const navigationTarget = navigationTargetRef.current;
    if (navigationTarget !== null) {
      const targetPage = pagesEl.children.item(
        navigationTarget - 1,
      ) as HTMLElement | null;
      if (targetPage) {
        const targetTop = Math.min(
          14 + targetPage.offsetTop * zoomScale,
          scrollArea.scrollHeight - scrollArea.clientHeight,
        );
        if (Math.abs(viewportTop - targetTop) <= 2) {
          navigationTargetRef.current = null;
        } else {
          return;
        }
      }
    }

    let mostVisiblePage = 1;
    let largestVisibleArea = -1;

    Array.from(pagesEl.children).forEach((child, index) => {
      const page = child as HTMLElement;
      const pageTop = 14 + page.offsetTop * zoomScale;
      const pageBottom = pageTop + page.offsetHeight * zoomScale;
      const visibleArea = Math.max(
        0,
        Math.min(viewportBottom, pageBottom) - Math.max(viewportTop, pageTop),
      );

      if (visibleArea > largestVisibleArea) {
        largestVisibleArea = visibleArea;
        mostVisiblePage = index + 1;
      }
    });

    setCurrentPage((page) =>
      page === mostVisiblePage ? page : mostVisiblePage,
    );
  };

  const handleScroll = () => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateCurrentPage();
    });
  };

  const goToPage = (pageNumber: number) => {
    const scrollArea = scrollRef.current;
    const pagesEl = pagesRef.current;
    if (!scrollArea || !pagesEl || pageCount === 0) return;

    const nextPage = clamp(pageNumber, 1, pageCount);
    const page = pagesEl.children.item(nextPage - 1) as HTMLElement | null;
    if (!page) return;

    navigationTargetRef.current = nextPage;
    setCurrentPage(nextPage);
    scrollArea.scrollTo({
      top: 14 + page.offsetTop * zoomScale,
      behavior: "smooth",
    });
  };

  const stopPageHold = () => {
    if (pageHoldTimeoutRef.current !== null) {
      window.clearTimeout(pageHoldTimeoutRef.current);
      pageHoldTimeoutRef.current = null;
    }
    if (pageHoldIntervalRef.current !== null) {
      window.clearInterval(pageHoldIntervalRef.current);
      pageHoldIntervalRef.current = null;
    }
  };

  const startPageHold = (
    direction: -1 | 1,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;

    stopPageHold();
    didTriggerPageHoldRef.current = false;
    let nextPage = currentPage;

    pageHoldTimeoutRef.current = window.setTimeout(() => {
      didTriggerPageHoldRef.current = true;

      const advance = () => {
        const candidate = clamp(nextPage + direction, 1, pageCount);
        if (candidate === nextPage) {
          stopPageHold();
          return;
        }
        nextPage = candidate;
        goToPage(nextPage);
      };

      advance();
      pageHoldIntervalRef.current = window.setInterval(advance, 160);
    }, 350);
  };

  const handlePageButtonClick = (direction: -1 | 1) => {
    if (didTriggerPageHoldRef.current) {
      didTriggerPageHoldRef.current = false;
      return;
    }
    goToPage(currentPage + direction);
  };

  const beginPageEdit = () => {
    isCancellingPageEditRef.current = false;
    setPageInput(String(currentPage));
    setIsEditingPage(true);
  };

  const submitPageEdit = () => {
    const requestedPage = Number.parseInt(pageInput, 10);
    const nextPage = Number.isFinite(requestedPage)
      ? clamp(requestedPage, 1, pageCount)
      : currentPage;

    setPageInput(String(nextPage));
    setIsEditingPage(false);
    if (nextPage !== currentPage) goToPage(nextPage);
  };

  const cancelPageEdit = () => {
    isCancellingPageEditRef.current = true;
    setPageInput(String(currentPage));
    setIsEditingPage(false);
  };

  return (
    <div className={styles.pdfViewer} ref={containerRef}>
      {isInitialLoading && (
        <div className={styles.loadingText}>Loading PDF...</div>
      )}
      {error && <div className={styles.errorText}>{error}</div>}
      {!isInitialLoading && !error && pageCount > 0 && (
        <div className={styles.metaBar}>
          <div
            className={styles.pageCounter}
            style={{ width: `${String(pageCount).length * 2 + 3}ch` }}
          >
            {isEditingPage ? (
              <input
                ref={pageInputRef}
                className={styles.pageInput}
                value={pageInput}
                inputMode="numeric"
                aria-label="Current PDF page"
                style={{ width: `${Math.max(1, String(pageCount).length)}ch` }}
                onChange={(event) =>
                  setPageInput(event.currentTarget.value.replace(/\D/gu, ""))
                }
                onBlur={() => {
                  if (isCancellingPageEditRef.current) {
                    isCancellingPageEditRef.current = false;
                    return;
                  }
                  submitPageEdit();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    submitPageEdit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelPageEdit();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <button
                type="button"
                className={styles.currentPageButton}
                aria-label="Edit current PDF page"
                onClick={beginPageEdit}
              >
                {currentPage}
              </button>
            )}
            <span className={styles.pageTotal}>/ {pageCount}</span>
          </div>
          <div className={styles.pageNavigation}>
            <button
              type="button"
              className={styles.pageButton}
              aria-label="Previous PDF page"
              disabled={currentPage <= 1}
              onPointerDown={(event) => startPageHold(-1, event)}
              onPointerUp={stopPageHold}
              onPointerCancel={stopPageHold}
              onPointerLeave={stopPageHold}
              onClick={() => handlePageButtonClick(-1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className={styles.pageButton}
              aria-label="Next PDF page"
              disabled={currentPage >= pageCount}
              onPointerDown={(event) => startPageHold(1, event)}
              onPointerUp={stopPageHold}
              onPointerCancel={stopPageHold}
              onPointerLeave={stopPageHold}
              onClick={() => handlePageButtonClick(1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        className={styles.pdfPages}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onScroll={handleScroll}
        onDragStart={(event) => event.preventDefault()}
      >
        <div
          className={styles.zoomSurface}
          style={{
            width: renderedSize.width * zoomScale,
            height: renderedSize.height * zoomScale,
          }}
        >
          <div
            ref={pagesRef}
            className={styles.pdfPagesContent}
            style={{ transform: `scale(${zoomScale})` }}
          />
        </div>
      </div>
      <ZoomSlider
        className={styles.zoomControl}
        value={zoomPosition}
        onChange={setZoomPosition}
      />
    </div>
  );
};
