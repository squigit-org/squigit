/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Message } from "@/features/chat";
import { Dialog } from "@/widgets";
import { ImageShell, ChatShell, SettingsSection } from "@/shell";
import { parseGeminiError } from "@/lib/helpers/errorParser";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  messages: Message[];
  streamingText: string;
  isChatMode: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  lastSentMessage: Message | null;

  input: string;
  currentModel: string;

  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    fromHistory?: boolean;
  } | null;

  chatTitle: string;
  chatId: string | null;

  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string | null) => void;
  onDescribeEdits: (description: string) => Promise<void>;
  ocrData: { text: string; box: number[][] }[];
  onUpdateOCRData: (data: { text: string; box: number[][] }[]) => void;

  onSend: () => void;
  onModelChange: (model: string) => void;
  onRetry: () => void;
  onInputChange: (value: string) => void;
  onReload?: () => void;
  onOpenSettings: (section: SettingsSection) => void;

  imageInputValue: string;
  onImageInputChange: (value: string) => void;

  ocrEnabled?: boolean;
  autoExpandOCR?: boolean;
  onStreamComplete?: () => void;
  activeProfileId: string | null;
}

const AppShellComponent: React.FC<AppShellProps> = ({
  messages,
  streamingText,
  isChatMode,
  isLoading,
  error,
  input,
  startupImage,
  onSend,
  onRetry,
  onInputChange,
  sessionLensUrl,
  setSessionLensUrl,
  onDescribeEdits,
  onOpenSettings,
  ocrData,
  onUpdateOCRData,
  chatTitle,
  chatId,
  imageInputValue,
  onImageInputChange,
  ocrEnabled = true,
  autoExpandOCR = true,
  onStreamComplete,
  activeProfileId,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  useEffect(() => {
    setIsErrorDismissed(false);
  }, [error]);

  const [isImageExpanded, setIsImageExpanded] = useState(false);

  useEffect(() => {
    setIsImageExpanded(false);
  }, [chatId]);

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 5) return;

      if (e.deltaY < 0) {
        if (!isImageExpanded) {
          setIsImageExpanded(true);
          e.preventDefault();
        }
      } else {
        if (isImageExpanded) {
          setIsImageExpanded(false);
          e.preventDefault();
        }
      }
    };

    header.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      header.removeEventListener("wheel", handleWheel);
    };
  }, [isImageExpanded]);

  const renderError = () => {
    if (!error) return null;

    const parsedError = parseGeminiError(error);

    const getActions = () => {
      const actions: any[] = [];

      if (parsedError.actionType !== "DISMISS_ONLY") {
        actions.push({
          label: "Retry",
          onClick: onRetry,
          variant: "danger",
        });
      } else {
        actions.push({
          label: "Dismiss",
          onClick: () => setIsErrorDismissed(true),
          variant: "secondary",
        });
      }

      if (parsedError.actionType === "RETRY_OR_SETTINGS") {
        actions.push({
          label: "Change API Key",
          onClick: () => {
            onOpenSettings("apikeys");
            setIsErrorDismissed(true);
          },
          variant: "secondary",
        });
      }

      if (
        parsedError.actionType === "RETRY_OR_LINK" &&
        parsedError.meta?.link
      ) {
        actions.push({
          label: parsedError.meta.linkLabel || "Open Link",
          onClick: () => {
            invoke("open_external_url", {
              url: parsedError.meta?.link,
            });
            setIsErrorDismissed(true);
          },
          variant: "secondary",
        });
      }

      return actions;
    };

    return (
      <Dialog
        isOpen={!!error && !isErrorDismissed}
        variant="error"
        title={parsedError.title}
        message={parsedError.message}
        actions={getActions()}
      />
    );
  };

  return (
    <div className={styles.container}>
      <div ref={headerRef} className={styles.headerContainer}>
        <ImageShell
          startupImage={startupImage}
          sessionLensUrl={sessionLensUrl}
          setSessionLensUrl={setSessionLensUrl}
          chatTitle={chatTitle}
          onDescribeEdits={onDescribeEdits}
          ocrData={ocrData}
          onUpdateOCRData={onUpdateOCRData}
          onOpenSettings={onOpenSettings}
          isVisible={true}
          scrollContainerRef={scrollContainerRef}
          chatId={chatId}
          inputValue={imageInputValue}
          onInputChange={onImageInputChange}
          isExpanded={isImageExpanded}
          onToggleExpand={() => setIsImageExpanded(!isImageExpanded)}
          ocrEnabled={ocrEnabled}
          autoExpandOCR={autoExpandOCR}
          activeProfileId={activeProfileId}
        />
      </div>

      {renderError()}

      <ChatShell
        messages={messages}
        streamingText={streamingText}
        isChatMode={isChatMode}
        isLoading={isLoading}
        isStreaming={false}
        error={error}
        input={input}
        startupImage={startupImage}
        chatId={chatId}
        onSend={onSend}
        onRetry={onRetry}
        onInputChange={onInputChange}
        onOpenSettings={onOpenSettings}
        onStreamComplete={onStreamComplete}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  );
};

export const AppShell = React.memo(AppShellComponent);
