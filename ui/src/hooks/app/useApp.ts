/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import {
  AUTO_OCR_DISABLED_MODEL_ID,
  OcrFrame,
  loadChat,
  getImagePath,
  createChat,
  updateChatMetadata,
  appendChatMessage,
  overwriteChatMessages,
  cancelOcrJob,
  saveOcrData,
  hasAgreedFlag,
  commands,
  github,
} from "@/lib";
import {
  useSystemSync,
  useUpdateCheck,
  getPendingUpdate,
  useAuth,
} from "@/hooks";
import { useChat, useChatHistory, useChatTitle } from "@/features";

import { useAppDialogs } from "./useAppDialogs";
import { useAppDrafts } from "./useAppDrafts";
import { useAppContextMenu } from "./useAppContextMenu";
import { useAppOcr } from "./useAppOcr";
import { useAppPanel } from "./useAppPanel";

const isOnboardingId = (id: string) => id.startsWith("__system_");

const getChatOcrModel = (
  frame: OcrFrame,
  metadataOcrLanguage?: string,
): string => {
  const hasModelData = (modelId?: string) =>
    !!modelId &&
    modelId !== AUTO_OCR_DISABLED_MODEL_ID &&
    Array.isArray(frame[modelId]);

  if (hasModelData(metadataOcrLanguage)) {
    return metadataOcrLanguage!;
  }

  const firstScannedModel = Object.entries(frame).find(
    ([modelId, regions]) =>
      modelId !== AUTO_OCR_DISABLED_MODEL_ID && Array.isArray(regions),
  );

  return firstScannedModel?.[0] || "";
};

const withNavigationOcrGuard = (frame: OcrFrame): OcrFrame => ({
  ...frame,
  [AUTO_OCR_DISABLED_MODEL_ID]: [],
});

