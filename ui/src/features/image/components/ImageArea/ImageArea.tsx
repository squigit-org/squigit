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
import { save } from "@tauri-apps/plugin-dialog";
import {
  useGoogleLens,
  useTextSelection,
  generateTranslateUrl,
  ImageToolbar,
  SearchInput,
  OCRLayer,
} from "@/features/image";
import { ActionMenu, ActionMenuHandle } from "@/widgets/menu";
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
  inputValue: string;
  onInputChange: (value: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const ImageArea: React.FC<ImageAreaProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  isVisible,
  ocrData,
  onUpdateOCRData,
  chatId,
  inputValue,
  onInputChange,
  isExpanded = false,
  onToggleExpand,
}) => {
  const [loading, setLoading] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [showScrollbar, setShowScrollbar] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Removed local imagePrompt state
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

  const onLoad = () => {
    if (imgRef.current) {
      setSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  // Reset expansion state when switching chats - Handled by parent now
  // useEffect(() => {
  //   setIsExpanded(false);
  // }, [chatId]);

  const handleCopyImage = useCallback(async (): Promise<boolean> => {
    if (!startupImage?.base64) return false;

    let sourcePath = startupImage.base64;

    if (startupImage.isFilePath) {
      try {
        const urlObj = new URL(sourcePath);
        if (
          urlObj.hostname === "asset.localhost" ||
          urlObj.protocol === "asset:"
        ) {
          sourcePath = decodeURIComponent(urlObj.pathname);
        }
      } catch (e) {
        console.error("Failed to parse URL for copy:", e);
        const patterns = [
          "asset://localhost",
          "http://asset.localhost",
          "https://asset.localhost",
          "asset:",
        ];
        for (const pattern of patterns) {
          if (sourcePath.startsWith(pattern)) {
            sourcePath = sourcePath.replace(pattern, "");
            break;
          }
        }
        sourcePath = decodeURIComponent(sourcePath);
      }
    } else {
      // Fallback for base64 content if needed, though strictly we prefer file path copy
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

        await invoke("copy_image_to_clipboard", { image_base64: base64 });
        return true;
      } catch (err) {
        console.error("Failed to copy base64 image:", err);
        return false;
      }
    }

    try {
      await invoke("copy_image_from_path_to_clipboard", { path: sourcePath });
      return true;
    } catch (err) {
      console.error("Failed to copy image from path:", err);
      return false;
    }
  }, [startupImage]);

  const handleExpandSave = useCallback(async () => {
    if (!startupImage?.base64) return;

    let sourcePath = startupImage.base64;

    if (startupImage.isFilePath) {
      try {
        const urlObj = new URL(sourcePath);
        if (
          urlObj.hostname === "asset.localhost" ||
          urlObj.protocol === "asset:"
        ) {
          sourcePath = decodeURIComponent(urlObj.pathname);
          // Remove leading slash if windows? No, this is linux specific for now mostly but we should be careful.
          // On linux pathname from /home/user is /home/user.
          // On windows it might be /C:/Users...
        }
      } catch (e) {
        console.error("Failed to parse URL for save:", e);
        // Fallback cleanup if URL extraction fails
        const patterns = [
          "asset://localhost",
          "http://asset.localhost",
          "https://asset.localhost",
          "asset:",
        ];
        for (const pattern of patterns) {
          if (sourcePath.startsWith(pattern)) {
            sourcePath = sourcePath.replace(pattern, "");
            break;
          }
        }
        sourcePath = decodeURIComponent(sourcePath);
      }
    } else {
      // If it's pure base64, we can't easily "save" using a simple copy command on backend without saving it to a temp file first.
      // But the requirements say "copy from chat folder".
      // If it is NOT a file path (isFilePath=false), it might be raw base64.
      // Most usage in this app seems to be file-backed.
      // If it is base64, we might need a different command or just ignore for now as per "copy from chat folder" instruction.
      // However, looking at `scan` logic:
      // if (startupImage.isFilePath) { ... } else { imageData = startupImage.base64; isBase64 = true; }
      // If it IS base64, we probably want to support saving it too?
      // The user said: "the bts will be copy from chat folder and paste to user chosen location because the image already saved in disk by CAS model"
      // This implies we should have a path even if we passed base64 to frontend, OR we should rely on the fact that we have it in CAS.
      // But `startupImage` here comes from props.
      // If `isFilePath` is false, it's a raw base64 string?
      // If so, we can't use `fs::copy`.
      // Let's assume for now we only handle the `isFilePath` case or `asset` url case as that's what "saved in chat folder" implies.
      // If it's pure base64, we can't easily "save" using a simple copy command on backend without saving it to a temp file first.
    }

    try {
      const filePath = await save({
        title: "Save Image As",
        filters: [
          { name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });

      if (filePath) {
        await invoke("copy_image_to_path", {
          sourcePath,
          targetPath: filePath,
        });
      }
    } catch (error) {
      console.error("Failed to save image:", error);
    }
  }, [startupImage]);

  const toggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  const handleTranslateAll = useCallback(() => {
    if (ocrData.length === 0) return;
    const allText = ocrData.map((item) => item.text).join(" ");
    if (allText.trim()) {
      invoke("open_external_url", { url: generateTranslateUrl(allText) });
    }
  }, [ocrData]);

  // Removed handleWheel as logic moved to parent

  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 300); // Match CSS transition duration
    return () => clearTimeout(timer);
  }, [isExpanded]);

  useEffect(() => {
    const checkOverflow = () => {
      const el = scrollWrapperRef.current;
      if (el) {
        const hasOverflow = el.scrollHeight > el.clientHeight;
        setShowScrollbar(isExpanded && hasOverflow);
      }
    };

    if (isExpanded) {
      if (!isAnimating) {
        checkOverflow();
      }
      window.addEventListener("resize", checkOverflow);
    } else {
      setShowScrollbar(false);
    }

    return () => window.removeEventListener("resize", checkOverflow);
  }, [isExpanded, size, isAnimating]);

  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  useEffect(() => {
    // Attach listener to the bigImageBox to ONLY catch scrolls inside the image area
    const imageBox = scrollWrapperRef.current;
    if (!imageBox) return;

    const handleWheel = (e: WheelEvent) => {
      // If we are collapsed, we want the scroll to bubble up so the parent (ChatLayout)
      // can handle the "Expand on scroll up" gesture.
      if (!isExpandedRef.current) return;

      // Use Math.ceil to handle fractional pixels potentially
      // Recalculate overflow on the fly
      const isScrollable =
        Math.ceil(imageBox.scrollHeight) > Math.ceil(imageBox.clientHeight);

      if (isScrollable) {
        // If the image area has a scrollbar, we want to consume the scroll event
        // to prevent the parent layout from triggering the collapse gesture.
        e.stopPropagation();
      }
      // If image is NOT scrollable, we let the event bubble.
    };

    // Use passive: false to ensure we can control event propagation reliably
    imageBox.addEventListener("wheel", handleWheel, { passive: false });
    return () => imageBox.removeEventListener("wheel", handleWheel);
  }, []);

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
              value={inputValue}
              onChange={onInputChange}
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
            style={isAnimating ? { overflow: "hidden" } : undefined}
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
                  {/* Render OCRLayer here */}
                  {/* <OCRLayer
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
            key={chatId} // Reset position on chat switch
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
