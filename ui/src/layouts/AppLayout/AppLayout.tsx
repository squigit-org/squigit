/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

import { exit } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "../../lib/api/tauri/commands";
import { ContextMenu } from "../../components";

import {
  useUpdateCheck,
  getPendingUpdate,
  useSystemSync,
  useWindowManager,
} from "../../hooks";

import "katex/dist/katex.min.css";
import "../../components/Toast/Toast.module.css";
import styles from "./AppLayout.module.css";

import { ChatLayout } from "..";

import {
  Welcome,
  Agreement,
  UpdateNotes,
  GeminiSetup,
  LoginScreen,
  useAuth,
  useChatTitle,
  useChatEngine,
  useChatSessions,
} from "../../features";

export const AppLayout: React.FC = () => {
  const [isPanelActive, setIsPanelActive] = useState(false);
  const handleToggleSettings = useCallback(() => {
    setIsPanelActive((prev) => !prev);
  }, []);

  const settingsPanelRef = useRef<{ handleClose: () => Promise<boolean> }>(
    null,
  );
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isSubviewActive, setIsSubviewActive] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [isPanelActiveAndVisible, setIsPanelActiveAndVisible] = useState(false);

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

  const { chatTitle, generateSubTitle, generateImageTitle } = useChatTitle({
    startupImage: system.startupImage,
    apiKey: system.apiKey,
    sessionChatTitle: system.sessionChatTitle,
    setSessionChatTitle: system.setSessionChatTitle,
  });

  const chatSessions = useChatSessions();
  const [hasInitializedSession, setHasInitializedSession] = useState(false);

  useEffect(() => {
    if (isChatActive && !hasInitializedSession) {
      chatSessions.createSession("default", chatTitle);
      setHasInitializedSession(true);
    }
  }, [isChatActive, hasInitializedSession]);

  useEffect(() => {
    if (chatSessions.activeSessionId && chatTitle && chatTitle !== "New Chat") {
      const activeSession = chatSessions.getActiveSession();
      if (activeSession && activeSession.title === "New Chat") {
        chatSessions.updateSessionTitle(
          chatSessions.activeSessionId,
          chatTitle,
        );
      }
    }
  }, [chatTitle, chatSessions.activeSessionId]);

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
    isLoadingState,
    isImageMissing,
  );

  useEffect(() => {
    if (isPanelActive) {
      setIsPanelVisible(true);
      const timer = setTimeout(() => {
        setIsPanelActiveAndVisible(true);
      }, 10);
      return () => clearTimeout(timer);
    } else {
      setIsPanelActiveAndVisible(false);
      setIsPanelClosing(true);
      const timer = setTimeout(() => {
        setIsPanelVisible(false);
        setIsPanelClosing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPanelActive]);

  const closeSettingsPanel = async () => {
    if (isPanelActive) {
      if (settingsPanelRef.current) {
        const canClose = await settingsPanelRef.current.handleClose();
        if (canClose) handleToggleSettings();
      } else {
        handleToggleSettings();
      }
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPanelActive) closeSettingsPanel();
    };

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const isMsgBoxClick =
        target.closest(".error-overlay") || target.closest(".error-container");
      const isContextMenuClick = target.closest("#app-context-menu");

      if (
        isPanelActive &&
        panelRef.current &&
        !panelRef.current.contains(target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target as Node) &&
        !isMsgBoxClick &&
        !isContextMenuClick
      ) {
        closeSettingsPanel();
      }
    };

    document.addEventListener("keydown", handleEsc);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isPanelActive, isSubviewActive]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const [isRotating, setIsRotating] = useState(false);
  useEffect(() => {
    if (!chatEngine.isLoading) {
      setIsRotating(false);
    }
  }, [chatEngine.isLoading]);

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
    imageData: string | { path?: string; base64?: string; mimeType: string },
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
      // When new image is loaded, maybe show editor?
      // setIsEditorVisible(true);
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

  if (
    system.hasAgreed === null ||
    auth.authStage === "LOADING" ||
    isCheckingImage
  ) {
    return (
      <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        Loading...
      </div>
    );
  }

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

  if (!system.startupImage) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <Welcome onImageReady={handleImageReady} />
      </div>
    );
  }

  if (auth.authStage === "GEMINI_SETUP") {
    return <GeminiSetup onComplete={auth.completeGeminiSetup} />;
  }

  if (auth.authStage === "LOGIN") {
    return <LoginScreen onComplete={auth.login} />;
  }

  return (
    <div
      ref={containerRef}
      onContextMenu={handleContextMenu}
      className={styles.appContainer}
    >
      <div className={styles.chatPanel}>
        <ChatLayout
          messages={chatEngine.messages}
          streamingText={chatEngine.streamingText}
          isChatMode={chatEngine.isChatMode}
          isLoading={chatEngine.isLoading}
          isStreaming={chatEngine.isStreaming}
          error={chatEngine.error || system.systemError}
          lastSentMessage={chatEngine.lastSentMessage}
          input={input}
          onInputChange={setInput}
          currentModel={system.sessionModel}
          startupImage={system.startupImage}
          chatTitle={chatSessions.getActiveSession()?.title || chatTitle}
          sessions={chatSessions.sessions}
          openTabs={chatSessions.openTabs}
          activeSessionId={chatSessions.activeSessionId}
          onSessionSelect={chatSessions.switchSession}
          onOpenSession={(id: string) => {
            if (chatSessions.activeSessionId) {
              const currentState = chatEngine.getCurrentState();
              chatSessions.updateSession(chatSessions.activeSessionId, {
                messages: currentState.messages,
                streamingText: currentState.streamingText,
                firstResponseId: currentState.firstResponseId,
              });
            }

            chatSessions.openSession(id); // Use openSession instead of switchSession

            const targetSession = chatSessions.getSessionById(id);
            if (targetSession) {
              chatEngine.restoreState({
                messages: targetSession.messages,
                streamingText: targetSession.streamingText,
                firstResponseId: targetSession.firstResponseId,
                isChatMode: targetSession.messages.length > 0,
              });
            }
          }}
          onNewChat={async () => {
            system.setSessionChatTitle(null);
            if (chatSessions.activeSessionId) {
              const currentState = chatEngine.getCurrentState();
              chatSessions.updateSession(chatSessions.activeSessionId, {
                messages: currentState.messages,
                streamingText: currentState.streamingText,
                firstResponseId: currentState.firstResponseId,
              });
            }

            // Create session immediately for instant UI feedback
            const newId = chatSessions.createSession("default", "New Chat");
            chatEngine.handleReload();

            // Generate title in background
            const existingTitles = chatSessions.sessions.map((s) => s.title);
            generateImageTitle(existingTitles).then((newTitle) => {
              chatSessions.updateSessionTitle(newId, newTitle);
            });
          }}
          onCloseSession={(id: string) => {
            const shouldShowWelcome = chatSessions.closeSession(id);
            if (shouldShowWelcome) {
              system.resetSession();
            }
            return shouldShowWelcome;
          }}
          onCloseOtherSessions={chatSessions.closeOtherSessions}
          onCloseSessionsToRight={chatSessions.closeSessionsToRight}
          onSend={() => {
            chatEngine.handleSend(input);
            setInput("");
          }}
          onModelChange={system.setSessionModel}
          onRetry={() => {
            if (chatEngine.messages.length === 0) {
              chatEngine.handleReload();
            } else {
              chatEngine.handleRetrySend();
            }
          }}
          onCheckSettings={() => {
            setIsPanelActive(true);
            chatEngine.clearError();
          }}
          onReload={() => {
            setIsRotating(true);
            chatEngine.handleReload();
          }}
          sessionLensUrl={system.sessionLensUrl}
          setSessionLensUrl={system.setSessionLensUrl}
          onDescribeEdits={async (description) => {
            const existingTitles = chatSessions.sessions.map((s) => s.title);
            const editTitle = await generateSubTitle(
              description,
              existingTitles,
            );
            chatSessions.createSession("edit", editTitle);
            chatEngine.handleDescribeEdits(description);
          }}
          // ChatHeader Props
          isRotating={isRotating}
          isPanelActive={isPanelActive}
          toggleSettingsPanel={handleToggleSettings}
          isPanelVisible={isPanelVisible}
          isPanelActiveAndVisible={isPanelActiveAndVisible}
          isPanelClosing={isPanelClosing}
          settingsButtonRef={settingsButtonRef}
          panelRef={panelRef}
          settingsPanelRef={settingsPanelRef}
          prompt={system.editingPrompt}
          editingModel={system.editingModel}
          setPrompt={system.setEditingPrompt}
          onEditingModelChange={system.setEditingModel}
          userName={system.userName}
          userEmail={system.userEmail}
          avatarSrc={system.avatarSrc}
          onSave={system.saveSettings}
          onLogout={performLogout}
          isDarkMode={system.isDarkMode}
          onToggleTheme={system.handleToggleTheme}
          onResetAPIKey={system.handleResetAPIKey}
          toggleSubview={setIsSubviewActive}
          onNewSession={system.resetSession}
          hasImageLoaded={!!system.startupImage}
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
