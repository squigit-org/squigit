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
  // null = loading, false = show hello, true = show chat
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

  // Startup Logic: Check Rust state for CLI image
  useEffect(() => {
    async function checkStartup() {
      try {
        const img = await invoke<string | null>("get_current_image");
        if (img) {
          // IMPORTANT: Convert string data URL to object expected by system
          const mimeType = img.substring(img.indexOf(":") + 1, img.indexOf(";"));
          system.setStartupImage({ base64: img, mimeType }); 
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
  }, []); // Run once on mount

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
    // Extract mime type manually for HelloScreen uploads
    const mimeType = base64Image.substring(base64Image.indexOf(":") + 1, base64Image.indexOf(";"));
    system.setStartupImage({ base64: base64Image, mimeType });
    setHasImage(true);
  };

  // 1. Loading State
  if (hasImage === null) return <div className="bg-neutral-950 h-screen w-full"></div>;

  // 2. Hello Screen (No Image)
  if (!hasImage) {
    return <HelloScreen onImageReady={handleImageReady} />;
  }

  // 3. Chat Layout (Has Image)
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