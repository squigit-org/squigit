/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type RefObject } from "react";
import { InlineMenu, LoadingSpinner } from "@/components/ui";
import type { Attachment } from "@squigit/core/brain/attachments";
import type { OcrAnnotations, ReverseImageSearchCache } from "@squigit/core/config";
import type { ModelEffort, ModelId } from "@squigit/core/config";
import { ThreadInput, ThreadImage } from "@/features/thread";
import styles from "./ThreadWorkspace.module.css";

type StartupImage = {
  path: string;
  mimeType: string;
  imageId: string;
  tone?: string;
} | null;

interface ThreadWorkspaceProps {
  headerRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  bottomAnchorRef: RefObject<HTMLDivElement | null>;
  inputContainerRef: RefObject<HTMLDivElement | null>;
  inputHeight: number;
  visibleStartupImage: StartupImage;
  showArtifactPlaceholder: boolean;
  showLoadingState: boolean;
  showHistoryLoadSpinner?: boolean;
  isContentMounted: boolean;
  isNavigating: boolean;
  isImageExpanded: boolean;
  onToggleImageExpanded: () => void;
  sessionLensUrl: string | null;
  onReverseImageSearchCache: (cache: ReverseImageSearchCache) => void;
  threadTitle: string;
  onDescribeEdits: (description: string) => void | Promise<void>;
  ocrData: OcrAnnotations;
  onUpdateOCRData: (
    threadId: string | null,
    modelId: string,
    data: { text: string; box: number[][] }[],
  ) => void;
  onOpenSettings: (section: any) => void;
  threadId: string | null;
  imageInput: string;
  onImageInputChange: (value: string) => void;
  ocrEnabled: boolean;
  autoExpandOCR?: boolean;
  activeProfileId: string | null;
  currentOcrModel: string;
  onOcrModelChange: (model: string) => void;
  isOcrScanning: boolean;
  onOcrScanningChange: (scanning: boolean) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isThreadLoading: boolean;
  isSubmittingAttachments: boolean;
  isAiTyping: boolean;
  isStoppable: boolean;
  onStopGeneration: () => void;
  selectedModel: ModelId;
  selectedEffort: ModelEffort;
  onModelChange: (model: ModelId) => void;
  onEffortChange: (effort: ModelEffort) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  onRetryAttachment: (id: string) => void;
  onCaptureToInput: () => void | Promise<void>;
  onPreviewAttachment: (
    attachment: Attachment,
    index: number,
    images: Attachment[],
  ) => void | Promise<void>;
  showScrollToBottomButton: boolean;
  keepScrollToBottomButtonMounted: boolean;
  scrollToBottomButtonRef: RefObject<HTMLButtonElement | null>;
  onScrollToBottom: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  sliderRef: RefObject<HTMLDivElement | null>;
  page1Ref: RefObject<HTMLDivElement | null>;
  page2Ref: RefObject<HTMLDivElement | null>;
  pageFlatRef: RefObject<HTMLDivElement | null>;
  onInlineMenuAction: (action: string) => void;
  onInlineMenuSwitchPage: (page: number) => void;
  children: React.ReactNode;
}

