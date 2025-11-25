/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from "react";
import { ModelType } from "./types";
import { useSystemSync } from "./hooks/useSystemSync";
import { useChatEngine } from "./hooks/useChatEngine";
import { ChatLayout } from "./components/ChatLayout";

const App: React.FC = () => {
  const [input, setInput] = useState("");
  const [currentModel, setCurrentModel] = useState<string>(
    ModelType.GEMINI_2_5_FLASH
  );
  const [isPanelActive, setIsPanelActive] = useState(false);


  const toggleSettingsPanel = useCallback(() => {
    setIsPanelActive((prev) => !prev);
  }, []);

  const system = useSystemSync(toggleSettingsPanel);



  const engine = useChatEngine({
    apiKey: system.apiKey,
    currentModel,
    startupImage: system.startupImage,
    prompt: system.prompt,
    setCurrentModel,

  });

  const handleSend = () => {
    if (!input.trim()) return;
    engine.handleSend(input.trim());
    setInput("");
  };

  const handleModelChange = (newModel: string) => {
    setCurrentModel(newModel);
  };

  const handleRetry = () => {
    if (engine.lastSentMessage) {
      engine.handleRetrySend();
    } else {
      engine.startSession(system.apiKey, currentModel, system.startupImage);
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
      currentModel={currentModel}
      // System-related states
      startupImage={system.startupImage}
      prompt={system.prompt}
      userName={system.userName}
      userEmail={system.userEmail}
      avatarSrc={system.avatarSrc}
      isDarkMode={system.isDarkMode}
      // Handlers
      onSend={handleSend}
      onModelChange={handleModelChange}
      onRetry={handleRetry}
      onSavePrompt={system.handleSavePrompt}
      onLogout={system.handleLogout}
      onToggleTheme={system.handleToggleTheme}
      onResetAPIKey={system.handleResetAPIKey}
      onInputChange={setInput}
      toggleSettingsPanel={toggleSettingsPanel}
      isPanelActive={isPanelActive}

    />
  );
};

export default App;
