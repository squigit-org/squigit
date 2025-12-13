import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSystemSync } from "./hooks/useSystemSync";
import { useChatEngine } from "./hooks/useChatEngine";
import { ChatLayout } from "./components/chat/ChatLayout";
import HelloScreen from "./components/hello/HelloScreen";

const App: React.FC = () => {
  const [input, setInput] = useState("");
  const [isPanelActive, setIsPanelActive] = useState(false);
  const [hasImage, setHasImage] = useState<boolean | null>(null);

  const toggleSettingsPanel = useCallback(() => {
    setIsPanelActive((prev) => !prev);
  }, []);

  const system = useSystemSync(toggleSettingsPanel);

  useEffect(() => {
    const unlisten = listen("toggle-settings", () => {
      toggleSettingsPanel();
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [toggleSettingsPanel]);

  useEffect(() => {
    async function checkStartup() {
      try {
        const img = await invoke<string | null>("get_current_image");
        if (img) {
          system.setStartupImage(img);
          setHasImage(true);
        } else {
          setHasImage(false);
        }
      } catch (e) {
        console.error("Failed to check startup image", e);
        setHasImage(false);
      }
    }
    checkStartup();
  }, []);

  const engine = useChatEngine({
    apiKey: system.apiKey,
    currentModel: system.sessionModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel: system.setSessionModel,
  });

  const handleSend = () => {
    if (!input.trim()) return;
    engine.handleSend(input.trim());
    setInput("");
  };

  const handleRetry = () => {
    if (engine.lastSentMessage) {
      engine.handleRetrySend();
    } else {
      engine.startSession(system.apiKey, system.sessionModel, system.startupImage);
    }
  };

  const handleCheckSettings = () => {
    engine.clearError();
    system.clearSystemError();
    toggleSettingsPanel();
  };

  const handleImageReady = (base64Image: string) => {
    system.setStartupImage(base64Image);
    setHasImage(true);
  };

  if (hasImage === null) return null;

  if (!hasImage) {
    return <HelloScreen onImageReady={handleImageReady} />;
  }

  return (
    <ChatLayout
      messages={engine.messages}
      streamingText={engine.streamingText}
      isChatMode={engine.isChatMode}
      isLoading={engine.isLoading}
      isStreaming={engine.isStreaming}
      error={engine.error || system.systemError}
      lastSentMessage={engine.lastSentMessage}
      input={input}
      currentModel={system.sessionModel}
      editingModel={system.editingModel}
      startupImage={system.startupImage}
      prompt={system.editingPrompt}
      userName={system.userName}
      userEmail={system.userEmail}
      avatarSrc={system.avatarSrc}
      isDarkMode={system.isDarkMode}
      onSend={handleSend}
      onModelChange={system.setSessionModel}
      onEditingModelChange={system.setEditingModel}
      onRetry={handleRetry}
      onSave={(newPrompt: string, newModel: string) => system.saveSettings(newPrompt, newModel)}
      onLogout={system.handleLogout}
      onToggleTheme={system.handleToggleTheme}
      onResetAPIKey={system.handleResetAPIKey}
      onInputChange={setInput}
      setPrompt={system.setEditingPrompt}
      toggleSettingsPanel={toggleSettingsPanel}
      onCheckSettings={handleCheckSettings}
      isPanelActive={isPanelActive}
    />
  );
};

export default App;