const ThreadWorkspaceComponent: React.FC<ThreadWorkspaceProps> = ({
  headerRef,
  scrollContainerRef,
  bottomAnchorRef,
  inputContainerRef,
  inputHeight,
  visibleStartupImage,
  showArtifactPlaceholder,
  showLoadingState,
  showHistoryLoadSpinner = false,
  isContentMounted,
  isNavigating,
  isImageExpanded,
  onToggleImageExpanded,
  sessionLensUrl,
  onReverseImageSearchCache,
  threadTitle,
  onDescribeEdits,
  ocrData,
  onUpdateOCRData,
  onOpenSettings,
  threadId,
  imageInput,
  onImageInputChange,
  ocrEnabled,
  autoExpandOCR,
  activeProfileId,
  currentOcrModel,
  onOcrModelChange,
  isOcrScanning,
  onOcrScanningChange,
  inputValue,
  onInputChange,
  onSend,
  isThreadLoading,
  isSubmittingAttachments,
  isAiTyping,
  isStoppable,
  onStopGeneration,
  selectedModel,
  selectedEffort,
  onModelChange,
  onEffortChange,
  attachments,
  onAttachmentsChange,
  onRemoveAttachment,
  onRetryAttachment,
  onCaptureToInput,
  onPreviewAttachment,
  showScrollToBottomButton,
  keepScrollToBottomButtonMounted,
  scrollToBottomButtonRef,
  onScrollToBottom,
  menuRef,
  sliderRef,
  page1Ref,
  page2Ref,
  pageFlatRef,
  onInlineMenuAction,
  onInlineMenuSwitchPage,
  children,
}) => {
  const hasArtifactShell = !!visibleStartupImage || showArtifactPlaceholder;

  return (
    <div className={styles.threadContainer}>
      <div className={styles.overlayLayer}>
        <div ref={headerRef} className={styles.headerContainer}>
          {visibleStartupImage ? (
            <ThreadImage
              startupImage={visibleStartupImage}
              sessionLensUrl={sessionLensUrl}
              onReverseImageSearchCache={onReverseImageSearchCache}
              threadTitle={threadTitle}
              onDescribeEdits={onDescribeEdits}
              ocrData={ocrData}
              onUpdateOCRData={onUpdateOCRData}
              onOpenSettings={onOpenSettings}
              isVisible={true}
              scrollContainerRef={scrollContainerRef}
              threadId={threadId}
              inputValue={imageInput}
              onInputChange={onImageInputChange}
              onToggleExpand={onToggleImageExpanded}
              ocrEnabled={ocrEnabled}
              autoExpandOCR={autoExpandOCR}
              activeProfileId={activeProfileId}
              currentOcrModel={currentOcrModel}
              onOcrModelChange={onOcrModelChange}
              isOcrScanning={isOcrScanning}
              onOcrScanningChange={onOcrScanningChange}
              isExpanded={isImageExpanded}
              isNavigating={isNavigating}
            />
          ) : showArtifactPlaceholder ? (
            <div className={styles.artifactPlaceholder} aria-hidden="true" />
          ) : null}
        </div>

        <div
          ref={inputContainerRef}
          className={styles.inputOverlay}
          style={{ pointerEvents: "none" }}
        >
          <div style={{ pointerEvents: "auto", width: "100%" }}>
            <ThreadInput
              startupImage={visibleStartupImage}
              forceVisible={isNavigating}
              isNavigating={isNavigating}
              input={inputValue}
              onInputChange={onInputChange}
              onSend={onSend}
              isLoading={isThreadLoading}
              isSubmittingAttachments={isSubmittingAttachments}
              isAiTyping={isAiTyping}
              isStoppable={isStoppable}
              onStopGeneration={onStopGeneration}
              selectedModel={selectedModel}
              selectedEffort={selectedEffort}
              onModelChange={onModelChange}
              onEffortChange={onEffortChange}
              attachments={attachments}
              onAttachmentsChange={onAttachmentsChange}
              onRemoveAttachment={onRemoveAttachment}
              onRetryAttachment={onRetryAttachment}
              onCaptureToInput={onCaptureToInput}
              onPreviewAttachment={onPreviewAttachment}
              showScrollToBottomButton={showScrollToBottomButton}
              keepScrollToBottomButtonMounted={keepScrollToBottomButtonMounted}
              scrollToBottomButtonRef={scrollToBottomButtonRef}
              onScrollToBottom={onScrollToBottom}
            />
          </div>
        </div>
      </div>
      <div className={styles.contentColumn}>
        <div
          className={`${styles.container} ${!hasArtifactShell ? styles.noImage : ""}`}
          ref={scrollContainerRef}
          style={
            { "--input-height": `${inputHeight}px` } as React.CSSProperties
          }
        >
          <main className={styles.scrollContent}>
            {showHistoryLoadSpinner && (
              <div
                className={styles.historyLoadSpinner}
                role="status"
                aria-live="polite"
                aria-label="Loading older messages"
              >
                <LoadingSpinner />
              </div>
            )}
            <div className={styles.contentViewport}>
              <div className={styles.contentStage}>
                <div
                  className={`${styles.contentInner} ${
                    isContentMounted
                      ? styles.contentOffsetDown
                      : styles.contentOffsetUp
                  } ${
                    isContentMounted && !showLoadingState
                      ? styles.contentVisible
                      : styles.contentHidden
                  }`}
                  aria-hidden={!isContentMounted || showLoadingState}
                >
                  {isContentMounted ? children : null}
                </div>
              </div>
            </div>
          </main>
          <div
            className={styles.scrollBottomSpacer}
            style={{ height: inputHeight + 10 }}
            aria-hidden="true"
          />
          <div
            ref={bottomAnchorRef}
            className={styles.scrollBottomAnchor}
            aria-hidden="true"
          />
        </div>

        <div
          className={`${styles.loadingOverlay} ${
            showLoadingState ? styles.loadingVisible : styles.loadingHidden
          }`}
          role={showLoadingState ? "status" : undefined}
          aria-live={showLoadingState ? "polite" : undefined}
          aria-label={showLoadingState ? "Loading thread" : undefined}
          aria-hidden={!showLoadingState}
        >
          <div className={styles.loadingOverlaySpinner} aria-hidden="true">
            <LoadingSpinner />
          </div>
        </div>

        <InlineMenu
          menuRef={menuRef}
          sliderRef={sliderRef}
          page1Ref={page1Ref}
          page2Ref={page2Ref}
          pageFlatRef={pageFlatRef}
          onAction={onInlineMenuAction}
          onSwitchPage={onInlineMenuSwitchPage}
        />
      </div>
    </div>
  );
};

export const ThreadWorkspace = React.memo(ThreadWorkspaceComponent);
