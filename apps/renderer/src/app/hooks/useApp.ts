/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@/platform";
import {
  AUTO_OCR_DISABLED_MODEL_ID,
  type OcrAnnotations,
  appendThreadMessage,
  overwriteThreadMessages,
} from "@squigit/core/config";
import type { Attachment } from "@squigit/core/brain/attachments";
import { github } from "@squigit/core/services/github";
import {
  resolveOcrModelId,
  SUPPORTED_OCR_MODEL_IDS,
} from "@squigit/core/config";
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

const getThreadOcrModel = (
  annotations: OcrAnnotations,
  metadataOcrLanguage?: string,
): string => {
  const hasModelData = (modelId?: string) =>
    !!modelId &&
    modelId !== AUTO_OCR_DISABLED_MODEL_ID &&
    Array.isArray(annotations[modelId]);

  const resolvedMetadataModel = resolveOcrModelId(metadataOcrLanguage, "");
  if (resolvedMetadataModel && hasModelData(resolvedMetadataModel)) {
    return resolvedMetadataModel;
  }

  const scannedModelSet = new Set(
    Object.entries(annotations)
      .filter(
        ([modelId, regions]) =>
          modelId !== AUTO_OCR_DISABLED_MODEL_ID && Array.isArray(regions),
      )
      .map(([modelId]) => resolveOcrModelId(modelId, ""))
      .filter((modelId) => !!modelId),
  );

  for (const modelId of SUPPORTED_OCR_MODEL_IDS) {
    if (scannedModelSet.has(modelId)) {
      return modelId;
    }
  }

  const fallbackScannedModel = Object.keys(annotations)
    .filter(
      (modelId) =>
        modelId !== AUTO_OCR_DISABLED_MODEL_ID && hasModelData(modelId),
    )
    .sort()[0];

  return fallbackScannedModel
    ? resolveOcrModelId(fallbackScannedModel, "")
    : "";
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
    (msg: any, targetThreadId?: string) => {
      const activeId = targetThreadId || threadHistory.activeSessionId;
      if (activeId && !isOnboardingId(activeId)) {
        const role = msg.role === "user" ? "user" : "assistant";
        appendThreadMessage(activeId, role, msg.text).catch(console.error);
      }
    },
    [threadHistory.activeSessionId],
  );

  const handleOverwriteMessages = useCallback(
    (msgs: any[]) => {
      const activeId = threadHistory.activeSessionId;
      if (!activeId) return;

      const formatted = msgs.map((message: any) => ({
        role: (message.role === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: message.text,
        timestamp: new Date(message.timestamp).toISOString(),
        citations: Array.isArray(message.citations) ? message.citations : [],
        tool_steps: Array.isArray(message.toolSteps) ? message.toolSteps : [],
      }));

      overwriteThreadMessages(activeId, formatted).catch(console.error);
    },
    [threadHistory.activeSessionId],
  );

  const threadTitle = isImageMissing
    ? "Squigit"
    : isGeneratingTitle
      ? "New thread"
      : system.sessionThreadTitle || "New thread";

  const isThreadActive = !isLoadingState && !isImageMissing && !isAuthPending;
  const thread = useThread({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    setCurrentModel: system.setSessionModel,
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

  const media = useAppMedia({ attachments: attachments.attachments });
  const busyGuard = useAppBusyGuard({
    thread,
    ocr,
    system,
    getSafeOcrModel: () => getThreadOcrModel(ocr.ocrData, undefined),
  });
  const navigation = useAppNavigation({
    thread,
    threadHistory,
    ocr,
    system,
    threadTitle,
    isActiveThreadBusy,
    closeMediaViewer: media.closeMediaViewer,
    runWithBusyGuard: busyGuard.runWithBusyGuard,
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

  const handleUpdateLensUrl = useCallback(
    (url: string | null) => {
      ocr.handleUpdateLensUrl(url);
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
    attachments: attachments.attachments,
    pendingPromptAttachmentAnalysis,
    setInputModel: drafts.setInputModel,
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
    handleUpdateLensUrl,
    handleUpdateOCRData,
    handleImageReady: capture.handleImageReady,
    handleSelectThread: navigation.handleSelectThread,
    handleNewSession: navigation.handleNewSession,
    handleAddAccount,
    setInput: drafts.setInput,
    setImageInput: drafts.setImageInput,
    setAttachments: attachments.setAttachments,
    trackPendingPromptAttachmentAnalysis,
    addAttachmentFromPath: attachments.addFromPath,
    clearAttachments: attachments.clearAttachments,
    rememberAttachmentSourcePath: media.rememberAttachmentSourcePath,
    setShowUpdate,
    handleContextMenu: contextMenuState.handleContextMenu,
    handleCloseContextMenu: contextMenuState.handleCloseContextMenu,
    handleCopy: contextMenuState.handleCopy,
    handleDeleteThreadWrapper,
    handleDeleteThreadsWrapper,
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
    getAttachmentSourcePath: media.getAttachmentSourcePath,
    containerRef,
    isOcrScanning: ocr.isOcrScanning,
    setIsOcrScanning: ocr.setIsOcrScanning,
  };
};
