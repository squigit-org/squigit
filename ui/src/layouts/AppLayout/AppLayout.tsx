/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

import { exit } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "../../lib/api/tauri/commands";
import { ContextMenu, ContextMenuItem, TitleBar } from "../../widgets";

import {
  useUpdateCheck,
  getPendingUpdate,
  useSystemSync,
  useWindowManager,
} from "../../hooks";

import "katex/dist/katex.min.css";
import styles from "./AppLayout.module.css";

import { TabLayout } from "..";

import {
  Welcome,
  Agreement,
  UpdateNotes,
  GeminiSetup,
  LoginScreen,
  useAuth,
  useChatTitle,
  useChat,
  ChatPanel,
  SettingsTab,
} from "../../features";

import {
  loadChat,
  getImagePath,
  createChat,
  updateChatMetadata,
  appendChatMessage,
  saveOcrData,
  saveImgbbUrl,
  overwriteChatMessages,
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
  const [enablePanelAnimation, setEnablePanelAnimation] = useState(false);
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

  const handleUpdateLensUrl = useCallback(
    (url: string | null) => {
      setSessionLensUrl(url);
      const activeId = chatHistory.activeSessionId;
      if (activeId && url) {
        saveImgbbUrl(activeId, url).catch((e) =>
          console.error("Failed to save ImgBB URL", e),
        );
      }
    },
    [chatHistory.activeSessionId],
  );

  const [ocrData, setOcrData] = useState<{ text: string; box: number[][] }[]>(
    [],
  );

  const handleUpdateOCRData = useCallback(
    (data: { text: string; box: number[][] }[]) => {
      setOcrData(data);
    },
    [],
  );

  // Persist OCR data when available and chat is active
  useEffect(() => {
    const activeId = chatHistory.activeSessionId;
    if (activeId && ocrData.length > 0) {
      const ocrRegions = ocrData.map((d) => ({ text: d.text, bbox: d.box }));
      saveOcrData(activeId, ocrRegions).catch((e) =>
        console.error("Failed to save OCR", e),
      );
    }
  }, [ocrData, chatHistory.activeSessionId]);

  const handleMessageAdded = useCallback(
    (msg: any, targetChatId?: string) => {
      const activeId = targetChatId || chatHistory.activeSessionId;
      if (activeId) {
        const role = msg.role === "user" ? "user" : "assistant";
        appendChatMessage(activeId, role, msg.text).catch(console.error);
      }
    },
    [chatHistory.activeSessionId],
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

  // Auto-open side panel if no image
  useEffect(() => {
    if (!isLoadingState && !system.startupImage) {
      setIsChatPanelOpen(true);
      // Enable animation on next tick/shortly after to allow initial render without it
      setTimeout(() => setEnablePanelAnimation(true), 100);
    } else if (!isLoadingState) {
      // If we didn't auto-open (e.g. image present), enable animation immediately
      setEnablePanelAnimation(true);
    }
  }, [isLoadingState, system.startupImage]);

  const chat = useChat({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
    enabled: isChatActive,
    onMessage: handleMessageAdded,
    chatId: chatHistory.activeSessionId,
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
        fromHistory: true,
      } as any);

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

      chat.restoreState(
        {
          messages,
          streamingText: "",
          firstResponseId: null,
          isChatMode: true,
        },
        {
          base64: imageUrl,
          mimeType: "image/png",
        },
      );

      // 5. Restore OCR data if present
      if (chatData.ocr_data && chatData.ocr_data.length > 0) {
        setOcrData(
          chatData.ocr_data.map((o) => ({
            text: o.text,
            box: o.bbox,
          })),
        );
      }

      // 6. Restore ImgBB URL if present
      setSessionLensUrl(chatData.imgbb_url || null);

      chatHistory.setActiveSessionId(id);
    } catch (e) {
      console.error("Failed to load chat:", e);
    }
  };

  const handleNewSession = () => {
    if (isPanelActive) {
      handleToggleSettings();
    }
    system.resetSession();
    chatHistory.setActiveSessionId(null);
    setOcrData([]); // Clear OCR data
    setSessionLensUrl(null); // Clear ImgBB URL
  };

  // Drafts state
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});

  const activeDraftId = chatHistory.activeSessionId || "new_session";

  const input = chatDrafts[activeDraftId] || "";
  const setInput = (val: string) => {
    setChatDrafts((prev) => ({ ...prev, [activeDraftId]: val }));
  };

  const imageInput = imageDrafts[activeDraftId] || "";
  const setImageInput = (val: string) => {
    setImageDrafts((prev) => ({ ...prev, [activeDraftId]: val }));
  };

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
    if (!chat.isLoading) {
      setIsRotating(false);
    }
  }, [chat.isLoading]);

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

  if (auth.authStage === "GEMINI_SETUP") {
    return <GeminiSetup onComplete={auth.completeGeminiSetup} />;
  }

  if (auth.authStage === "LOGIN") {
    return <LoginScreen onComplete={auth.login} />;
  }

  if (!system.startupImage) {
    // Handle chat selection - toggle settings off and open chat
    const handleSelectChatWithSettings = async (id: string) => {
      await handleSelectChat(id);
      if (isPanelActive) {
        handleToggleSettings();
      }
    };

    const displayTitle = isPanelActive ? "Settings" : "SnapLLM";

    return (
      <div className={styles.appContainer} onContextMenu={handleContextMenu}>
        <TitleBar
          chatTitle={displayTitle}
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
          toggleSubview={setIsSubviewActive}
          onNewSession={handleNewSession}
          hasImageLoaded={false}
          toggleChatPanel={toggleChatPanel}
          isChatPanelOpen={isChatPanelOpen}
        />
        <div className={styles.mainContent}>
          <div
            className={`${styles.chatPanelWrapper} ${!isChatPanelOpen ? styles.hidden : ""} ${enablePanelAnimation ? styles.animated : ""}`}
          >
            <ChatPanel
              chats={chatHistory.chats}
              activeSessionId={chatHistory.activeSessionId}
              onSelectChat={handleSelectChatWithSettings}
              onNewChat={handleNewSession}
              onDeleteChat={chatHistory.handleDeleteChat}
              onDeleteChats={chatHistory.handleDeleteChats}
              onRenameChat={chatHistory.handleRenameChat}
              onTogglePinChat={chatHistory.handleTogglePinChat}
              onToggleStarChat={chatHistory.handleToggleStarChat}
            />
          </div>
          <div className={styles.contentArea}>
            {isPanelActive ? (
              <SettingsTab
                currentPrompt={system.editingPrompt}
                currentModel={system.editingModel}
                userName={system.userName}
                userEmail={system.userEmail}
                avatarSrc={system.avatarSrc}
                originalPicture={system.originalPicture}
                onPromptChange={system.setEditingPrompt}
                onModelChange={system.setEditingModel}
                onSave={system.saveSettings}
                onLogout={performLogout}
                isDarkMode={system.isDarkMode}
                onToggleTheme={system.handleToggleTheme}
                autoExpandOCR={system.autoExpandOCR}
                setAutoExpandOCR={system.setAutoExpandOCR}
                captureType={system.captureType}
                setCaptureType={system.setCaptureType}
                geminiKey={system.apiKey}
                imgbbKey={system.imgbbKey}
                onSetAPIKey={system.handleSetAPIKey}
                isChatPanelOpen={isChatPanelOpen}
              />
            ) : (
              <Welcome onImageReady={handleImageReady} />
            )}
          </div>
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={handleCloseContextMenu}
          >
            <ContextMenuItem
              onClick={() => {
                handleCopy();
                handleCloseContextMenu();
              }}
            >
              Copy
            </ContextMenuItem>
          </ContextMenu>
        )}
      </div>
    );
  }

  // Wrappers for deletion to handle active session reset
  const handleDeleteChatWrapper = async (id: string) => {
    // Check if we are deleting the active chat
    const isActive = chatHistory.activeSessionId === id;
    await chatHistory.handleDeleteChat(id);
    if (isActive) {
      handleNewSession();
    }
  };

  const handleDeleteChatsWrapper = async (ids: string[]) => {
    const isActiveIncluded =
      chatHistory.activeSessionId && ids.includes(chatHistory.activeSessionId);
    await chatHistory.handleDeleteChats(ids);
    if (isActiveIncluded) {
      handleNewSession();
    }
  };

  const handleToggleStarChatWrapper = async (id: string) => {
    await chatHistory.handleToggleStarChat(id);
  };

  return (
    <div
      ref={containerRef}
      onContextMenu={handleContextMenu}
      className={styles.appContainer}
    >
      <TabLayout
        messages={chat.messages}
        streamingText={chat.streamingText}
        isChatMode={chat.isChatMode}
        isLoading={chat.isLoading}
        isStreaming={chat.isStreaming}
        error={chat.error || system.systemError}
        lastSentMessage={chat.lastSentMessage}
        input={input}
        onInputChange={setInput}
        currentModel={system.sessionModel}
        startupImage={system.startupImage}
        chatTitle={chatTitle}
        chatId={chatHistory.activeSessionId}
        onSend={() => {
          chat.handleSend(input);
          setInput("");
        }}
        onModelChange={system.setSessionModel}
        onRetry={() => {
          if (chat.messages.length === 0) {
            chat.handleReload();
          } else {
            chat.handleRetrySend();
          }
        }}
        onCheckSettings={() => {
          handleToggleSettings();
          chat.clearError();
        }}
        onReload={() => {
          setIsRotating(true);
          const activeId = chatHistory.activeSessionId;
          if (activeId) {
            // Clear messages in storage before reloading
            overwriteChatMessages(activeId, []).then(() => {
              chat.handleReload();
            });
          } else {
            chat.handleReload();
          }
        }}
        onDescribeEdits={async (description) => {
          chat.handleDescribeEdits(description);
        }}
        sessionLensUrl={sessionLensUrl}
        setSessionLensUrl={handleUpdateLensUrl}
        ocrData={ocrData}
        onUpdateOCRData={handleUpdateOCRData}
        imageInputValue={imageInput}
        onImageInputChange={setImageInput}
        // Settings props
        currentPrompt={system.editingPrompt}
        editingModel={system.editingModel}
        userName={system.userName}
        userEmail={system.userEmail}
        avatarSrc={system.avatarSrc}
        originalPicture={system.originalPicture}
        onSave={system.saveSettings}
        onLogout={performLogout}
        isDarkMode={system.isDarkMode}
        onToggleTheme={system.handleToggleTheme}
        onPromptChange={system.setEditingPrompt}
        autoExpandOCR={system.autoExpandOCR}
        setAutoExpandOCR={system.setAutoExpandOCR}
        captureType={system.captureType}
        setCaptureType={system.setCaptureType}
        geminiKey={system.apiKey}
        imgbbKey={system.imgbbKey}
        onSetAPIKey={system.handleSetAPIKey}
        // TitleBar props
        isRotating={isRotating}
        isPanelActive={isPanelActive}
        toggleSettingsPanel={handleToggleSettings}
        isPanelVisible={isPanelVisible}
        isPanelActiveAndVisible={isPanelActiveAndVisible}
        isPanelClosing={isPanelClosing}
        settingsButtonRef={settingsButtonRef}
        panelRef={panelRef}
        settingsPanelRef={settingsPanelRef}
        setPrompt={system.setEditingPrompt}
        onEditingModelChange={system.setEditingModel}
        toggleSubview={setIsSubviewActive}
        onNewSession={handleNewSession}
        hasImageLoaded={!!system.startupImage}
        toggleChatPanel={toggleChatPanel}
        isChatPanelOpen={isChatPanelOpen}
        enablePanelAnimation={enablePanelAnimation}
        // ChatPanel props
        chats={chatHistory.chats}
        activeSessionId={chatHistory.activeSessionId}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChatWrapper}
        onDeleteChats={handleDeleteChatsWrapper}
        onRenameChat={chatHistory.handleRenameChat}
        onTogglePinChat={chatHistory.handleTogglePinChat}
        onToggleStarChat={handleToggleStarChatWrapper}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
        >
          <ContextMenuItem
            onClick={() => {
              handleCopy();
              handleCloseContextMenu();
            }}
          >
            Copy
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
};
