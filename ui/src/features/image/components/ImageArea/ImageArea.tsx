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
  RefObject,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useGoogleLens } from "../../hooks/useGoogleLens";
import { useTextSelection } from "../../hooks/useTextSelection";
import { ActionMenu, ActionMenuHandle } from "../OCRLayer/ActionMenu";
import { ChatInput } from "../InlineInput/InlineInput";
import { TextLayer } from "../OCRLayer/TextLayer";
import { ImageToolbar } from "../ImageToolbar";
import styles from "./ImageArea.module.css";

interface OCRBox {
  text: string;
  box_coords: number[][];
  confidence?: number;
}

interface ImageAreaProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string) => void;
  chatTitle: string;
  onDescribeEdits: (description: string) => void;
  isVisible: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export const ImageArea: React.FC<ImageAreaProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  chatTitle,
  onDescribeEdits,
  isVisible,
  scrollContainerRef,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [data, setData] = useState<{ text: string; box: number[][] }[]>([]);
  const [loading, setLoading] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });

  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const expandedContentRef = useRef<HTMLDivElement>(null);
  const ActionMenuRef = useRef<ActionMenuHandle>(null);

  const imageSrc = startupImage?.base64 || "";

  const { isLensLoading, triggerLens } = useGoogleLens(
    startupImage,
    sessionLensUrl,
    setSessionLensUrl,
  );

  const { svgRef, handleTextMouseDown } = useTextSelection({
    data,
    onSelectionComplete: (selection) => {
      ActionMenuRef.current?.showStandardMenu(selection);
    },
  });

  const scan = useCallback(async () => {
    if (!startupImage?.base64) return;

    setLoading(true);
    setError("");

    try {
      let imageData: string;
      let isBase64: boolean;

      if (
        startupImage.isFilePath &&
        startupImage.base64.startsWith("asset://")
      ) {
        imageData = decodeURIComponent(
          startupImage.base64.replace("asset://localhost", ""),
        );
        isBase64 = false;
      } else {
        imageData = startupImage.base64;
        isBase64 = true;
      }

      const results = await invoke<OCRBox[]>("ocr_image", {
        imageData,
        isBase64,
      });

      const converted = results.map((r) => ({
        text: r.text,
        box: r.box_coords,
      }));

      setData(converted);
      setShowOverlay(false);
      setIsExpanded(true);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setShowOverlay(false);
    } finally {
      setLoading(false);
    }
  }, [startupImage]);

  useEffect(() => {
    if (startupImage) {
      scan();
    }
  }, [startupImage, scan]);

  const isScrollBlockedRef = useRef(false);
  const wheelEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!isExpanded && !isScrollBlockedRef.current) return;

      const scrollContainer = scrollWrapperRef.current;
      const target = e.target as Node;

      const isInside = scrollContainer && scrollContainer.contains(target);
      const isScrollable =
        scrollContainer &&
        scrollContainer.scrollHeight > scrollContainer.clientHeight;

      if (isInside && isScrollable) {
        return;
      }

      if (e.deltaY <= 0) return;

      if (isExpanded) {
        setIsExpanded(false);
        isScrollBlockedRef.current = true;

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (isScrollBlockedRef.current) {
        e.preventDefault();
        e.stopPropagation();

        if (wheelEndTimeoutRef.current) {
          clearTimeout(wheelEndTimeoutRef.current);
        }

        wheelEndTimeoutRef.current = setTimeout(() => {
          isScrollBlockedRef.current = false;
        }, 500);
        return;
      }
    };

    window.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true });
      if (wheelEndTimeoutRef.current) clearTimeout(wheelEndTimeoutRef.current);
    };
  }, [isExpanded]);

  const onLoad = () => {
    if (imgRef.current) {
      setSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  const handleCopyImage = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      ctx.drawImage(img, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

      await invoke("copy_image_to_clipboard", { imageBase64: base64 });

      const { showToast } = await import("../../../../components/Toast");
      showToast("Copied to clipboard", "success");
    } catch (err) {
      console.error("Failed to copy image:", err);
      const { showToast } = await import("../../../../components/Toast");
      showToast("Failed to copy", "error");
    }
  }, []);

  const handleExpandSave = useCallback(async () => {
    const { showToast } = await import("../../../../components/Toast");
    showToast("Save feature coming soon", "success");
  }, []);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  if (!startupImage) {
    return null;
  }

  if (!isVisible) return null;

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.container} ${isExpanded ? styles.expanded : ""}`}
      >
        <div className={styles.barHeader}>
          <div className={styles.thumbnailWrapper} onClick={toggleExpand}>
            <img src={imageSrc} alt="Thumbnail" className={styles.miniThumb} />
          </div>

          <div className={styles.inputContainer}>
            <ChatInput
              startupImage={startupImage}
              input={imagePrompt}
              onInputChange={setImagePrompt}
              onSend={() => onDescribeEdits(imagePrompt)}
              isLoading={false}
              placeholder="Ask about this image"
              variant="transparent"
            />
          </div>

          <div
            className={styles.toggleIcon}
            onClick={loading ? undefined : toggleExpand}
          >
            {loading ? (
              <Loader2 size={20} className={styles.spinning} />
            ) : isExpanded ? (
              <ChevronUp size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </div>
        </div>

        <div className={styles.expandedContent} ref={expandedContentRef}>
          <div className={styles.bigImageBox} ref={scrollWrapperRef}>
            <div className={styles.viewer} ref={viewerRef}>
              <div className={styles.imageWrap}>
                <div className={styles.innerContent} ref={imgWrapRef}>
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt=""
                    onLoad={onLoad}
                    onError={() => setError("Failed to load image")}
                    draggable={false}
                    className={styles.bigImage}
                  />

                  {data.length > 0 && (
                    <TextLayer
                      data={data}
                      size={size}
                      svgRef={svgRef}
                      onTextMouseDown={handleTextMouseDown}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <ImageToolbar
            toolbarRef={toolbarRef}
            isLensLoading={isLensLoading}
            onLensClick={triggerLens}
            onCopyImage={handleCopyImage}
            onSaveClick={handleExpandSave}
            constraintRef={scrollWrapperRef}
          />
        </div>
      </div>

      <ActionMenu
        ref={ActionMenuRef}
        data={data}
        size={size}
        imgRef={imgRef}
        imgWrapRef={imgWrapRef}
        viewerRef={viewerRef}
      />

      {error && <div className={styles.ocrError}>{error}</div>}
    </>
  );
};
