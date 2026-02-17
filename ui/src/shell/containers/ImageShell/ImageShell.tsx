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
  ImageToolbar,
  ImageSearchInput,
  ImageTextCanvas,
  useGoogleLens,
  useTextSelection,
  generateTranslateUrl,
  OCRMenu,
  type OCRMenuHandle,
} from "@/features/image";
import styles from "./ImageShell.module.css";
import { Dialog } from "@/primitives";
import { type SettingsSection } from "@/shell/overlays";
import { type DialogContent, getErrorDialog } from "@/lib/helpers";

interface OCRBox {
  text: string;
  box_coords: number[][];
  confidence?: number;
}

export interface ImageShellProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    fromHistory?: boolean;
    imageId?: string;
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
  onOpenSettings: (section: SettingsSection) => void;
  autoExpandOCR?: boolean;
  activeProfileId: string | null;

  ocrEnabled: boolean;
  currentOcrModel: string;
  onOcrModelChange: (model: string) => void;

  isOcrScanning?: boolean;
  onOcrScanningChange?: (scanning: boolean) => void;
}

export const ImageShell: React.FC<ImageShellProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  isVisible,
  ocrData,
  onUpdateOCRData,
  onOpenSettings,
  chatId,
  inputValue,
  onInputChange,
  isExpanded = false,
  onToggleExpand,
  ocrEnabled,
  autoExpandOCR,
  activeProfileId,
  currentOcrModel,
  onOcrModelChange,
  isOcrScanning,
  onOcrScanningChange,
}) => {
  const [localLoading, setLocalLoading] = useState(false);
  const loading = isOcrScanning ?? localLoading;
  const setLoading = onOcrScanningChange ?? setLocalLoading;

  const [errorDialog, setErrorDialog] = useState<DialogContent | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [showScrollbar, setShowScrollbar] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const expandedContentRef = useRef<HTMLDivElement>(null);
  const OCRMenuRef = useRef<OCRMenuHandle>(null);

  const imageSrc = startupImage?.base64 || "";

  const { isLensLoading, triggerLens, showAuthDialog, setShowAuthDialog } =
    useGoogleLens(
      startupImage,
      sessionLensUrl,
      setSessionLensUrl,
      activeProfileId,
    );

  const { svgRef, handleTextMouseDown } = useTextSelection({
    data: ocrData,
    onSelectionComplete: (selection: Selection) => {
      OCRMenuRef.current?.showStandardMenu(selection);
    },
  });

  const hasScannedRef = useRef(false);
  const prevImageBase64Ref = useRef<string | null>(null);

  const currentBase64 = startupImage?.base64 ?? null;
  if (currentBase64 !== prevImageBase64Ref.current) {
    hasScannedRef.current = false;
    prevImageBase64Ref.current = currentBase64;
    setLoading(false);
  }

  const scan = useCallback(
    async (modelId?: string) => {
      if (!startupImage?.base64 || !ocrEnabled) return;

      const currentChatId = chatId;
      const modelToUse = modelId || currentOcrModel;

      console.log(`Scanning with model: ${modelToUse}`);
      setLoading(true);
      setErrorDialog(null);

      try {
        let imageData: string;
        let isBase64: boolean;

        if (startupImage.isFilePath) {
          const urlStr = startupImage.base64;
          try {
            const urlObj = new URL(urlStr);
            imageData =
              urlObj.hostname === "asset.localhost" ||
              urlObj.protocol === "asset:"
                ? decodeURIComponent(urlObj.pathname)
                : urlStr;
          } catch (e) {
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
          isBase64 = false;
        } else {
          imageData = startupImage.base64;
          isBase64 = true;
        }

        const results = await invoke<OCRBox[]>("ocr_image", {
          imageData,
          isBase64,
          modelName: modelToUse,
        });

        if (currentChatId === chatId) {
          const converted = results.map((r) => ({
            text: r.text,
            box: r.box_coords,
          }));
          onUpdateOCRData(converted);

          if (
            autoExpandOCR &&
            onToggleExpand &&
            !hasScannedRef.current &&
            !isExpanded
          ) {
            onToggleExpand();
          }
          hasScannedRef.current = true;
        }
      } catch (e: any) {
        if (currentChatId === chatId) {
          setErrorDialog(getErrorDialog(e.toString()));
        }
      } finally {
        if (currentChatId === chatId) {
          setLoading(false);
        }
      }
    },
    [
      startupImage,
      chatId,
      ocrEnabled,
      autoExpandOCR,
      onToggleExpand,
      isExpanded,
      onUpdateOCRData,
      currentOcrModel,
    ],
  );

  useEffect(() => {
    if (
      startupImage &&
      !startupImage.fromHistory &&
      ocrData.length === 0 &&
      !loading &&
      !errorDialog &&
      !hasScannedRef.current
    ) {
      scan(currentOcrModel);
    }
  }, [
    startupImage,
    ocrData.length,
    loading,
    errorDialog,
    scan,
    currentOcrModel,
  ]);

  const prevModelRef = useRef(currentOcrModel);
  const prevImageIdRef = useRef(startupImage?.imageId);

  useEffect(() => {
    const modelChanged = currentOcrModel !== prevModelRef.current;
    const imageChanged = startupImage?.imageId !== prevImageIdRef.current;

    prevModelRef.current = currentOcrModel;
    prevImageIdRef.current = startupImage?.imageId;

    if (imageChanged) {
      return;
    }

    if (startupImage && modelChanged) {
      console.log(`Model changed to ${currentOcrModel}, re-scanning...`);
      onUpdateOCRData([]);

      setTimeout(() => scan(currentOcrModel), 50);
    }
  }, [currentOcrModel, startupImage, scan, onUpdateOCRData]);

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
        setErrorDialog(
          getErrorDialog(
            `Failed to parse URL for copy: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
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
        setErrorDialog(
          getErrorDialog(
            `Failed to copy base64 image: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return false;
      }
    }

    try {
      await invoke("copy_image_from_path_to_clipboard", { path: sourcePath });
      return true;
    } catch (err) {
      setErrorDialog(
        getErrorDialog(
          `Failed to copy image from path: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
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
        }
      } catch (e) {
        setErrorDialog(
          getErrorDialog(
            `Failed to parse URL for save: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );

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
      setErrorDialog(
        getErrorDialog(
          `Failed to save image: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
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

  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 300);
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
    const imageBox = scrollWrapperRef.current;
    if (!imageBox) return;

    const handleWheel = (e: WheelEvent) => {
      if (!isExpandedRef.current) return;

      const isScrollable =
        Math.ceil(imageBox.scrollHeight) > Math.ceil(imageBox.clientHeight);

      if (isScrollable) {
        e.stopPropagation();
      }
    };

    imageBox.addEventListener("wheel", handleWheel, { passive: false });
    return () => imageBox.removeEventListener("wheel", handleWheel);
  }, []);

  const cancelOCR = useCallback(async () => {
    if (!loading) return;
    try {
      await invoke("cancel_ocr");
      setLoading(false);
    } catch (e) {
      console.error("Failed to cancel OCR:", e);
    }
  }, [loading]);

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
            onClick={
              loading
                ? (e) => {
                    e.stopPropagation();
                    cancelOCR();
                  }
                : isExpanded
                  ? undefined
                  : toggleExpand
            }
            title={loading ? "Cancel OCR" : undefined}
          >
            <img src={imageSrc} alt="Thumbnail" className={styles.miniThumb} />
            {loading && (
              <div className={styles.cancelOverlay}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.cancelIcon}
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </div>
            )}
          </div>

          <div className={styles.inputContainer}>
            <ImageSearchInput
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
              ocrEnabled={ocrEnabled}
              currentOcrModel={currentOcrModel}
              onOcrModelChange={onOcrModelChange}
              onOpenSettings={onOpenSettings}
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
                    onError={() =>
                      setErrorDialog(getErrorDialog("Failed to load image"))
                    }
                    draggable={false}
                    className={styles.bigImage}
                  />
                  <ImageTextCanvas
                    data={ocrData}
                    size={size}
                    svgRef={svgRef}
                    onTextMouseDown={handleTextMouseDown}
                  />
                </div>
              </div>
            </div>
          </div>

          <ImageToolbar
            key={chatId}
            toolbarRef={toolbarRef}
            isLensLoading={isLensLoading}
            onLensClick={triggerLens}
            onCopyImage={handleCopyImage}
            onSaveClick={handleExpandSave}
            constraintRef={scrollWrapperRef}
            isExpanded={isExpanded}
          />
        </div>
      </div>

      <OCRMenu
        ref={OCRMenuRef}
        data={ocrData}
        size={size}
        imgRef={imgRef}
        imgWrapRef={imgWrapRef}
        viewerRef={viewerRef}
      />

      <Dialog
        isOpen={showAuthDialog}
        type="IMGBB_AUTH"
        onAction={(key: string) => {
          if (key === "confirm") {
            onOpenSettings("apikeys");
          }
          setShowAuthDialog(false);
        }}
      />

      {errorDialog && (
        <Dialog
          isOpen={!!errorDialog}
          type={errorDialog}
          onAction={() => setErrorDialog(null)}
        />
      )}
    </>
  );
};
