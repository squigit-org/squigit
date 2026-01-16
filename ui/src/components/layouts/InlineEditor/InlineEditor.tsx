/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp } from "lucide-react"; // Or custom icon as requested
import { useLens } from "../../../features/google";
import { EditorMenu, EditorMenuHandle } from "../../../features/editor";
import ChatInput from "../../../features/chat/components/ChatInput/ChatInput";
import {
  TextLayer,
  ImageToolbar,
  useTextSelection,
  ScanningOverlay,
} from "../../ui";
import styles from "./InlineEditor.module.css";

interface OCRBox {
  text: string;
  box_coords: number[][];
  confidence?: number;
}

interface InlineEditorProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string) => void;
  chatTitle: string;
  onDescribeEdits: (description: string) => void;
  isVisible: boolean; // Retaining prop for compatibility, but mainly internal toggle now
}

export const InlineEditor: React.FC<InlineEditorProps> = ({
  startupImage,
  sessionLensUrl,
  setSessionLensUrl,
  chatTitle,
  onDescribeEdits,
  isVisible,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [data, setData] = useState<{ text: string; box: number[][] }[]>([]);
  const [loading, setLoading] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);
  const [showTextLayer, setShowTextLayer] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });

  const viewerRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorMenuRef = useRef<EditorMenuHandle>(null);

  const imageSrc = startupImage?.base64 || "";

  const { isLensLoading, triggerLens } = useLens(
    startupImage,
    sessionLensUrl,
    setSessionLensUrl
  );

  const { svgRef, handleTextMouseDown } = useTextSelection({
    data,
    onSelectionComplete: (selection) => {
      editorMenuRef.current?.showStandardMenu(selection);
    },
  });

  const scan = useCallback(async () => {
    if (!startupImage?.base64) return;

    setLoading(true);
    setShowOverlay(true);
    setShowTextLayer(false);
    setError("");

    try {
      let imageData: string;
      let isBase64: boolean;

      if (
        startupImage.isFilePath &&
        startupImage.base64.startsWith("asset://")
      ) {
        imageData = decodeURIComponent(
          startupImage.base64.replace("asset://localhost", "")
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
      setShowTextLayer(true);
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
      // Optional: Auto-expand on load? Or keep collapsed. User mockup implies collapsed.
    }
  }, [startupImage, scan]);

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

      const { showToast } = await import("../../ui/Notifications/Toast");
      showToast("Copied to clipboard", "success");
    } catch (err) {
      console.error("Failed to copy image:", err);
      const { showToast } = await import("../../ui/Notifications/Toast");
      showToast("Failed to copy", "error");
    }
  }, []);

  const handleExpandSave = useCallback(async () => {
    const { showToast } = await import("../../ui/Notifications/Toast");
    showToast("Save feature coming soon", "success");
  }, []);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  if (!startupImage) {
    return null;
  }

  // isVisible prop can be used to completely hide if needed, but the mockup suggests internal toggle.
  // We'll respect isVisible if passed as false for now, or ignore it if we want it always present.
  if (!isVisible) return null; // Or logic to show/hide entire bar.

  return (
    <>
      <div
        className={`${styles.container} ${isExpanded ? styles.expanded : ""}`}
      >
        {/* Header Bar (Always visible) */}
        {/* Header Bar (Always visible) */}
        <div className={styles.barHeader}>
          <div className={styles.thumbnailWrapper}>
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

          {/* The Icon */}
          <div className={styles.toggleIcon} onClick={toggleExpand}>
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        {/* Expanded Content Area */}
        <div className={styles.expandedContent}>
          <div className={styles.bigImageBox}>
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

                  {showTextLayer && (
                    <TextLayer
                      data={data}
                      size={size}
                      svgRef={svgRef}
                      onTextMouseDown={handleTextMouseDown}
                    />
                  )}

                  <ScanningOverlay isVisible={showOverlay} />
                </div>
              </div>

              <ImageToolbar
                toolbarRef={toolbarRef}
                isLensLoading={isLensLoading}
                onLensClick={triggerLens}
                onCopyImage={handleCopyImage}
                onSaveClick={handleExpandSave}
                containerRef={viewerRef}
              />
            </div>
          </div>
        </div>
      </div>

      <EditorMenu
        ref={editorMenuRef}
        data={data}
        size={size}
        imgRef={imgRef}
        imgWrapRef={imgWrapRef}
        viewerRef={viewerRef}
      />

      {error && <div className={styles.editorError}>{error}</div>}
    </>
  );
};
