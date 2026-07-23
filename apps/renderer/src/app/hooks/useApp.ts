/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@/platform";
import {
  type OcrAnnotationEntry,
  type OcrAnnotations,
  type OcrModelAnnotation,
  appendThreadMessage,
  forkThread as forkStoredThread,
  loadThread as loadStoredThread,
  overwriteThreadMessages,
  resolveOcrModelId,
  type ThreadMessage,
} from "@squigit/core/config";
import type { Message } from "@squigit/core/brain/engine";
import type { Attachment } from "@squigit/core/brain/attachments";
import { github } from "@squigit/core/services/github";
import {
  getPendingUpdate,
  useAuth,
  useSystemSync,
  useUpdateCheck,
} from "@/hooks/system";
import { useBrainTitle, useModelHandshake } from "@squigit/react/brain/hooks";
import { useAttachments } from "@/hooks/shared";
import { useThread, useThreadHistory } from "@/features/thread";
import { useAppBusyGuard } from "./useAppBusyGuard";
import { useAppCapture } from "./useAppCapture";
import { useAppContextMenu } from "./useAppContextMenu";
import { useAppDialogs } from "./useAppDialogs";
import { useAppDrafts } from "./useAppDrafts";
import { useAppMedia } from "./useAppMedia";
import { useAppNavigation } from "./useAppNavigation";
import { useAppOcr } from "./useAppOcr";
import { useAppPanel } from "./useAppPanel";

const isOnboardingId = (id: string) => id.startsWith("__system_");

function toStoredMessage(message: Message): ThreadMessage {
  const base = {
    id: message.id,
    content: message.text,
    timestamp: new Date(message.timestamp).toISOString(),
  };

  if (message.role === "user") {
    return {
      ...base,
      role: "user",
      attachments: message.attachments ?? [],
    };
  }

  return {
    ...base,
    role: "assistant",
    citations: Array.isArray(message.citations) ? message.citations : [],
    tool_steps: Array.isArray(message.toolSteps) ? message.toolSteps : [],
  };
}

const isScannedOcrEntry = (
  entry: OcrAnnotationEntry | undefined,
): entry is OcrModelAnnotation =>
  !!entry && !Array.isArray(entry) && !!entry.scanned_at;

const getThreadOcrModel = (annotations: OcrAnnotations): string => {
  let latestModelId = "";
  let latestScannedAt = -Infinity;

  for (const [modelId, entry] of Object.entries(annotations)) {
    if (!isScannedOcrEntry(entry)) continue;

    const scannedAt = new Date(entry.scanned_at || 0).getTime();
    if (scannedAt > latestScannedAt) {
      latestModelId = modelId;
      latestScannedAt = scannedAt;
    }
  }

  return resolveOcrModelId(latestModelId, "");
};

function getAttachmentAnalysisCounts(items: Attachment[]) {
  if (items.length === 0) {
    return null;
  }

  const imageCount = items.filter(
    (attachment) => attachment.type === "image",
  ).length;
  const fileCount = items.length - imageCount;

  return imageCount > 0 || fileCount > 0 ? { imageCount, fileCount } : null;
}

