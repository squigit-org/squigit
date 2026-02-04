/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

import { exit } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/api/tauri/commands";
import { ShellContextMenu, TitleBar } from "@/widgets";

import {
  useSystemSync,
  useWindowManager,
  useUpdateCheck,
  getPendingUpdate,
} from "@/hooks";

import "katex/dist/katex.min.css";
import styles from "./AppLayout.module.css";

import { ChatLayout } from "..";

import {
  Welcome,
  Agreement,
  UpdateNotes,
  OAuthLogin,
  useAuth,
  useChatTitle,
  useChat,
  ChatPanel,
  useChatHistory,
} from "@/features";

import {
  loadChat,
  getImagePath,
  createChat,
  updateChatMetadata,
  appendChatMessage,
  saveOcrData,
  saveImgbbUrl,
  overwriteChatMessages,
} from "@/lib/storage/chatStorage";

export const AppLayout: React.FC = () => {
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [enablePanelAnimation, setEnablePanelAnimation] = useState(false);
  const toggleChatPanel = () => setIsChatPanelOpen((prev) => !prev);

  const system = useSystemSync();
  const auth = useAuth();
  const chatHistory = useChatHistory();
  const performLogout = async () => {
    await system.handleLogout();
    auth.logout();
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
  const isAuthPending = auth.authStage === "LOGIN";
  const isChatActive =
    !isLoadingState && !isAgreementPending && !isImageMissing && !isAuthPending;

  useEffect(() => {
    if (!isLoadingState && !system.startupImage) {
      setIsChatPanelOpen(true);
      setTimeout(() => setEnablePanelAnimation(true), 100);
    } else if (!isLoadingState) {
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

  useEffect(() => {
    const activeId = chatHistory.activeSessionId;
    if (activeId && chatTitle && chatTitle !== "New Chat") {
      const currentChat = chatHistory.chats.find((c: any) => c.id === activeId);
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

  const handleSelectChat = async (id: string) => {
    try {
      setOcrData([]);
      const chatData = await loadChat(id);
      const imagePath = await getImagePath(chatData.metadata.image_hash);
      const imageUrl = convertFileSrc(imagePath);

      system.setStartupImage({
        base64: imageUrl,
        mimeType: "image/png",
        isFilePath: true,
        imageId: chatData.metadata.image_hash,
        fromHistory: true,
      } as any);

      system.setSessionChatTitle(chatData.metadata.title);

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

      if (chatData.ocr_data && chatData.ocr_data.length > 0) {
        setOcrData(
          chatData.ocr_data.map((o) => ({
            text: o.text,
            box: o.bbox,
          })),
        );
      }

      setSessionLensUrl(chatData.imgbb_url || null);

      chatHistory.setActiveSessionId(id);
    } catch (e) {
      console.error("Failed to load chat:", e);
    }
  };

  const handleNewSession = () => {
    system.resetSession();
    chatHistory.setActiveSessionId(null);
    setOcrData([]);
    setSessionLensUrl(null);
  };

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

  const handleImageReady = async (imageData: {
    imageId: string;
    path: string;
  }) => {
    console.log("Raw image path:", imageData.path);
    const assetUrl = convertFileSrc(imageData.path);
    console.log("Converted asset URL:", assetUrl);

    chatHistory.setActiveSessionId(null);
    setOcrData([]);
    setSessionLensUrl(null);

    system.setStartupImage({
      base64: assetUrl,
      mimeType: "image/png",
      isFilePath: true,
      imageId: imageData.imageId,
    });

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
    const target = e.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }

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

  if (auth.authStage === "LOGIN") {
    return <OAuthLogin onComplete={auth.login} />;
  }

  if (!system.startupImage) {
    return (
      <div className={styles.appContainer} onContextMenu={handleContextMenu}>
        <TitleBar
          chatTitle={"SnapLLM"}
          onReload={() => {}}
          isRotating={false}
          currentModel={system.sessionModel}
          onModelChange={system.setSessionModel}
          isLoading={false}
          onLogout={performLogout}
          isDarkMode={system.isDarkMode}
          // prompt={system.editingPrompt}
          // editingModel={system.editingModel}
          // setPrompt={system.setEditingPrompt}
          // onEditingModelChange={system.setEditingModel}
          // onToggleTheme={system.handleToggleTheme}
          // onNewSession={handleNewSession}
          hasImageLoaded={false}
          toggleChatPanel={toggleChatPanel}
          isChatPanelOpen={isChatPanelOpen}
          activeProfile={system.activeProfile}
          profiles={system.profiles}
          onSwitchProfile={system.switchProfile}
          onAddAccount={system.addAccount}
        />
        <div className={styles.mainContent}>
          <div
            className={`${styles.chatPanelWrapper} ${!isChatPanelOpen ? styles.hidden : ""} ${enablePanelAnimation ? styles.animated : ""}`}
          >
            <ChatPanel
              chats={chatHistory.chats}
              activeSessionId={chatHistory.activeSessionId}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewSession}
              onDeleteChat={chatHistory.handleDeleteChat}
              onDeleteChats={chatHistory.handleDeleteChats}
              onRenameChat={chatHistory.handleRenameChat}
              onTogglePinChat={chatHistory.handleTogglePinChat}
              onToggleStarChat={chatHistory.handleToggleStarChat}
            />
          </div>
          <div className={styles.contentArea}>
            <Welcome onImageReady={handleImageReady} />
          </div>
        </div>
        {contextMenu && (
          <ShellContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={handleCloseContextMenu}
            onCopy={handleCopy}
            selectedText={contextMenu.selectedText}
            hasSelection={true}
          />
        )}
      </div>
    );
  }

  const handleDeleteChatWrapper = async (id: string) => {
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
      <ChatLayout
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
        onReload={() => {
          setIsRotating(true);
          const activeId = chatHistory.activeSessionId;
          if (activeId) {
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
        onStreamComplete={chat.handleStreamComplete}
        // TitleBar props
        activeProfile={system.activeProfile}
        profiles={system.profiles}
        onSwitchProfile={system.switchProfile}
        onAddAccount={system.addAccount}
        isRotating={isRotating}
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
        activeProfileId={null}
      />

      {contextMenu && (
        <ShellContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onCopy={handleCopy}
          selectedText={contextMenu.selectedText}
          hasSelection={true}
        />
      )}
    </div>
  );
};
