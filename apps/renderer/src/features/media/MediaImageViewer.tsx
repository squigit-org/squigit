/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { platform } from "@/platform";
import { ZoomSlider } from "./components/ZoomSlider";
import type { MediaGalleryItem } from "./media.types";
import styles from "./MediaImageViewer.module.css";

interface MediaImageViewerProps {
  filePath: string;
  name: string;
  isGallery?: boolean;
  galleryItems?: MediaGalleryItem[];
  initialIndex?: number;
  onActiveItemChange?: (item: MediaGalleryItem) => void;
}

const MAX_ZOOM_FACTOR = 4;
const STAGE_INSET = 20;

interface ResolvedGalleryItem extends MediaGalleryItem {
  src: string;
}

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

type ImageDimensions = Size;

interface OutgoingFrame {
  src: string;
  name: string;
  size: Size;
  pan: Point;
  zoomScale: number;
}

const imageDecodeCache = new Map<
  string,
  Promise<ImageDimensions | null>
>();
const imageDimensionsCache = new Map<string, ImageDimensions>();

const decodeImage = (src: string): Promise<ImageDimensions | null> => {
  const cached = imageDecodeCache.get(src);
  if (cached) return cached;

  const pending = new Promise<ImageDimensions | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      imageDimensionsCache.set(src, dimensions);
      if (typeof image.decode === "function") {
        void image.decode().then(
          () => resolve(dimensions),
          () => resolve(dimensions),
        );
      } else {
        resolve(dimensions);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

  imageDecodeCache.set(src, pending);
  return pending;
};

const resolveMediaSource = (path: string) =>
  /^(?:https?:\/\/|data:)/iu.test(path) ? path : platform.convertFileSrc(path);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getWrappedIndex = (index: number, total: number) =>
  ((index % total) + total) % total;

export const MediaImageViewer: React.FC<MediaImageViewerProps> = ({
  filePath,
  name,
  isGallery = false,
  galleryItems,
  initialIndex,
  onActiveItemChange,
}) => {
  const resolvedGalleryItems = useMemo<ResolvedGalleryItem[]>(() => {
    const sourceItems =
      galleryItems && galleryItems.length > 0
        ? galleryItems
        : [
            {
              path: filePath,
              name,
              extension: "",
            },
          ];

    return sourceItems.map((item) => ({
      ...item,
      src: resolveMediaSource(item.path),
    }));
  }, [filePath, galleryItems, name]);

  const [activeIndex, setActiveIndex] = useState(() =>
    clamp(
      typeof initialIndex === "number" ? initialIndex : 0,
      0,
      Math.max(0, resolvedGalleryItems.length - 1),
    ),
  );
  const [zoomPosition, setZoomPosition] = useState(0);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<
    "previous" | "next"
  >("next");
  const [outgoingFrame, setOutgoingFrame] =
    useState<OutgoingFrame | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingIndexRef = useRef(activeIndex);
  const navigationRequestRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);

  const canUseGalleryNavigation =
    (isGallery || resolvedGalleryItems.length > 1) &&
    resolvedGalleryItems.length > 1;

  const activeItem = resolvedGalleryItems[activeIndex];
  const src = activeItem?.src || resolveMediaSource(filePath);
  const activeName = activeItem?.name || name;

  const fitScale = useMemo(() => {
    if (!naturalSize || stageSize.width <= 0 || stageSize.height <= 0) {
      return 1;
    }

    const availableWidth = Math.max(1, stageSize.width - STAGE_INSET * 2);
    const availableHeight = Math.max(1, stageSize.height - STAGE_INSET * 2);
    return Math.min(
      1,
      availableWidth / naturalSize.width,
      availableHeight / naturalSize.height,
    );
  }, [naturalSize, stageSize]);

  const maxRenderScale = Math.max(1, fitScale * MAX_ZOOM_FACTOR);
  const renderScale =
    fitScale + zoomPosition * (maxRenderScale - fitScale);

  const panLimits = useMemo<Point>(
    () => ({
      x: Math.max(
        0,
        ((naturalSize?.width || 0) * renderScale - stageSize.width) / 2,
      ),
      y: Math.max(
        0,
        ((naturalSize?.height || 0) * renderScale - stageSize.height) / 2,
      ),
    }),
    [naturalSize, renderScale, stageSize],
  );

  const clampPan = useCallback(
    (point: Point): Point => ({
      x: clamp(point.x, -panLimits.x, panLimits.x),
      y: clamp(point.y, -panLimits.y, panLimits.y),
    }),
    [panLimits],
  );

  const dragRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    panX: number;
    panY: number;
  }>({
    active: false,
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  useEffect(() => {
    const nextIndex = clamp(
      typeof initialIndex === "number" ? initialIndex : 0,
      0,
      Math.max(0, resolvedGalleryItems.length - 1),
    );
    navigationRequestRef.current += 1;
    setActiveIndex(nextIndex);
    pendingIndexRef.current = nextIndex;
    setOutgoingFrame(null);
  }, [filePath, initialIndex, resolvedGalleryItems.length]);

  useEffect(() => {
    setZoomPosition(0);
    setNaturalSize(imageDimensionsCache.get(src) || null);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    dragRef.current.active = false;

    let cancelled = false;
    void decodeImage(src).then((dimensions) => {
      if (!cancelled && dimensions) setNaturalSize(dimensions);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (resolvedGalleryItems.length < 2) return;
    for (const offset of [-2, -1, 1, 2]) {
      const index = getWrappedIndex(
        activeIndex + offset,
        resolvedGalleryItems.length,
      );
      void decodeImage(resolvedGalleryItems[index].src);
    }
  }, [activeIndex, resolvedGalleryItems]);

  useEffect(() => {
    thumbnailRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  useEffect(
    () => () => {
      navigationRequestRef.current += 1;
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeItem) onActiveItemChange?.(activeItem);
  }, [activeItem, onActiveItemChange]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateStageSize = () => {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    };

    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPan((current) => clampPan(current));
  }, [clampPan]);

  const goToIndex = useCallback(
    async (nextIndex: number, direction?: "previous" | "next") => {
      if (!canUseGalleryNavigation) return;
      const targetIndex = getWrappedIndex(
        nextIndex,
        resolvedGalleryItems.length,
      );
      if (targetIndex === activeIndex) {
        pendingIndexRef.current = targetIndex;
        navigationRequestRef.current += 1;
        return;
      }

      pendingIndexRef.current = targetIndex;
      const requestId = ++navigationRequestRef.current;
      const nextItem = resolvedGalleryItems[targetIndex];
      const dimensions = await decodeImage(nextItem.src);
      if (requestId !== navigationRequestRef.current) return;

      setOutgoingFrame({
        src,
        name: activeName,
        size: naturalSize || { width: 0, height: 0 },
        pan,
        zoomScale: renderScale,
      });
      setTransitionDirection(
        direction || (targetIndex > activeIndex ? "next" : "previous"),
      );
      if (dimensions) setNaturalSize(dimensions);
      setZoomPosition(0);
      setPan({ x: 0, y: 0 });
      setActiveIndex(targetIndex);

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = window.setTimeout(() => {
        setOutgoingFrame(null);
        transitionTimerRef.current = null;
      }, 220);
    },
    [
      activeIndex,
      activeName,
      canUseGalleryNavigation,
      naturalSize,
      pan,
      renderScale,
      resolvedGalleryItems,
      src,
    ],
  );

  const goToPrevious = useCallback(() => {
    if (!canUseGalleryNavigation) return;
    const nextIndex = getWrappedIndex(
      pendingIndexRef.current - 1,
      resolvedGalleryItems.length,
    );
    void goToIndex(nextIndex, "previous");
  }, [canUseGalleryNavigation, goToIndex, resolvedGalleryItems.length]);

  const goToNext = useCallback(() => {
    if (!canUseGalleryNavigation) return;
    const nextIndex = getWrappedIndex(
      pendingIndexRef.current + 1,
      resolvedGalleryItems.length,
    );
    void goToIndex(nextIndex, "next");
  }, [canUseGalleryNavigation, goToIndex, resolvedGalleryItems.length]);

  useEffect(() => {
    if (!canUseGalleryNavigation) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTypingTarget) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [canUseGalleryNavigation, goToNext, goToPrevious]);

  const clearSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) selection.removeAllRanges();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    clearSelection();
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;

    setPan(
      clampPan({
        x: dragRef.current.panX + event.clientX - dragRef.current.x,
        y: dragRef.current.panY + event.clientY - dragRef.current.y,
      }),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.04 : -0.04;
    setZoomPosition((current) => clamp(current + delta, 0, 1));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      clearSelection();
    }
  };

  return (
    <div
      className={styles.imageViewerRoot}
      data-gallery={canUseGalleryNavigation ? "true" : "false"}
    >
      <div className={styles.viewerStage}>
        <div
          ref={stageRef}
          className={styles.imageArea}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDragStart={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          {outgoingFrame && outgoingFrame.size.width > 0 && (
            <div
              className={styles.outgoingImageLayer}
              style={{
                left: `calc(50% + ${outgoingFrame.pan.x}px)`,
                top: `calc(50% + ${outgoingFrame.pan.y}px)`,
                width: outgoingFrame.size.width,
                height: outgoingFrame.size.height,
                transform: `translate(-50%, -50%) scale(${outgoingFrame.zoomScale})`,
              }}
            >
              <img
                src={outgoingFrame.src}
                alt={outgoingFrame.name}
                className={styles.previewImage}
                draggable={false}
              />
            </div>
          )}
          <div
            key={src}
            className={`${styles.imageTransformLayer} ${
              outgoingFrame
                ? transitionDirection === "next"
                  ? styles.imageEnterNext
                  : styles.imageEnterPrevious
                : ""
            }`}
            style={{
              left: `calc(50% + ${pan.x}px)`,
              top: `calc(50% + ${pan.y}px)`,
              width: naturalSize?.width,
              height: naturalSize?.height,
              transform: `translate(-50%, -50%) scale(${renderScale})`,
            }}
          >
            <img
              src={src}
              alt={activeName}
              className={styles.previewImage}
              draggable={false}
              onLoad={(event) => {
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
            />
          </div>
        </div>
        {canUseGalleryNavigation && (
          <>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navButtonLeft}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={goToPrevious}
              aria-label="Previous image"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navButtonRight}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={goToNext}
              aria-label="Next image"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {canUseGalleryNavigation && (
        <div
          className={styles.thumbnailStrip}
          role="tablist"
          aria-label="Gallery thumbnails"
        >
          {resolvedGalleryItems.map((item, index) => (
            <button
              key={`${item.path}-${index}`}
              ref={(element) => {
                thumbnailRefs.current[index] = element;
              }}
              type="button"
              className={`${styles.thumbnailButton} ${
                index === activeIndex ? styles.thumbnailButtonActive : ""
              }`}
              onClick={() => void goToIndex(index)}
              aria-label={`Open image ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
            >
              <img
                src={item.src}
                alt={item.name || `Image ${index + 1}`}
                className={styles.thumbnailImage}
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}

      <ZoomSlider value={zoomPosition} onChange={setZoomPosition} />
    </div>
  );
};
