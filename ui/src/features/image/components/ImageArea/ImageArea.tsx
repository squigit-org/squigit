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
import { ChevronUp, Loader2 } from "lucide-react";
import { useGoogleLens } from "../../hooks/useGoogleLens";
import { useTextSelection } from "../../hooks/useTextSelection";
import { ActionMenu, ActionMenuHandle } from "../OCRLayer/ActionMenu";
import { SearchInput } from "../InlineInput/InlineInput";
import { TextLayer } from "../OCRLayer/TextLayer";
import { ImageToolbar } from "../ImageToolbar";
import { generateTranslateUrl } from "../..";
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
  ocrData: { text: string; box: number[][] }[];
  onUpdateOCRData: (data: { text: string; box: number[][] }[]) => void;
  sessionId: string;
}

export const ImageArea: React.FC<ImageAreaProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  chatTitle,
  onDescribeEdits,
  isVisible,
  scrollContainerRef,
  ocrData,
  onUpdateOCRData,
  sessionId,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [showScrollbar, setShowScrollbar] = useState(false);

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
    data: ocrData,
    onSelectionComplete: (selection) => {
      ActionMenuRef.current?.showStandardMenu(selection);
    },
    sessionId,
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

      onUpdateOCRData(converted);
      setShowOverlay(false);
      setIsExpanded(true);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setShowOverlay(false);
    } finally {
      setLoading(false);
    }
  }, [startupImage, onUpdateOCRData]);

  // Auto-scan if no data present
  useEffect(() => {
    if (startupImage && ocrData.length === 0 && !loading && !error) {
      scan();
    }
  }, [startupImage, ocrData.length, loading, error, scan]);

  const isScrollBlockedRef = useRef(false);
  const wheelEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowScrollbar(isExpanded);
  }, [isExpanded]);

  const onLoad = () => {
    if (imgRef.current) {
      setSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  const handleCopyImage = useCallback(async (): Promise<boolean> => {
    const img = imgRef.current;
    if (!img) return false;

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
      return true;
    } catch (err) {
      console.error("Failed to copy image:", err);
      return false;
    }
  }, []);

  const handleExpandSave = useCallback(async () => {
    // Save feature coming soon - no-op for now
  }, []);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleTranslateAll = useCallback(() => {
    if (ocrData.length === 0) return;
    const allText = ocrData.map((item) => item.text).join(" ");
    if (allText.trim()) {
      invoke("open_external_url", { url: generateTranslateUrl(allText) });
    }
  }, [ocrData]);

  if (!startupImage) {
    return null;
  }

  if (!isVisible) return null;

  return (
    <>
      <div className={styles.placeholder} />

      <div
        ref={containerRef}
        className={`${styles.floatingContainer} ${isExpanded ? styles.expanded : ""}`}
      >
        <div className={styles.barHeader}>
          <div
            className={`${styles.thumbnailWrapper} ${loading ? styles.thumbnailLoading : ""} ${isExpanded ? styles.thumbnailExpanded : ""}`}
            onClick={loading || isExpanded ? undefined : toggleExpand}
            title={loading ? "Processing..." : undefined}
          >
            <img src={imageSrc} alt="Thumbnail" className={styles.miniThumb} />
          </div>

          <div className={styles.inputContainer}>
            <SearchInput
              value={imagePrompt}
              onChange={setImagePrompt}
              onLensClick={(query) => triggerLens(query)}
              onTranslateClick={handleTranslateAll}
              onCollapse={toggleExpand}
              isLensLoading={isLensLoading}
              isTranslateDisabled={ocrData.length === 0}
              isOCRLoading={loading}
              isExpanded={isExpanded}
              placeholder="Add to your search"
            />
          </div>
        </div>

        <div className={styles.expandedContent} ref={expandedContentRef}>
          <div
            className={`${styles.bigImageBox} ${showScrollbar ? styles.showScrollbar : ""}`}
            ref={scrollWrapperRef}
          >
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
                  {/* Render TextLayer here */}
                  <TextLayer
                    data={ocrData}
                    size={size}
                    svgRef={svgRef}
                    onTextMouseDown={handleTextMouseDown}
                    sessionId={sessionId}
                  />
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
        data={ocrData}
        size={size}
        imgRef={imgRef}
        imgWrapRef={imgWrapRef}
        viewerRef={viewerRef}
        sessionId={sessionId}
      />

      {error && <div className={styles.ocrError}>{error}</div>}
    </>
  );
};
