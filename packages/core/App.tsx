/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from "react";
import { useSystemSync } from "./hooks/useSystemSync";
import { useChatEngine } from "./hooks/useChatEngine";
import { ChatLayout } from "./components/ChatLayout";

const App: React.FC = () => {
  const [input, setInput] = useState("");
  const [isPanelActive, setIsPanelActive] = useState(false);


  const toggleSettingsPanel = useCallback(() => {
    setIsPanelActive((prev) => !prev);
  }, []);

  const system = useSystemSync(toggleSettingsPanel);

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

  return (
    <ChatLayout
      // States from engine
      messages={engine.messages}
      streamingText={engine.streamingText}
      isChatMode={engine.isChatMode}
      isLoading={engine.isLoading}
      isStreaming={engine.isStreaming}
      error={engine.error || system.systemError}
      lastSentMessage={engine.lastSentMessage}
      // States from App
      input={input}
      currentModel={system.sessionModel}
      editingModel={system.editingModel}
      // System-related states
      startupImage={system.startupImage}
      prompt={system.editingPrompt}
      userName={system.userName}
      userEmail={system.userEmail}
      avatarSrc={system.avatarSrc}
      isDarkMode={system.isDarkMode}
      // Handlers
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
      isPanelActive={isPanelActive}

    />
  );
};

export default App;