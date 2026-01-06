/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import "katex/dist/katex.min.css";
import "../../ui/Notifications/Toast.css";
import "./AppLayout.css";
import { ContextMenu } from "../../ui/ContextMenu/ContextMenu";
import { EditorLayout } from "../EditorLayout/EditorLayout";
import { ChatLayout } from "../../../features/chat/layouts/ChatLayout";
import { Welcome } from "../../../features/onboarding";
import { Agreement } from "../../../features/onboarding/components/Agreement/Agreement";
import { UpdateNotes } from "../../../features/onboarding/components/UpdateNotes/UpdateNotes";
import { GeminiSetup } from "../../../features/auth/components/BYOKey/GeminiSetup";
import { LoginScreen } from "../../../features/auth/components/LoginScreen/LoginScreen";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { useSystemSync } from "../../../hooks/useSystemSync";
import { useChatEngine } from "../../../features/chat/hooks/useChat";
import {
  useUpdateCheck,
  getPendingUpdate,
} from "../../../hooks/useUpdateCheck";
import { useWindowManager } from "../../../hooks/useWindowManager";
import { exit } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "../../../lib/api/tauri/commands";

export const AppLayout: React.FC = () => {
  const [isPanelActive, setIsPanelActive] = useState(false);
  const handleToggleSettings = useCallback(() => {
    setIsPanelActive((prev) => !prev);
  }, []);

  const system = useSystemSync(handleToggleSettings);
  const auth = useAuth();
  const performLogout = async () => {
    await system.handleLogout();
    auth.logout();
    setIsPanelActive(false);
  };
  useUpdateCheck();

  const [isCheckingImage, setIsCheckingImage] = useState(true);

  useEffect(() => {
    const initStartupImage = async () => {
      try {
        const initialImage = await invoke<string | null>("get_initial_image");
        if (initialImage) {
          console.log("Found CLI image in state, loading...");
          handleImageReady(initialImage);
        }
      } catch (e) {
        console.error("Failed to check initial image:", e);
      } finally {
        setIsCheckingImage(false);
      }
    };

    initStartupImage();

    const unlisten = listen<string>("image-path", async (event) => {
      const imagePath = event.payload;
      if (imagePath) {
        try {
          console.log("Event received for image:", imagePath);
          const result = await commands.processImagePath(imagePath);
          handleImageReady(result);
        } catch (error) {
          console.error("Failed to process CLI image event:", error);
        }
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const isAgreementPending = system.hasAgreed === false;
  const isLoadingState =
    system.hasAgreed === null ||
    auth.authStage === "LOADING" ||
    isCheckingImage;
  const isImageMissing = !system.startupImage;
  const isAuthPending =
    auth.authStage === "GEMINI_SETUP" || auth.authStage === "LOGIN";
  const isChatActive =
    !isLoadingState && !isAgreementPending && !isImageMissing && !isAuthPending;

  const chatEngine = useChatEngine({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
    enabled: isChatActive,
  });

  const [input, setInput] = useState("");
  const [pendingUpdate] = useState(() => getPendingUpdate());
  const [showUpdate, setShowUpdate] = useState(() => {
    const wasDismissed = sessionStorage.getItem("update_dismissed");
    return !!pendingUpdate && !wasDismissed;
  });

  useWindowManager(
    isChatActive,
    isAuthPending,
    isAgreementPending,
    showUpdate,
    isLoadingState
  );

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);

  // Split layout state (must be before conditional returns)
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem("splitRatio");
    return saved ? parseFloat(saved) : 62.5; // 5:3 ratio = 62.5%
  });
  const isResizingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newRatio =
          ((moveEvent.clientX - containerRect.left) / containerRect.width) *
          100;
        const clampedRatio = Math.max(30, Math.min(70, newRatio));
        setSplitRatio(clampedRatio);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem("splitRatio", splitRatio.toString());
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [splitRatio]
  );

  useEffect(() => {
    const unlisten = listen<any>("auth-success", (event) => {
      system.updateUserData(event.payload);
      auth.login();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleImageReady = (
    imageData: string | { path?: string; base64?: string; mimeType: string }
  ) => {
    if (typeof imageData === "string") {
      if (!imageData || !imageData.includes(",")) return;

      const [header, base64Data] = imageData.split(",");
      const mimeType = header.replace("data:", "").replace(";base64", "");

      system.setStartupImage({
        base64: imageData,
        mimeType: mimeType,
        isFilePath: false,
      });
    } else {
      if (imageData.path) {
        system.setStartupImage({
          base64: convertFileSrc(imageData.path),
          mimeType: imageData.mimeType,
          isFilePath: true,
        });
      } else if (imageData.base64) {
        system.setStartupImage({
          base64: imageData.base64,
          mimeType: imageData.mimeType,
          isFilePath: false,
        });
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selectedText = window.getSelection()?.toString() || "";
    if (selectedText) {
      setContextMenu({ x: e.clientX, y: e.clientY, selectedText });
    }
  };

  const handleCloseContextMenu = () => setContextMenu(null);
  const handleCopy = () => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    }
  };

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) handleCloseContextMenu();
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  if (showUpdate && pendingUpdate) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <UpdateNotes
          version={pendingUpdate.version}
          notes={pendingUpdate.notes}
          onClose={() => {
            setShowUpdate(false);
            sessionStorage.setItem("update_dismissed", "true");
          }}
        />
      </div>
    );
  }

  // 1. Loading State (Checking file)
  if (system.hasAgreed === null || auth.authStage === "LOADING") {
    return <div className="h-screen w-screen bg-neutral-950" />;
  }

  // 2. Agreement Screen
  if (system.hasAgreed === false) {
    const getOSType = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.includes("win")) return "windows";
      if (userAgent.includes("mac")) return "macos";
      return "linux";
    };

    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <Agreement
          osType={getOSType()}
          onNext={() => system.setHasAgreed(true)}
          onCancel={() => exit(0)}
        />
      </div>
    );
  }

  // 3. Welcome / Image Upload
  if (!system.startupImage) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <Welcome onImageReady={handleImageReady} />
      </div>
    );
  }

  // 2. Gemini Setup
  if (auth.authStage === "GEMINI_SETUP") {
    return <GeminiSetup onComplete={auth.completeGeminiSetup} />;
  }

  // 3. Login Screen
  if (auth.authStage === "LOGIN") {
    return <LoginScreen onComplete={auth.login} />;
  }

  // 4. Main Split Interface (EditorLayout + ChatLayout)

  return (
    <div
      ref={containerRef}
      onContextMenu={handleContextMenu}
      className="app-container"
    >
      <div className="editor-panel" style={{ width: `${splitRatio}%` }}>
        <EditorLayout
          startupImage={system.startupImage}
          sessionLensUrl={system.sessionLensUrl}
          setSessionLensUrl={system.setSessionLensUrl}
        />
      </div>

      <div className="resize-handle" onMouseDown={handleResizeStart} />

      <div className="chat-panel" style={{ width: `${100 - splitRatio}%` }}>
        <ChatLayout
          // Chat State
          messages={chatEngine.messages}
          streamingText={chatEngine.streamingText}
          isChatMode={chatEngine.isChatMode}
          isLoading={chatEngine.isLoading}
          isStreaming={chatEngine.isStreaming}
          error={chatEngine.error || system.systemError}
          lastSentMessage={chatEngine.lastSentMessage}
          // Inputs
          input={input}
          onInputChange={setInput}
          // Models & Settings
          currentModel={system.sessionModel}
          editingModel={system.editingModel}
          startupImage={system.startupImage}
          prompt={system.prompt}
          setPrompt={system.setEditingPrompt}
          // User Info
          userName={system.userName}
          userEmail={system.userEmail}
          avatarSrc={system.avatarSrc}
          isDarkMode={system.isDarkMode}
          // Actions
          onSend={() => {
            chatEngine.handleSend(input);
            setInput("");
          }}
          onModelChange={system.setSessionModel}
          onEditingModelChange={system.setEditingModel}
          onRetry={() => {
            if (chatEngine.messages.length === 0) {
              chatEngine.handleReload();
            } else {
              chatEngine.handleRetrySend();
            }
          }}
          onLogout={performLogout}
          onSave={system.saveSettings}
          onToggleTheme={system.handleToggleTheme}
          onCheckSettings={() => {
            setIsPanelActive(true);
            chatEngine.clearError();
          }}
          toggleSettingsPanel={() => setIsPanelActive(!isPanelActive)}
          isPanelActive={isPanelActive}
          onResetAPIKey={system.handleResetAPIKey}
          onReload={chatEngine.handleReload}
          sessionLensUrl={system.sessionLensUrl}
          setSessionLensUrl={system.setSessionLensUrl}
        />
      </div>

      <div id="toast" className="toast"></div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedText={contextMenu.selectedText}
          onCopy={handleCopy}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