export const useApp = () => {
  const system = useSystemSync();
  const auth = useAuth();

  const activeProfileRef = useRef<any>(null);
  const systemRef = useRef(system);

  useEffect(() => {
    activeProfileRef.current = system.activeProfile;
    systemRef.current = system;
  }, [system]);

  const [pendingUpdate] = useState(() => getPendingUpdate());
  const chatHistory = useChatHistory(system.activeProfile?.id || null);
  const chatHistoryRef = useRef(chatHistory);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useUpdateCheck();

  const handleImageReadyRef = useRef<any>(null);
  const handleSelectChatRef = useRef<any>(null);

  const performLogout = async () => {
    await system.handleLogout();
    auth.logout();
  };

  const dialogs = useAppDialogs();
  const drafts = useAppDrafts(chatHistory.activeSessionId);
  const contextMenuState = useAppContextMenu();
  const ocr = useAppOcr(chatHistory.activeSessionId, system.sessionOcrLanguage);

  const [isCheckingImage, setIsCheckingImage] = useState(true);
  const [hasCheckedStartupImage, setHasCheckedStartupImage] = useState(false);

  const [hasAutoSelectedWelcome, setHasAutoSelectedWelcome] = useState(false);
  const isPendingAutoSelectWelcome =
    system.hasAgreed === false &&
    !system.activeProfile &&
    !chatHistory.activeSessionId &&
    !hasAutoSelectedWelcome;

  const isLoadingState =
    !system.profileLoaded ||
    !system.prefsLoaded ||
    system.hasAgreed === null ||
    auth.authStage === "LOADING" ||
    isCheckingImage ||
    isPendingAutoSelectWelcome;

  const panel = useAppPanel(isLoadingState);

  const hasActiveOnboarding = chatHistory.activeSessionId
    ? isOnboardingId(chatHistory.activeSessionId)
    : false;
  const isImageMissing = !system.startupImage && !hasActiveOnboarding;
  const isAuthPending = auth.authStage === "LOGIN";
  const isAgreementPending = system.hasAgreed === false;
  const isChatActive = !isLoadingState && !isImageMissing && !isAuthPending;

  const [showUpdate, setShowUpdate] = useState(() => {
    const wasDismissed = sessionStorage.getItem("update_dismissed");
    return !!pendingUpdate && !wasDismissed;
  });

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const agreedToTermsRef = useRef(false);

  useEffect(() => {
    agreedToTermsRef.current = agreedToTerms;
  }, [agreedToTerms]);

  const { isGeneratingTitle, generateTitleForText } = useChatTitle({
    apiKey: system.apiKey,
  });

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
      dialogs.setShowGeminiAuthDialog(true);
    },
    onTitleGenerated: (title: string) => {
      system.setSessionChatTitle(title);
    },
    generateTitle: generateTitleForText,
  });

  const chatTitle = isImageMissing
    ? system.appName
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
          console.log(
            "Automatically saved new OCR language to chat metadata:",
            system.sessionOcrLanguage,
          );
        });
      }
    }
  }, [system.sessionOcrLanguage, chatHistory.activeSessionId]);

  const [isNavigating, setIsNavigating] = useState(false);

  const handleImageReady = async (imageData: {
    imageId: string;
    path: string;
  }) => {
    if (!activeProfileRef.current) {
      console.log("Image upload attempted in guest mode - requiring login");
      dialogs.setShowLoginRequiredDialog(true);
      return;
    }

    console.log("Raw image path:", imageData.path);

    chatHistory.setActiveSessionId(null);
    chatHistory.setActiveSessionId(null);
    ocr.setOcrData({});
    ocr.setSessionLensUrl(null);

    systemRef.current.setSessionOcrLanguage(
      systemRef.current.ocrEnabled ? systemRef.current.startupOcrLanguage : "",
    );
    ocr.setIsOcrScanning(false);
    cancelOcrJob();

    system.setStartupImage({
      path: imageData.path,
      mimeType: "image/png",
      imageId: imageData.imageId,
    });

    try {
      const newChat = await createChat("New Chat", imageData.imageId);
      if (!systemRef.current.ocrEnabled) {
        await saveOcrData(newChat.id, AUTO_OCR_DISABLED_MODEL_ID, []);
      }
      chatHistory.setActiveSessionId(newChat.id);
      chatHistory.refreshChats();
      console.log("Created new chat:", newChat.id);
    } catch (e) {
      console.error("Failed to create chat:", e);
    }
  };

  const handleSelectChat = async (id: string) => {
    setIsNavigating(true);

    // Hard-kill OCR auto-runs during navigation. OCR can only start
    // on fresh chat creation (when enabled) or manual model selection.
    cancelOcrJob();
    ocr.setIsOcrScanning(false);
    ocr.setOcrData(withNavigationOcrGuard({}));

    if (isOnboardingId(id)) {
      ocr.setSessionLensUrl(null);
      if (id === "__system_welcome") {
        system.setSessionChatTitle(`Welcome to ${system.appName}!`);
      } else if (id.startsWith("__system_update")) {
        system.setSessionChatTitle("Update Available");
      }
      chatHistory.setActiveSessionId(id);
      setTimeout(() => setIsNavigating(false), 300);
      return;
    }

    try {
      const chatData = await loadChat(id);
      const imagePath = await getImagePath(chatData.metadata.image_hash);

      system.setSessionChatTitle(chatData.metadata.title);

      const loadedOcrData = chatData.ocr_data || {};
      const navigationSafeOcrData = withNavigationOcrGuard(loadedOcrData);
      const chatOcrModel = getChatOcrModel(
        loadedOcrData,
        chatData.metadata.ocr_lang,
      );
      system.setSessionOcrLanguage(chatOcrModel);

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
          path: imagePath,
          mimeType: "image/png",
          imageId: chatData.metadata.image_hash,
        },
      );

      ocr.setOcrData(navigationSafeOcrData);

      ocr.setSessionLensUrl(chatData.imgbb_url || null);

      system.setStartupImage({
        path: imagePath,
        mimeType: "image/png",
        imageId: chatData.metadata.image_hash,
        fromHistory: true,
      });

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
    ocr.setOcrData({});
    ocr.setSessionLensUrl(null);
    setTimeout(() => setIsNavigating(false), 300);
  };

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

  const handleAddAccount = () => {
    system.addAccount();
  };

  const handleSystemAction = useCallback(
    async (actionId: string, _value?: string) => {
      switch (actionId) {
        case "agree":
          setAgreedToTerms(true);

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

  useEffect(() => {
    handleImageReadyRef.current = handleImageReady;
    handleSelectChatRef.current = handleSelectChat;
  });

  useEffect(() => {
    if (!system.profileLoaded || !system.prefsLoaded || hasCheckedStartupImage)
      return;

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
        setHasCheckedStartupImage(true);
      }
    };

    initStartupImage();
  }, [system.profileLoaded, system.prefsLoaded, hasCheckedStartupImage]);

  useEffect(() => {
    if (
      system.hasAgreed === false &&
      auth.authStage !== "LOADING" &&
      !isCheckingImage &&
      !system.activeProfile &&
      !chatHistory.activeSessionId &&
      !hasAutoSelectedWelcome
    ) {
      handleSelectChat("__system_welcome");
      setHasAutoSelectedWelcome(true);
    }
  }, [
    system.hasAgreed,
    auth.authStage,
    isCheckingImage,
    system.activeProfile,
    chatHistory.activeSessionId,
    hasAutoSelectedWelcome,
  ]);

  useEffect(() => {
    const unlisten = listen<string>("image-path", async (event) => {
      const imagePath = event.payload;
      if (imagePath) {
        if (!activeProfileRef.current) {
          console.log(
            "CLI/External image drop attempted in guest mode - requiring login",
          );
          dialogs.setShowLoginRequiredDialog(true);
          return;
        }

        try {
          console.log("Event received for image:", imagePath);
          const result = await commands.processImagePath(imagePath);
          if (handleImageReadyRef.current) {
            handleImageReadyRef.current({
              imageId: result.hash,
              path: result.path,
            });
          }
        } catch (error) {
          console.error("Failed to process CLI image event:", error);
        }
      }
    });

    const unlistenLoadChat = listen<string>("load-chat", async (event) => {
      const chatId = event.payload;
      if (chatId) {
        console.log("Triggering frontend transition to new capture:", chatId);
        if (handleSelectChatRef.current) {
          await handleSelectChatRef.current(chatId);
        }
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
          if (!activeProfileRef.current) {
            console.log(
              "Capture upload attempted in guest mode - requiring login",
            );
            dialogs.setShowLoginRequiredDialog(true);
            return;
          }

          const imagePath = await getImagePath(imageHash);

          systemRef.current.setSessionChatTitle(null);
          systemRef.current.setSessionOcrLanguage(
            systemRef.current.ocrEnabled
              ? systemRef.current.startupOcrLanguage
              : "",
          );
          ocr.setOcrData({});
          ocr.setSessionLensUrl(null);
          ocr.setIsOcrScanning(false);
          cancelOcrJob();

          systemRef.current.setStartupImage({
            path: imagePath,
            mimeType: "image/png",
            imageId: imageHash,
          });

          chatHistoryRef.current.setActiveSessionId(null);

          await new Promise((resolve) => setTimeout(resolve, 10));

          chatHistoryRef.current.setActiveSessionId(chatId);
          if (!systemRef.current.ocrEnabled) {
            await saveOcrData(chatId, AUTO_OCR_DISABLED_MODEL_ID, []);
          }
          chatHistoryRef.current.refreshChats();
        } catch (error) {
          console.error("[capture-complete] Failed:", error);
        }
      },
    );

    const unlistenCaptureFailed = listen<{ reason: string }>(
      "capture-failed",
      (event) => {
        const { reason } = event.payload;
        if (reason === "User denied screen capture permission.") {
          dialogs.setShowCaptureDeniedDialog(true);
        } else {
          console.error("[capture-failed]", reason);
        }
      },
    );

    const unlistenAuthSuccess = listen<any>("auth-success", async (event) => {
      if (
        activeProfileRef.current &&
        event.payload &&
        activeProfileRef.current.id === event.payload.id
      ) {
        return;
      }

      const alreadyAgreed = await hasAgreedFlag();
      if (!alreadyAgreed) {
        if (agreedToTermsRef.current) {
          system.setAgreementCompleted();
        }
      }

      handleNewSession();
      auth.login();
    });

    return () => {
      unlisten.then((f) => f());
      unlistenLoadChat.then((f) => f());
      unlistenCapture.then((f) => f());
      unlistenCaptureFailed.then((f) => f());
      unlistenAuthSuccess.then((f) => f());
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  return {
    system,
    auth,
    chat,
    chatHistory,
    isSidePanelOpen: panel.isSidePanelOpen,
    enablePanelAnimation: panel.enablePanelAnimation,
    showGeminiAuthDialog: dialogs.showGeminiAuthDialog,
    showLoginRequiredDialog: dialogs.showLoginRequiredDialog,
    showCaptureDeniedDialog: dialogs.showCaptureDeniedDialog,
    sessionLensUrl: ocr.sessionLensUrl,
    ocrData: ocr.ocrData,
    input: drafts.input,
    imageInput: drafts.imageInput,
    inputModel: drafts.inputModel,
    setInputModel: drafts.setInputModel,
    pendingUpdate,
    showUpdate,
    contextMenu: contextMenuState.contextMenu,
    isLoadingState,
    isAgreementPending,
    isImageMissing,
    chatTitle,
    agreedToTerms,

    toggleSidePanel: panel.toggleSidePanel,
    isNavigating,
    setShowGeminiAuthDialog: dialogs.setShowGeminiAuthDialog,
    setShowLoginRequiredDialog: dialogs.setShowLoginRequiredDialog,
    setShowCaptureDeniedDialog: dialogs.setShowCaptureDeniedDialog,
    performLogout,
    handleUpdateLensUrl: ocr.handleUpdateLensUrl,
    handleUpdateOCRData: ocr.handleUpdateOCRData,
    handleImageReady,
    handleSelectChat,
    handleNewSession,
    handleAddAccount,
    setInput: drafts.setInput,
    setImageInput: drafts.setImageInput,
    setShowUpdate,
    handleContextMenu: contextMenuState.handleContextMenu,
    handleCloseContextMenu: contextMenuState.handleCloseContextMenu,
    handleCopy: contextMenuState.handleCopy,
    handleDeleteChatWrapper,
    handleDeleteChatsWrapper,
    handleToggleStarChat: chatHistory.handleToggleStarChat,
    handleExit: () => exit(0),
    handleSwitchProfile,
    handleSystemAction,
    containerRef,
    isOcrScanning: ocr.isOcrScanning,
    setIsOcrScanning: ocr.setIsOcrScanning,
  };
};
