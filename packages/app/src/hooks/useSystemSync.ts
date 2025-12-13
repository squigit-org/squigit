/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { showFeedbackMessage } from "../components/utilities";
import { initializeGemini } from "../services/geminiService";

export const useSystemSync = (onToggleSettings: () => void) => {
  const [apiKey, setApiKey] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>("");
  const [editingPrompt, setEditingPrompt] = useState<string>("");
  const [startupModel, setStartupModel] = useState<string>("gemini-2.5-flash");
  const [editingModel, setEditingModel] = useState<string>("gemini-2.5-flash");
  const [sessionModel, setSessionModel] = useState<string>("gemini-2.5-flash");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(
    !document.body.classList.contains("light-mode")
  );
  const [startupImage, setStartupImage] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const clearSystemError = () => setSystemError(null);

  useEffect(() => {
    const unlistenPromise = listen<string>("theme-changed", (event) => {
      const theme = event.payload;
      const newIsDarkMode = theme === "dark";
      setIsDarkMode(newIsDarkMode);
      document.body.classList.toggle("light-mode", !newIsDarkMode);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    let unlisteners: (() => void)[] = [];

    const setupIpc = async () => {
      try {
        const key = await invoke<string>("get_api_key");
        if (key) {
          setApiKey(key);
          initializeGemini(key);
        }

        const savedPrompt = await invoke<string>("get_prompt");
        if (savedPrompt) {
          setActivePrompt(savedPrompt);
          setEditingPrompt(savedPrompt);
        }

        const savedModel = await invoke<string>("get_model");
        if (savedModel) {
          setStartupModel(savedModel);
          setEditingModel(savedModel);
          setSessionModel(savedModel);
        }

        const userData = await invoke<any>("get_user_data");
        if (userData) {
          setUserName(userData.name);
          setUserEmail(userData.email);
          setAvatarSrc(userData.avatar);
        }
      } catch (e) {
        console.error("Config load error", e);
        setSystemError("Failed to load configuration.");
      }

      const loadImageFromPath = async (path: string) => {
        try {
          const data = await invoke<{ base64: string; mimeType: string }>(
            "read_image_file",
            { path }
          );
          if (data) {
            setStartupImage(data);
          }
        } catch (e) {
          console.error("Failed to read image file", e);
        }
      };

      const sessionPath = await invoke<string>("get_session_path");
      if (sessionPath) {
        await loadImageFromPath(sessionPath);
      }

      const unlistenImage = await listen<string>("image-path", (event) => {
        console.log("Received new image path from Main:", event.payload);
        loadImageFromPath(event.payload);
      });
      unlisteners.push(unlistenImage);

      const unlistenSettings = await listen("toggle-settings", () => {
        onToggleSettings();
      });
      unlisteners.push(unlistenSettings);

      const unlistenFeedback = await listen<any>("show-feedback-from-main", (event) => {
        showFeedbackMessage(event.payload.message, event.payload.type);
      });
      unlisteners.push(unlistenFeedback);
    };

    setupIpc();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [onToggleSettings]);

  const saveSettings = (newPrompt: string, newModel: string) => {
    setStartupModel(newModel);
    setEditingModel(newModel);
    setActivePrompt(newPrompt);
    setEditingPrompt(newPrompt);
    
    invoke("save_prompt", { prompt: newPrompt });
    invoke("save_model", { model: newModel });
    showFeedbackMessage("Settings saved", "done");
  };

  const handleToggleTheme = () => {
    const newIsDarkMode = !isDarkMode;
    setIsDarkMode(newIsDarkMode);
    document.body.classList.toggle("light-mode", !newIsDarkMode);
    invoke("set_theme", { theme: newIsDarkMode ? "dark" : "light" });
  };

  const handleLogout = () => {
    invoke("logout");
  };

  const handleResetAPIKey = () => {
    invoke("reset_api_key");
  };

  return {
    apiKey,
    prompt: activePrompt,
    editingPrompt,
    setEditingPrompt,
    startupModel,
    editingModel,
    setEditingModel,
    sessionModel,
    setSessionModel,
    startupImage,
    userName,
    userEmail,
    avatarSrc,
    isDarkMode,
    systemError,
    clearSystemError,
    saveSettings,
    handleToggleTheme,
    handleLogout,
    handleResetAPIKey,
  };
};
