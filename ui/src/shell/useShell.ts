/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { commands } from "@/lib/api/tauri";
import { useSystemSync, useUpdateCheck, getPendingUpdate } from "@/hooks";
import { useAuth, useChat, useChatHistory, useChatTitle } from "@/features";
import { ModelType, github } from "@/lib/config";
import {
  loadChat,
  getImagePath,
  createChat,
  updateChatMetadata,
  appendChatMessage,
  saveOcrData,
  saveImgbbUrl,
  overwriteChatMessages,
  OcrFrame,
  cancelOcrJob,
} from "@/lib/storage";

const isOnboardingId = (id: string) => id.startsWith("__system_");

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

  const [pendingUpdate] = useState(() => getPendingUpdate());

  const chatHistory = useChatHistory(system.activeProfile?.id || null);
  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

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

  const [ocrData, setOcrData] = useState<OcrFrame>({});
  const [isOcrScanning, setIsOcrScanning] = useState(false);

  const handleUpdateOCRData = useCallback(
    (modelId: string, data: { text: string; box: number[][] }[]) => {
      const regions = data.map((d) => ({
        text: d.text,
        bbox: d.box,
      }));
      console.log(`[useShell] Updating OCR data for model: ${modelId}`);
      setOcrData((prev) => {
        const newState = {
          ...prev,
          [modelId]: regions,
        };
        console.log(
          `[useShell] New OCR Data keys: ${Object.keys(newState).join(", ")}`,
        );
        return newState;
      });
    },
    [],
  );

  useEffect(() => {
    const activeId = chatHistory.activeSessionId;
    const currentModelId = system.sessionOcrLanguage || "pp-ocr-v4-en"; // Fallback to default

    // Only save if we have data for the CURRENT model
    const currentData = ocrData[currentModelId];

    if (activeId && currentData && currentData.length > 0) {
      saveOcrData(activeId, currentModelId, currentData).catch((e) =>
        console.error("Failed to save OCR", e),
      );
    }
  }, [ocrData, chatHistory.activeSessionId, system.sessionOcrLanguage]);

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

  const handleOverwriteMessages = useCallback(
    (msgs: any[]) => {
      const activeId = chatHistory.activeSessionId;
      if (activeId) {
        const formatted = msgs.map((m: any) => ({
          role: (m.role === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.text,
          timestamp: new Date(m.timestamp).toISOString(),
        }));
        overwriteChatMessages(activeId, formatted).catch(console.error);
      }
    },
    [chatHistory.activeSessionId],
  );

  const [isCheckingImage, setIsCheckingImage] = useState(true);

  const handleImageReady = async (imageData: {
    imageId: string;
    path: string;
  }) => {
    if (!system.activeProfile) {
      console.log("Image upload attempted in guest mode - requiring login");
      setShowLoginRequiredDialog(true);
      return;
    }

    console.log("Raw image path:", imageData.path);
    const assetUrl = convertFileSrc(imageData.path);
    console.log("Converted asset URL:", assetUrl);

    chatHistory.setActiveSessionId(null);
    chatHistory.setActiveSessionId(null);
    setOcrData({});
    setSessionLensUrl(null);
    system.setSessionOcrLanguage(system.startupOcrLanguage);
    setIsOcrScanning(false);
    cancelOcrJob(); // Ensure no background job from previous state

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

    const unlistenLoadChat = listen<string>("load-chat", async (event) => {
      const chatId = event.payload;
      if (chatId) {
        console.log("Triggering frontend transition to new capture:", chatId);
        await handleSelectChat(chatId);
      }
    });

    const unlistenCapture = listen<{ chatId: string; imageHash: string }>(
      "capture-complete",
      async (event) => {
        const { chatId, imageHash } = event.payload;
        console.log(
          "[capture-complete] chatId:",
          chatId,
          "imageHash:",
          imageHash,
        );

        try {
          const imagePath = await getImagePath(imageHash);
          const assetUrl = convertFileSrc(imagePath);

          // Reset state — mirrors handleImageReady exactly
          chatHistory.setActiveSessionId(null);
          setOcrData({});
          setSessionLensUrl(null);
          system.setSessionOcrLanguage(system.startupOcrLanguage);
          setIsOcrScanning(false);
          cancelOcrJob();

          // Set image WITHOUT fromHistory → triggers useChat startSession
          system.setStartupImage({
            base64: assetUrl,
            mimeType: "image/png",
            isFilePath: true,
            imageId: imageHash,
          });

          // Activate the already-created chat (qt-capture created it)
          chatHistoryRef.current.setActiveSessionId(chatId);
          chatHistoryRef.current.refreshChats();
        } catch (error) {
          console.error("[capture-complete] Failed:", error);
        }
      },
    );

    return () => {
      unlisten.then((f) => f());
      unlistenLoadChat.then((f) => f());
      unlistenCapture.then((f) => f());
    };
  }, []);

  const isAgreementPending = system.hasAgreed === false;
  const isLoadingState =
    system.hasAgreed === null ||
    auth.authStage === "LOADING" ||
    isCheckingImage;
  const hasActiveOnboarding = chatHistory.activeSessionId
    ? isOnboardingId(chatHistory.activeSessionId)
    : false;
  const isImageMissing = !system.startupImage && !hasActiveOnboarding;
  const isAuthPending = auth.authStage === "LOGIN";
  const isChatActive = !isLoadingState && !isImageMissing && !isAuthPending;

  useEffect(() => {
    if (!isLoadingState && !system.startupImage) {
      setIsSidePanelOpen(true);
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
    onOverwriteMessages: handleOverwriteMessages,
    chatId: chatHistory.activeSessionId,
    onMissingApiKey: () => {
      setShowGeminiAuthDialog(true);
    },
    onTitleGenerated: (title: string) => {
      system.setSessionChatTitle(title);
    },
  });

  const { isGeneratingTitle } = useChatTitle({
    startupImage: system.startupImage,
    apiKey: system.apiKey,
    sessionChatTitle: system.sessionChatTitle,
    setSessionChatTitle: system.setSessionChatTitle,
  });

  const chatTitle = isImageMissing
    ? "SnapLLM"
    : isGeneratingTitle
      ? "New Chat"
      : system.sessionChatTitle || "New Chat";

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

  useEffect(() => {
    const activeId = chatHistory.activeSessionId;
    if (activeId && system.sessionOcrLanguage && !isOnboardingId(activeId)) {
      const currentChat = chatHistory.chats.find((c: any) => c.id === activeId);
      if (currentChat && currentChat.ocr_lang !== system.sessionOcrLanguage) {
        updateChatMetadata({
          ...currentChat,
          ocr_lang: system.sessionOcrLanguage,
          updated_at: new Date().toISOString(),
        }).then(() => {
          chatHistory.refreshChats();
        });
      }
    }
  }, [system.sessionOcrLanguage, chatHistory.activeSessionId]);

  const [isNavigating, setIsNavigating] = useState(false);

  const handleSelectChat = async (id: string) => {
    setIsNavigating(true);
    if (isOnboardingId(id)) {
      setOcrData({});
      setSessionLensUrl(null);
      if (id === "__system_welcome") {
        system.setSessionChatTitle("Welcome to SnapLLM!");
      } else if (id.startsWith("__system_update")) {
        system.setSessionChatTitle("Update Available");
      }
      chatHistory.setActiveSessionId(id);
      setTimeout(() => setIsNavigating(false), 300);
      return;
    }

    try {
      setOcrData({});
      cancelOcrJob(); // Cancel any running OCR before switching
      const chatData = await loadChat(id);
      const imagePath = await getImagePath(chatData.metadata.image_hash);
      const imageUrl = convertFileSrc(imagePath);

      system.setSessionChatTitle(chatData.metadata.title);

      if (chatData.metadata.ocr_lang) {
        system.setSessionOcrLanguage(chatData.metadata.ocr_lang);
      } else {
        system.setSessionOcrLanguage(system.startupOcrLanguage);
      }

      const messages = chatData.messages.map((m, idx) => ({
        id: idx.toString(),
        role: m.role as "user" | "model",
        text: m.content,
        timestamp: new Date(m.timestamp).getTime(),
      }));

      chat.restoreState(
        {
          messages,
          streamingText: "",
          firstResponseId: null,
        },
        {
          base64: imageUrl,
          mimeType: "image/png",
          isFilePath: true,
        },
      );

      if (chatData.ocr_data && Object.keys(chatData.ocr_data).length > 0) {
        setOcrData(chatData.ocr_data);
      }

      setSessionLensUrl(chatData.imgbb_url || null);

      system.setStartupImage({
        base64: imageUrl,
        mimeType: "image/png",
        isFilePath: true,
        imageId: chatData.metadata.image_hash,
        fromHistory: true,
      } as any);

      chatHistory.setActiveSessionId(id);
    } catch (e) {
      console.error("Failed to load chat:", e);
    } finally {
      setTimeout(() => setIsNavigating(false), 300);
    }
  };

  const handleNewSession = () => {
    setIsNavigating(true);
    system.resetSession();
    chatHistory.setActiveSessionId(null);
    chatHistory.setActiveSessionId(null);
    setOcrData({});
    setSessionLensUrl(null);
    setTimeout(() => setIsNavigating(false), 300);
  };

  const handleAddAccount = () => {
    system.addAccount();
  };

  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});

  const [inputModel, setInputModel] = useState<string>(
    ModelType.GEMINI_2_5_FLASH,
  );

  const activeDraftId = chatHistory.activeSessionId || "new_session";

  const input = chatDrafts[activeDraftId] || "";
  const setInput = (val: string) => {
    setChatDrafts((prev) => ({ ...prev, [activeDraftId]: val }));
  };

  const imageInput = imageDrafts[activeDraftId] || "";
  const setImageInput = (val: string) => {
    setImageDrafts((prev) => ({ ...prev, [activeDraftId]: val }));
  };

  const [showUpdate, setShowUpdate] = useState(() => {
    const wasDismissed = sessionStorage.getItem("update_dismissed");
    return !!pendingUpdate && !wasDismissed;
  });

  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSystemAction = useCallback(
    async (actionId: string, _value?: string) => {
      switch (actionId) {
        case "agree":
          setAgreedToTerms(true);
          try {
            const { type } = await import("@tauri-apps/plugin-os");
            if (type() === "linux") {
              await invoke("install_os_shortcut");
            }
          } catch (e) {
            console.error("Failed to install OS shortcut", e);
          }
          break;
        case "disagree":
          setAgreedToTerms(false);
          break;

        case "update_now":
          try {
            const update = await check();
            if (update && update.available) {
              await update.downloadAndInstall();
              await relaunch();
            } else {
              invoke("open_external_url", { url: github.latestRelease });
            }
          } catch {
            invoke("open_external_url", { url: github.latestRelease });
          }
          break;
        case "update_later":
          setShowUpdate(false);
          sessionStorage.setItem("update_dismissed", "true");

          handleNewSession();
          break;
      }
    },
    [system, handleNewSession],
  );

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<any>("auth-success", (event) => {
      if (
        activeProfileRef.current &&
        event.payload &&
        activeProfileRef.current.id === event.payload.id
      ) {
        return;
      }

      if (system.hasAgreed === false) {
        system.setHasAgreed(true);
        system.updatePreferences({});
      }

      handleNewSession();

      auth.login();
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

  const handleSwitchProfile = async (profileId: string) => {
    handleNewSession();
    await system.switchProfile(profileId);
  };

  return {
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
    isLoadingState,
    isAgreementPending,
    isImageMissing,
    chatTitle,
    agreedToTerms,

    toggleSidePanel,
    isNavigating,
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
    handleExit: () => exit(0),
    handleSwitchProfile,
    handleSystemAction,
    containerRef,
    isOcrScanning,
    setIsOcrScanning,
  };
};
