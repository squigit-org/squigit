/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { exit } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/api/tauri/commands";
import {
  useSystemSync,
  useWindowManager,
  useUpdateCheck,
  getPendingUpdate,
} from "@/hooks";
import { useAuth, useChat, useChatHistory } from "@/features";
import { ModelType } from "@/lib/config/models";
import {
  loadChat,
  getImagePath,
  createChat,
  updateChatMetadata,
  appendChatMessage,
  saveOcrData,
  saveImgbbUrl,
  overwriteChatMessages,
} from "@/lib/storage/chat";
import { SettingsSection } from "./overlays";

export const useShell = () => {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [enablePanelAnimation, setEnablePanelAnimation] = useState(false);
  const toggleSidePanel = () => setIsSidePanelOpen((prev) => !prev);

  const [showGeminiAuthDialog, setShowGeminiAuthDialog] = useState(false);
  const [showLoginRequiredDialog, setShowLoginRequiredDialog] = useState(false);

  const system = useSystemSync();
  const activeProfileRef = useRef<any>(null);

  useEffect(() => {
    activeProfileRef.current = system.activeProfile;
  }, [system.activeProfile]);

  const auth = useAuth();
  const chatHistory = useChatHistory(system.activeProfile?.id || null);

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

  // Image handling
  const handleImageReady = async (imageData: {
    imageId: string;
    path: string;
  }) => {
    // Guest Mode Check
    if (!system.activeProfile) {
      console.log("Image upload attempted in guest mode - requiring login");
      setShowLoginRequiredDialog(true);
      return;
    }

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
        // Guest Mode Check
        if (!activeProfileRef.current) {
          console.log(
            "CLI/External image drop attempted in guest mode - requiring login",
          );
          setShowLoginRequiredDialog(true);
          return;
        }

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
      setIsSidePanelOpen(true);
      setTimeout(() => setEnablePanelAnimation(true), 100);
    } else if (!isLoadingState) {
      setEnablePanelAnimation(true);
    }
  }, [isLoadingState, system.startupImage]);

  const [isRotating, setIsRotating] = useState(false);

  const chat = useChat({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
    enabled: isChatActive,
    onMessage: handleMessageAdded,
    chatId: chatHistory.activeSessionId,
    onMissingApiKey: () => {
      setShowGeminiAuthDialog(true);
      setIsRotating(false);
    },
    onTitleGenerated: (title: string) => {
      system.setSessionChatTitle(title);
    },
  });

  useEffect(() => {
    if (!chat.isLoading) {
      setIsRotating(false);
    }
  }, [chat.isLoading]);

  const chatTitle = system.sessionChatTitle || "New Chat";

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

  const handleAddAccount = () => {
    system.addAccount();
  };

  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});
  const [inputModel, setInputModel] = useState<string>(ModelType.GEMINI_2_5_FLASH);

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

  useEffect(() => {
    const unlisten = listen<any>("auth-success", (event) => {
      // Check if re-authenticating the same active profile
      if (
        activeProfileRef.current &&
        event.payload &&
        activeProfileRef.current.id === event.payload.id
      ) {
        return;
      }

      // 1. Reset Session UI (Chat History, OCR, etc.)
      handleNewSession();
      // 2. Switch to Main View (if not already)
      auth.login();
      // Note: useSystemSync hook handles locking, key clearing, and user data update
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement;

    // Allow native menu on editable inputs
    if (
      isInput &&
      !(target as HTMLInputElement | HTMLTextAreaElement).readOnly
    ) {
      return;
    }

    e.preventDefault();

    let selectedText = "";
    if (isInput) {
      const input = target as HTMLInputElement | HTMLTextAreaElement;
      selectedText = input.value.substring(
        input.selectionStart || 0,
        input.selectionEnd || 0,
      );
    } else {
      selectedText = window.getSelection()?.toString() || "";
    }

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

  // Derived state for wrappers
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

  const handleChatReload = useCallback(() => {
    setIsRotating(true);
    const activeId = chatHistory.activeSessionId;
    if (activeId) {
      overwriteChatMessages(activeId, []).then(() => {
        chat.handleReload();
      });
    } else {
      chat.handleReload();
    }
  }, [chatHistory.activeSessionId, chat]);

  const handleSwitchProfile = async (profileId: string) => {
    handleNewSession();
    await system.switchProfile(profileId);
  };

  return {
    // State
    system,
    auth,
    chat,
    chatHistory,
    isSidePanelOpen,
    enablePanelAnimation,
    showGeminiAuthDialog,
    showLoginRequiredDialog,
    sessionLensUrl,
    ocrData,
    input,
    imageInput,
    inputModel,
    setInputModel,
    pendingUpdate,
    showUpdate,
    contextMenu,
    isRotating,
    isLoadingState,
    isAgreementPending,
    isImageMissing,
    chatTitle,

    // Actions
    toggleSidePanel,
    setShowGeminiAuthDialog,
    setShowLoginRequiredDialog,
    performLogout,
    handleUpdateLensUrl,
    handleUpdateOCRData,
    handleImageReady,
    handleSelectChat,
    handleNewSession,
    handleAddAccount,
    setInput,
    setImageInput,
    setShowUpdate,
    handleContextMenu,
    handleCloseContextMenu,
    handleCopy,
    handleDeleteChatWrapper,
    handleDeleteChatsWrapper,
    handleToggleStarChat: chatHistory.handleToggleStarChat,
    setIsRotating,
    handleExit: () => exit(0),
    handleChatReload,
    handleSwitchProfile,

    // Refs
    containerRef,
  };
};