export const useApp = () => {
  const system = useSystemSync();
  const auth = useAuth();

  const activeProfileRef = useRef<any>(null);
  const systemRef = useRef(system);
  const threadHistoryRef = useRef<any>(null);
  const threadOcrModelMemoryRef = useRef<Record<string, string>>({});
  const agreedToTermsRef = useRef(false);
  const hasShownCaptureTerminalHintRef = useRef(false);

  useEffect(() => {
    activeProfileRef.current = system.activeProfile;
    systemRef.current = system;
  }, [system]);

  const [pendingUpdate, setPendingUpdate] = useState(() => getPendingUpdate());

  useEffect(() => {
    const handleUpdate = () => setPendingUpdate(getPendingUpdate());
    window.addEventListener("squigit-updates-changed", handleUpdate);
    return () =>
      window.removeEventListener("squigit-updates-changed", handleUpdate);
  }, []);
  const threadHistory = useThreadHistory(system.activeProfile?.id || null);

  useEffect(() => {
    threadHistoryRef.current = threadHistory;
  }, [threadHistory]);

  useUpdateCheck();
  useModelHandshake(system.apiKey);

  const performLogout = async () => {
    await system.handleLogout();
    auth.logout();
  };

  const dialogs = useAppDialogs();
  const drafts = useAppDrafts();
  const attachments = useAttachments();
  const contextMenuState = useAppContextMenu();
  const ocr = useAppOcr(threadHistory.activeSessionId);
  const [pendingPromptAttachmentAnalysis, setPendingPromptAttachmentAnalysis] =
    useState<ReturnType<typeof getAttachmentAnalysisCounts>>(null);
  const [hasAutoSelectedWizard, setHasAutoSelectedWizard] = useState(false);
  const [showUpdate, setShowUpdate] = useState(() => {
    const wasDismissed = sessionStorage.getItem("update_dismissed");
    return !!pendingUpdate && !wasDismissed;
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    agreedToTermsRef.current = agreedToTerms;
  }, [agreedToTerms]);

  const shouldAutoClosePanelForWizard =
    system.wizardState?.isFinished === false;

  const hasActiveOnboarding = threadHistory.activeSessionId
    ? isOnboardingId(threadHistory.activeSessionId)
    : false;
  const isImageMissing = !system.startupImage && !hasActiveOnboarding;
  // The hydrated profile is authoritative. During first-run auth, useAuth can
  // briefly remain on LOGIN after the profile and API key are already ready.
  const isAuthPending =
    auth.authStage === "LOGIN" && !system.activeProfile;
  const isPendingAutoSelectWizard =
    system.wizardState?.isFinished === false &&
    threadHistory.activeSessionId !== "__system_wizard";
  const isLoadingState =
    !system.profileLoaded ||
    !system.prefsLoaded ||
    system.wizardState === null ||
    auth.authStage === "LOADING" ||
    isPendingAutoSelectWizard;

  const panel = useAppPanel(isLoadingState, shouldAutoClosePanelForWizard);

  const { isGeneratingTitle, generateTitleForText } = useBrainTitle({
    apiKey: system.apiKey,
  });

  const handleMessageAdded = useCallback(
    async (msg: Message, targetThreadId: string) => {
      const activeId = targetThreadId || threadHistory.activeSessionId;
      if (activeId && !isOnboardingId(activeId)) {
        await appendThreadMessage(activeId, toStoredMessage(msg));
      }
    },
    [threadHistory.activeSessionId],
  );

  const handleOverwriteMessages = useCallback(
    (msgs: Message[]) => {
      const activeId = threadHistory.activeSessionId;
      if (!activeId) return;

      const formatted = msgs.map(toStoredMessage);

      overwriteThreadMessages(activeId, formatted).catch(console.error);
    },
    [threadHistory.activeSessionId],
  );

  const threadTitle = isImageMissing
    ? ""
    : isGeneratingTitle
      ? "New thread"
      : system.sessionThreadTitle || "New thread";

  const isThreadActive = !isLoadingState && !isImageMissing && !isAuthPending;
  const thread = useThread({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    currentEffort: system.sessionEffort,
    startupImage: system.startupImage,
    enabled: isThreadActive,
    onMessage: handleMessageAdded,
    onOverwriteMessages: handleOverwriteMessages,
    threadId: threadHistory.activeSessionId,
    threadTitle,
    onMissingApiKey: () => {
      dialogs.setShowProviderAuthDialog(true);
    },
    onTitleGenerated: (title: string) => {
      system.setSessionThreadTitle(title);
    },
    generateTitle: generateTitleForText,
    userName: system.userName,
    userEmail: system.userEmail,
  });

  const isActiveThreadBusy =
    thread.isAnalyzing ||
    thread.isGenerating ||
    thread.isAiTyping ||
    ocr.isOcrScanning;

  const media = useAppMedia({
    activeThreadId: threadHistory.activeSessionId,
  });
  const busyGuard = useAppBusyGuard({
    thread,
    ocr,
    system,
    getSafeOcrModel: () => getThreadOcrModel(ocr.ocrData),
  });

  const getRememberedThreadOcrModel = useCallback((threadId: string) => {
    return threadOcrModelMemoryRef.current[threadId] || "";
  }, []);

  const navigation = useAppNavigation({
    thread,
    threadHistory,
    ocr,
    system,
    threadTitle,
    isActiveThreadBusy,
    closeMediaViewer: media.closeMediaViewer,
    runWithBusyGuard: busyGuard.runWithBusyGuard,
    getRememberedThreadOcrModel,
  });
  const capture = useAppCapture({
    system,
    auth,
    threadHistory,
    ocr,
    dialogs,
    activeProfileRef,
    systemRef,
    threadHistoryRef,
    performSelectThread: navigation.performSelectThread,
    performNewSession: navigation.performNewSession,
    closeMediaViewer: media.closeMediaViewer,
    runWithBusyGuardRef: busyGuard.runWithBusyGuardRef,
    agreedToTermsRef,
    hasShownCaptureTerminalHintRef,
  });

  const isAgreementPending = system.wizardState?.isFinished === false;

  useEffect(() => {
    const pendingTurn = thread.pendingAssistantTurn;
    if (!pendingTurn || pendingTurn.phase !== "thinking") {
      setPendingPromptAttachmentAnalysis(null);
    }
  }, [thread.pendingAssistantTurn]);

  useEffect(() => {
    if (
      system.wizardState?.isFinished === false &&
      auth.authStage !== "LOADING" &&
      !capture.isCheckingImage &&
      !threadHistory.activeSessionId &&
      !hasAutoSelectedWizard
    ) {
      navigation.performSelectThread("__system_wizard");
      setHasAutoSelectedWizard(true);
    }
  }, [
    auth.authStage,
    capture.isCheckingImage,
    threadHistory.activeSessionId,
    hasAutoSelectedWizard,
    navigation,
    system.wizardState?.isFinished,
  ]);

  const handleUpdateLensCache = useCallback(
    (cache: Parameters<typeof ocr.handleUpdateLensCache>[0]) => {
      ocr.handleUpdateLensCache(cache);
    },
    [ocr],
  );

  const handleUpdateOCRData = useCallback(
    (
      threadId: string | null,
      modelId: string,
      data: { text: string; box: number[][] }[],
    ) => {
      ocr.handleUpdateOCRData(threadId, modelId, data);
    },
    [ocr],
  );

  const handleOcrModelChange = useCallback(
    (model: string) => {
      system.setSessionOcrLanguage(model);

      const activeId = threadHistory.activeSessionId;
      if (!activeId || isOnboardingId(activeId)) {
        return;
      }

      const resolvedModel = resolveOcrModelId(model, "");
      if (resolvedModel) {
        threadOcrModelMemoryRef.current[activeId] = resolvedModel;
      } else {
        delete threadOcrModelMemoryRef.current[activeId];
      }
    },
    [system, threadHistory.activeSessionId],
  );

  const trackPendingPromptAttachmentAnalysis = useCallback(
    (nextAttachments: Attachment[]) => {
      setPendingPromptAttachmentAnalysis(
        getAttachmentAnalysisCounts(nextAttachments),
      );
    },
    [],
  );

  const handleDeleteThreadWrapper = async (id: string) => {
    const isActive = threadHistory.activeSessionId === id;
    await threadHistory.handleDeleteThread(id);
    if (isActive) {
      await navigation.performNewSession();
    }
  };

  const handleDeleteThreadsWrapper = async (ids: string[]) => {
    const isActiveIncluded =
      threadHistory.activeSessionId &&
      ids.includes(threadHistory.activeSessionId);
    await threadHistory.handleDeleteThreads(ids);
    if (isActiveIncluded) {
      await navigation.performNewSession();
    }
  };

  const forkThreadAtMessage = useCallback(
    async (threadId: string, messageIndex: number) => {
      const forkedThread = await forkStoredThread(threadId, messageIndex);
      await navigation.performSelectThread(forkedThread.id);
      void threadHistory.refreshThreads();
    },
    [
      navigation.performSelectThread,
      threadHistory.refreshThreads,
    ],
  );

  const handleForkMessage = useCallback(
    async (messageIndex: number) => {
      const activeId = threadHistory.activeSessionId;
      if (!activeId || isOnboardingId(activeId)) return;

      try {
        await forkThreadAtMessage(activeId, messageIndex);
      } catch (error) {
        console.error("Failed to fork thread:", error);
        throw error;
      }
    },
    [forkThreadAtMessage, threadHistory.activeSessionId],
  );

  const handleForkThread = useCallback(
    async (threadId: string) => {
      if (isOnboardingId(threadId)) return;

      try {
        const storedThread = await loadStoredThread(threadId);
        const lastMessageIndex = storedThread.messages.length - 1;
        if (lastMessageIndex < 0) return;

        await forkThreadAtMessage(threadId, lastMessageIndex);
      } catch (error) {
        console.error("Failed to fork thread:", error);
        throw error;
      }
    },
    [forkThreadAtMessage],
  );

  const handleSwitchProfile = async (profileId: string) => {
    const isInWizard = threadHistory.activeSessionId === "__system_wizard";
    if (!isInWizard) {
      await navigation.performNewSession();
    }
    await system.switchProfile(profileId);
  };

  const handleAddAccount = async () => {
    const result = await system.addAccount();
    if (result && result.id) {
      const isInWizard = threadHistory.activeSessionId === "__system_wizard";
      if (isInWizard) {
        await system.switchProfile(result.id);
      } else {
        await handleSwitchProfile(result.id);
      }
    }
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
            const update = await platform.updater.check();
            if (update) {
              await update.downloadAndInstall();
              await platform.app.relaunch();
            } else {
              platform.invoke("open_external_url", {
                url: github.latestRelease,
              });
            }
          } catch {
            platform.invoke("open_external_url", { url: github.latestRelease });
          }
          break;
        case "update_later":
          setShowUpdate(false);
          sessionStorage.setItem("update_dismissed", "true");
          await navigation.performNewSession();
          break;
        case "dismiss_overlay":
          await navigation.performNewSession();
          break;
      }
    },
    [navigation],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return {
    system,
    auth,
    thread,
    threadHistory,
    isSidePanelOpen: panel.isSidePanelOpen,
    enablePanelAnimation: panel.enablePanelAnimation,
    showProviderAuthDialog: dialogs.showProviderAuthDialog,
    showLoginRequiredDialog: dialogs.showLoginRequiredDialog,
    showCaptureDeniedDialog: dialogs.showCaptureDeniedDialog,
    sessionLensUrl: ocr.sessionLensUrl,
    ocrData: ocr.ocrData,
    input: drafts.input,
    imageInput: drafts.imageInput,
    inputModel: drafts.inputModel,
    inputEffort: drafts.inputEffort,
    attachments: attachments.attachments,
    pendingPromptAttachmentAnalysis,
    setInputModel: drafts.setInputModel,
    setInputEffort: drafts.setInputEffort,
    pendingUpdate,
    showUpdate,
    contextMenu: contextMenuState.contextMenu,
    isLoadingState,
    isAgreementPending,
    isImageMissing,
    threadTitle,
    agreedToTerms,
    busyDialog: busyGuard.busyDialog,
    mediaViewer: media.mediaViewer,
    searchOverlay: navigation.searchOverlay,
    toggleSidePanel: panel.toggleSidePanel,
    isNavigating: navigation.isNavigating,
    isThreadContentReady: navigation.isThreadContentReady,
    showThreadShellDuringNavigation: navigation.showThreadShellDuringNavigation,
    setShowProviderAuthDialog: dialogs.setShowProviderAuthDialog,
    setShowLoginRequiredDialog: dialogs.setShowLoginRequiredDialog,
    setShowCaptureDeniedDialog: dialogs.setShowCaptureDeniedDialog,
    performLogout,
    handleUpdateLensCache,
    handleUpdateOCRData,
    handleOcrModelChange,
    handleImageReady: capture.handleImageReady,
    handleNavigation: navigation.handleNavigation,
    handleNewSession: navigation.handleNewSession,
    canNavigateBack: navigation.canNavigateBack,
    canNavigateForward: navigation.canNavigateForward,
    historyNavigationDirection: navigation.historyNavigationDirection,
    navigateBack: navigation.navigateBack,
    navigateForward: navigation.navigateForward,
    handleAddAccount,
    setInput: drafts.setInput,
    setImageInput: drafts.setImageInput,
    setAttachments: attachments.setAttachments,
    trackPendingPromptAttachmentAnalysis,
    addAttachmentFromPath: attachments.addFromPath,
    clearAttachments: attachments.clearAttachments,
    setShowUpdate,
    handleContextMenu: contextMenuState.handleContextMenu,
    handleCloseContextMenu: contextMenuState.handleCloseContextMenu,
    handleCopy: contextMenuState.handleCopy,
    handleDeleteThreadWrapper,
    handleDeleteThreadsWrapper,
    handleForkMessage,
    handleForkThread,
    handleExit: () => platform.app.exit(0),
    handleSwitchProfile,
    handleSystemAction,
    handleBusyDialogAction: busyGuard.handleBusyDialogAction,
    openMediaViewer: media.openMediaViewer,
    closeMediaViewer: media.closeMediaViewer,
    openSearchOverlay: navigation.openSearchOverlay,
    closeSearchOverlay: navigation.closeSearchOverlay,
    revealSearchMatch: navigation.revealSearchMatch,
    clearSearchReveal: navigation.clearSearchReveal,
    containerRef,
    isOcrScanning: ocr.isOcrScanning,
    setIsOcrScanning: ocr.setIsOcrScanning,
  };
};
