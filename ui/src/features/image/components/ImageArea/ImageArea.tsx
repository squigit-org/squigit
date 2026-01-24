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
    fromHistory?: boolean;
  } | null;
  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string) => void;
  chatTitle: string;
  onDescribeEdits: (description: string) => void;
  isVisible: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  ocrData: { text: string; box: number[][] }[];
  onUpdateOCRData: (data: { text: string; box: number[][] }[]) => void;
  chatId: string | null;
}

export const ImageArea: React.FC<ImageAreaProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  isVisible,
  ocrData,
  onUpdateOCRData,
  chatId,
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
  });

  const scan = useCallback(async () => {
    if (!startupImage?.base64) return;
    const currentChatId = chatId;

    setLoading(true);
    setError("");

    try {
      let imageData: string;
      let isBase64: boolean;

      if (startupImage.isFilePath) {
        const urlStr = startupImage.base64;
        console.log("ImageArea: processing URL:", urlStr);

        // Try to parse as URL to handle encoding and protocol safely
        try {
          // Handle custom protocols by creating a dummy base if needed,
          // but convertFileSrc returns a full URL usually.
          const urlObj = new URL(urlStr);
          // On Linux/Tauri v2, protocol might be http: and host asset.localhost
          if (
            urlObj.hostname === "asset.localhost" ||
            urlObj.protocol === "asset:"
          ) {
            // pathname is the file path. It is URL-encoded by the URL object parsing if using href,
            // but pathname property is usually decoded? No, it's often encoded.
            // decodeURIComponent is safest on the pathname.
            imageData = decodeURIComponent(urlObj.pathname);
          } else {
            // Fallback for simple string replacement if URL parsing fails or doesn't match
            imageData = urlStr;
          }
        } catch (e) {
          console.log(
            "ImageArea: URL parsing failed, falling back to manual strip",
            e,
          );
          // Fallback manual strip
          let url = urlStr;
          const patterns = [
            "asset://localhost",
            "http://asset.localhost",
            "https://asset.localhost",
            "asset:",
          ];
          for (const pattern of patterns) {
            if (url.startsWith(pattern)) {
              url = url.replace(pattern, "");
              break;
            }
          }
          imageData = decodeURIComponent(url);
        }

        console.log("ImageArea: extracted path:", imageData);
        isBase64 = false;
      } else {
        imageData = startupImage.base64;
        isBase64 = true;
      }

      /*
      const results = await invoke<OCRBox[]>("ocr_image", {
        imageData,
        isBase64,
      });

      const converted = results.map((r) => ({
        text: r.text,
        box: r.box_coords,
      }));

      // Prevent race condition: Check if we are still on the same chat
      if (currentChatId === chatId) {
        onUpdateOCRData(converted);
        setShowOverlay(false);
      }
      // setIsExpanded(true); // Don't auto-expand, user finds it annoying
      */
      console.log("OCR Disabled temporarily via comments");
      if (currentChatId === chatId) {
        setLoading(false);
      }
    } catch (e) {
      if (currentChatId === chatId) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        setError(errorMsg);
        setShowOverlay(false);
      }
    } finally {
      if (currentChatId === chatId) {
        setLoading(false);
      }
    }
  }, [startupImage, onUpdateOCRData, chatId]);

  // Auto-scan if no data present
  useEffect(() => {
    if (
      startupImage &&
      ocrData.length === 0 &&
      !loading &&
      !error &&
      !startupImage.fromHistory
    ) {
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
                  {/* <TextLayer
                    data={ocrData}
                    size={size}
                    svgRef={svgRef}
                    onTextMouseDown={handleTextMouseDown}
                  /> */}
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
      />

      {error && <div className={styles.ocrError}>{error}</div>}
    </>
  );
};
