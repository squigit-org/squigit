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
import { ContextMenu, TitleBar } from "../../components";

import {
  useUpdateCheck,
  getPendingUpdate,
  useSystemSync,
  useWindowManager,
} from "../../hooks";

import "katex/dist/katex.min.css";
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
  ChatPanel,
} from "../../features";
import { Dialog } from "../../components";
import {
  loadChat,
  getImagePath,
  createChat,
  updateChatMetadata,
} from "../../lib/storage/chatStorage";
import { useChatHistory } from "../../hooks";

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

  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const toggleChatPanel = () => setIsChatPanelOpen((prev) => !prev);

  const system = useSystemSync(handleToggleSettings);
  const auth = useAuth();
  const chatHistory = useChatHistory();
  const performLogout = async () => {
    await system.handleLogout();
    auth.logout();
    setIsPanelActive(false);
  };
  useUpdateCheck();

  const [sessionLensUrl, setSessionLensUrl] = useState<string | null>(null);
  const [ocrData, setOcrData] = useState<{ text: string; box: number[][] }[]>(
    [],
  );

  const [isCheckingImage, setIsCheckingImage] = useState(true);

  useEffect(() => {
    const initStartupImage = async () => {
      try {
        const initialImage = await commands.getInitialImage();
        if (initialImage) {
          console.log("Found CLI image in state, loading...");
          handleImageReady({
            imageId: initialImage.hash,
            path: initialImage.path,
          });
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
          handleImageReady({
            imageId: result.hash,
            path: result.path,
          });
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

  const { chatTitle } = useChatTitle({
    startupImage: system.startupImage,
    apiKey: system.apiKey,
    sessionChatTitle: system.sessionChatTitle,
    setSessionChatTitle: system.setSessionChatTitle,
  });

  // Persist chat title when it changes
  useEffect(() => {
    const activeId = chatHistory.activeSessionId;
    if (activeId && chatTitle && chatTitle !== "New Chat") {
      // Find current chat to get metadata
      const currentChat = chatHistory.chats.find((c) => c.id === activeId);
      if (currentChat && currentChat.title !== chatTitle) {
        updateChatMetadata({
          ...currentChat,
          title: chatTitle,
          updated_at: new Date().toISOString(),
        }).then(() => {
          chatHistory.handleRenameChat(activeId, chatTitle);
        });
      }
    }
  }, [chatTitle, chatHistory.activeSessionId]);

  // Handle selecting a chat from history
  const handleSelectChat = async (id: string) => {
    try {
      setOcrData([]); // Clear previous OCR data immediately
      const chatData = await loadChat(id);

      // 1. Get image path from hash
      const imagePath = await getImagePath(chatData.metadata.image_hash);
      const imageUrl = convertFileSrc(imagePath);

      // 2. Set startup image
      system.setStartupImage({
        base64: imageUrl,
        mimeType: "image/png",
        isFilePath: true,
        imageId: chatData.metadata.image_hash,
      });

      // 3. Set chat title
      system.setSessionChatTitle(chatData.metadata.title);

      // 4. Restore chat engine state
      // Map ChatMessage to Message type
      const messages = chatData.messages.map((m, idx) => ({
        id: idx.toString(), // or generate UUID
        role: m.role as "user" | "model",
        text: m.content,
        timestamp: new Date(m.timestamp).getTime(),
      }));

      chatEngine.restoreState({
        messages,
        streamingText: "",
        firstResponseId: null,
        isChatMode: true,
      });

      // 5. Restore OCR data if present
      if (chatData.ocr_data && chatData.ocr_data.length > 0) {
        setOcrData(
          chatData.ocr_data.map((o) => ({
            text: o.text,
            box: o.bbox,
          })),
        );
      }

      chatHistory.setActiveSessionId(id);
    } catch (e) {
      console.error("Failed to load chat:", e);
    }
  };

  const handleNewSession = () => {
    system.resetSession();
    chatHistory.setActiveSessionId(null);
    setOcrData([]); // Clear OCR data
  };

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

  // Handle CAS image data from Welcome component
  const handleImageReady = async (imageData: {
    imageId: string;
    path: string;
  }) => {
    // Store using file path and convertFileSrc for rendering
    console.log("Raw image path:", imageData.path);
    const assetUrl = convertFileSrc(imageData.path);
    console.log("Converted asset URL:", assetUrl);

    setOcrData([]); // Clear previous OCR data immediately

    system.setStartupImage({
      base64: assetUrl,
      mimeType: "image/png", // CAS stores as PNG
      isFilePath: true,
      imageId: imageData.imageId, // Store the hash for chat association
    });

    // Create a new chat in storage
    try {
      const newChat = await createChat("New Chat", imageData.imageId);
      chatHistory.setActiveSessionId(newChat.id);
      chatHistory.refreshChats();
      console.log("Created new chat:", newChat.id);
    } catch (e) {
      console.error("Failed to create chat:", e);
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
      <div className={styles.appContainer}>
        <TitleBar
          chatTitle="Spatialshot"
          onReload={() => {}}
          isRotating={false}
          currentModel={system.sessionModel}
          onModelChange={system.setSessionModel}
          isLoading={false}
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
          onNewSession={handleNewSession}
          hasImageLoaded={false}
          toggleChatPanel={toggleChatPanel}
          isChatPanelOpen={isChatPanelOpen}
        />
        <div className={styles.mainContent}>
          <div
            className={`${styles.chatPanelWrapper} ${!isChatPanelOpen ? styles.hidden : ""}`}
          >
            <ChatPanel
              chats={chatHistory.chats}
              projects={chatHistory.projects}
              activeSessionId={chatHistory.activeSessionId}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewSession}
              onDeleteChat={chatHistory.handleDeleteChat}
              onDeleteChats={chatHistory.handleDeleteChats}
              onRenameChat={chatHistory.handleRenameChat}
              onTogglePinChat={chatHistory.handleTogglePinChat}
              onToggleStarChat={chatHistory.handleToggleStarChat}
              onCreateProject={chatHistory.handleCreateProject}
              onMoveChatToProject={chatHistory.handleMoveChatToProject}
            />
          </div>
          <div className={styles.contentArea}>
            <Welcome onImageReady={handleImageReady} />
          </div>
        </div>
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
      <TitleBar
        chatTitle={chatTitle}
        onReload={() => {
          setIsRotating(true);
          chatEngine.handleReload();
        }}
        isRotating={isRotating}
        currentModel={system.sessionModel}
        onModelChange={system.setSessionModel}
        isLoading={chatEngine.isLoading}
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
        onNewSession={handleNewSession}
        hasImageLoaded={!!system.startupImage}
        toggleChatPanel={toggleChatPanel}
        isChatPanelOpen={isChatPanelOpen}
      />
      <div className={styles.mainContent}>
        <div
          className={`${styles.chatPanelWrapper} ${!isChatPanelOpen ? styles.hidden : ""}`}
        >
          <ChatPanel
            chats={chatHistory.chats}
            projects={chatHistory.projects}
            activeSessionId={chatHistory.activeSessionId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewSession}
            onDeleteChat={chatHistory.handleDeleteChat}
            onDeleteChats={chatHistory.handleDeleteChats}
            onRenameChat={chatHistory.handleRenameChat}
            onTogglePinChat={chatHistory.handleTogglePinChat}
            onToggleStarChat={chatHistory.handleToggleStarChat}
            onCreateProject={chatHistory.handleCreateProject}
            onMoveChatToProject={chatHistory.handleMoveChatToProject}
          />
        </div>

        <div className={styles.contentArea}>
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
            chatTitle={chatTitle}
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
            onDescribeEdits={async (description) => {
              chatEngine.handleDescribeEdits(description);
            }}
            sessionLensUrl={sessionLensUrl}
            setSessionLensUrl={setSessionLensUrl}
            ocrData={ocrData}
            onUpdateOCRData={setOcrData}
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
            onNewSession={handleNewSession}
            hasImageLoaded={!!system.startupImage}
            toggleChatPanel={toggleChatPanel}
            isChatPanelOpen={isChatPanelOpen}
          />
        </div>
      </div>

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
