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

import { ChatLayout, TabLayout } from "..";

import {
  Agreement,
  UpdateNotes,
  GeminiSetup,
  LoginScreen,
  useAuth,
  useChatTitle,
  useChatSessions,
  Welcome,
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

  // Chat Sessions Hook
  const chatSessions = useChatSessions();
  const activeSession = chatSessions.getActiveSession();
  const activeImage = activeSession?.imageData || null;
  
  const activeSessionIdRef = useRef(chatSessions.activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = chatSessions.activeSessionId;
  }, [chatSessions.activeSessionId]);

  // Processing flag to prevent duplicate event handling
  const isProcessingRef = useRef(false);
  const hasProcessedStartupImage = useRef(false);
  
  // Ref for handleImageReady to avoid stale closures in event listener
  const handleImageReadyRef = useRef<any>(null);
  useEffect(() => {
      handleImageReadyRef.current = handleImageReady;
  });

  useEffect(() => {
    if (auth.authStage === 'LOADING') return;
    if (hasProcessedStartupImage.current) return;

    // If we are fully authenticated (not in setup/login screens), wait for API key
    const isAuthComplete = auth.authStage !== 'GEMINI_SETUP' && auth.authStage !== 'LOGIN';
    if (isAuthComplete && !system.apiKey) return;

    const initStartupImage = async () => {
      hasProcessedStartupImage.current = true;
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
  }, [auth.authStage, system.apiKey]);

  useEffect(() => {
    const unlistenImagePath = listen<string>("image-path", async (event) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      const imagePath = event.payload;
      if (imagePath) {
        try {
          console.log("Event received for image:", imagePath);
          const result = await commands.processImagePath(imagePath);
          if (handleImageReadyRef.current) handleImageReadyRef.current(result);
        } catch (error) {
          console.error("Failed to process CLI image event:", error);
        } finally {
          // Simple debounce/cooldown
          setTimeout(() => {
            isProcessingRef.current = false;
          }, 500);
        }
      } else {
        isProcessingRef.current = false;
      }
    });

    const unlistenDragDrop = listen<any>("drag-drop-image", (event) => {
        const payload = event.payload;
        if (payload) {
             console.log("Received global drag-drop-image event");
             const targetId = activeSessionIdRef.current;
             if (handleImageReadyRef.current) {
                 handleImageReadyRef.current(payload, targetId || undefined);
             }
        }
    });

    return () => {
      unlistenImagePath.then((f) => f());
      unlistenDragDrop.then((f) => f());
    };
  }, []);

  const isAgreementPending = system.hasAgreed === false;
  const isLoadingState =
    system.hasAgreed === null ||
    auth.authStage === "LOADING" ||
    isCheckingImage;
  const isImageMissing = false;
  const isAuthPending =
    auth.authStage === "GEMINI_SETUP" || auth.authStage === "LOGIN";
  const isChatActive = !isLoadingState && !isAgreementPending && !isAuthPending;

  // Enable AI Title Generation
  const { chatTitle, generateImageTitle } = useChatTitle({
    startupImage: activeImage,
    apiKey: system.apiKey,
    sessionChatTitle: activeSession?.title || null,
    setSessionChatTitle: (title) => {
      if (chatSessions.activeSessionId) {
        chatSessions.updateSessionTitle(chatSessions.activeSessionId, title);
      }
    },
  });

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
    if (!activeSession?.isLoading) {
      setIsRotating(false);
    }
  }, [activeSession?.isLoading]);

  useEffect(() => {
    const unlisten = listen<any>("auth-success", (event) => {
      system.updateUserData(event.payload);
      auth.login();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
  // Image upload handler - accepts explicit sessionId to prevent cross-tab bugs
  const handleImageReady = (
    imageData: string | { path?: string; base64?: string; mimeType: string },
    targetSessionId?: string,
  ) => {
    let imageObj: {
      base64: string;
      mimeType: string;
      isFilePath?: boolean;
    } | null = null;

    if (typeof imageData === "string") {
      if (!imageData || !imageData.includes(",")) return;

      const [header] = imageData.split(",");
      const mimeType = header.replace("data:", "").replace(";base64", "");

      imageObj = {
        base64: imageData,
        mimeType: mimeType,
        isFilePath: false,
      };
    } else {
      if (imageData.path) {
        imageObj = {
          base64: convertFileSrc(imageData.path),
          mimeType: imageData.mimeType,
          isFilePath: true,
        };
      } else if (imageData.base64) {
        imageObj = {
          base64: imageData.base64,
          mimeType: imageData.mimeType,
          isFilePath: false,
        };
      }
    }

    if (!imageObj) return;

    let sessionId = targetSessionId;

    // Use explicit sessionId if provided, otherwise create new session
    if (targetSessionId) {
      chatSessions.updateSessionImage(targetSessionId, imageObj);
    } else {
      // No session specified - create a new one
      const newId = chatSessions.createSession("default", "New Chat");
      chatSessions.updateSessionImage(newId, imageObj);
      sessionId = newId;
    }

    system.setStartupImage(null);

    // Auto-generate title
    if (sessionId && imageObj.base64 && imageObj.mimeType) {
      // Start Chat Session immediately with explicit image data
      chatSessions.startChatSession(
        sessionId,
        system.apiKey,
        system.sessionModel,
        system.prompt,
        imageObj
      );

      generateImageTitle(imageObj.base64, imageObj.mimeType)
        .then((title) => {
          if (sessionId) {
            chatSessions.updateSessionTitle(sessionId, title);
          }
        })
        .catch((err) => console.error("Title generation failed:", err));
    }
  };

  const handleShowWelcome = () => {
    chatSessions.createSession("default", "New Chat");
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
      <TabLayout
        onImageReady={handleImageReady}
        chatTitle={activeSession?.title || "New Chat"}
        onReload={() => {
          setIsRotating(true);
          if (chatSessions.activeSessionId) {
            chatSessions.startChatSession(
              chatSessions.activeSessionId,
              system.apiKey,
              system.sessionModel,
              system.prompt
            );
          }
        }}
        isRotating={isRotating}
        currentModel={system.sessionModel}
        onModelChange={system.setSessionModel}
        isLoading={activeSession?.isLoading || false}
        sessions={chatSessions.sessions}
        openTabs={chatSessions.openTabs}
        activeSessionId={chatSessions.activeSessionId}
        onSessionSelect={chatSessions.switchSession}
        onOpenSession={(id: string) => {
          chatSessions.openSession(id);
        }}
        onNewChat={() => {
          chatSessions.createSession("default", "New Chat");
        }}
        onCloseSession={(id: string) => {
          return chatSessions.closeSession(id);
        }}
        onCloseOtherSessions={chatSessions.closeOtherSessions}
        onCloseSessionsToRight={chatSessions.closeSessionsToRight}
        onShowWelcome={handleShowWelcome}
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
      >
        {/* ALL TABS MOUNTED - CSS visibility toggle, no remounting */}
        {chatSessions.openTabs.map((session) => (
          <div
            key={session.id}
            style={{
              display:
                session.id === chatSessions.activeSessionId
                  ? "contents"
                  : "none",
            }}
          >
            {session.imageData ? (
              <ChatLayout
                messages={session.messages || []}
                streamingText={session.streamingText || ""}
                isChatMode={(session.messages?.length || 0) > 0}
                isLoading={session.isLoading || false}
                isStreaming={!!session.streamingText}
                error={
                  session.id === chatSessions.activeSessionId
                    ? session.error || system.systemError
                    : null
                }
                lastSentMessage={null}
                startupImage={session.imageData}
                chatTitle={session.title || "New Chat"}
                sessionLensUrl={session.lensUrl}
                setSessionLensUrl={(url) =>
                  chatSessions.updateSessionLensUrl(session.id, url)
                }
                onDescribeEdits={async (description) => {
                  // Feature not fully implemented
                }}
                onImageUpload={(data) => handleImageReady(data, session.id)}
                onRetry={() => {
                  chatSessions.retryChatMessage(session.id);
                }}
                onCheckSettings={() => {
                  setIsPanelActive(true);
                }}
                onSend={(text) => chatSessions.sendChatMessage(session.id, text)}
              />
            ) : (
              <Welcome
                onImageReady={(data) => handleImageReady(data, session.id)}
                isActive={session.id === chatSessions.activeSessionId}
              />
            )}
          </div>
        ))}
        {/* Show Welcome when no tabs are open */}
        {chatSessions.openTabs.length === 0 && (
          <Welcome onImageReady={(data) => handleImageReady(data)} isActive={true} />
        )}
      </TabLayout>

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
