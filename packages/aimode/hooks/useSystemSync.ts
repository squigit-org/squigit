import { useState, useEffect } from "react";
import { showFeedbackMessage } from "../components/utilities";
import { initializeGemini } from "../services/geminiService";

const ipc = "ipc" in window ? (window as any).ipc : null;

export const useSystemSync = (onToggleSettings: () => void) => {
  const [apiKey, setApiKey] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
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

  useEffect(() => {
    if (ipc && ipc.onThemeChanged) {
      ipc.onThemeChanged((theme: string) => {
        const newIsDarkMode = theme === "dark";
        setIsDarkMode(newIsDarkMode);
        document.body.classList.toggle("light-mode", !newIsDarkMode);
      });
    }
  }, []);

  useEffect(() => {
    const setupIpc = async () => {
      if (!ipc) {
        setSystemError("IPC bridge not available.");
        return;
      }

      try {
        const key = await ipc.getApiKey();
        if (key) {
          setApiKey(key);
          initializeGemini(key);
        }

        const savedPrompt = await ipc.getPrompt();
        if (savedPrompt) setPrompt(savedPrompt);

        const userData = await ipc.getUserData();
        if (userData) {
          setUserName(userData.name);
          setUserEmail(userData.email);
          setAvatarSrc(userData.avatar);
        }
      } catch (e) {
        console.error("Config load error", e);
      }

      const loadImageFromPath = async (path: string) => {
        try {
          const data = await ipc.readImageFile(path);
          if (data) {
            setStartupImage(data);
          }
        } catch (e) {
          console.error("Failed to read image file", e);
        }
      };

      const sessionPath = await ipc.getSessionPath();
      if (sessionPath) {
        await loadImageFromPath(sessionPath);
      }

      if (ipc.onImagePath) {
        ipc.onImagePath((newPath: string) => {
          console.log("Received new image path from Main:", newPath);
          loadImageFromPath(newPath);
        });
      }

      if (ipc.onToggleSettings) {
        ipc.onToggleSettings(onToggleSettings);
      }

      if (ipc.onShowFeedbackFromMain) {
        ipc.onShowFeedbackFromMain((arg: any) =>
          showFeedbackMessage(arg.message, arg.type)
        );
      }
    };

    setupIpc();
  }, [onToggleSettings]);

  const handleSavePrompt = (newPrompt: string) => {
    setPrompt(newPrompt);
    if (ipc) {
      ipc.savePrompt(newPrompt);
      showFeedbackMessage("prompt saved", "done");
    }
  };

  const handleToggleTheme = () => {
    const newIsDarkMode = !isDarkMode;
    setIsDarkMode(newIsDarkMode);
    document.body.classList.toggle("light-mode", !newIsDarkMode);
    if (ipc) {
      ipc.setTheme(newIsDarkMode ? "dark" : "light");
    }
  };

  const handleLogout = () => {
    if (ipc) {
      ipc.logout();
    }
  };

  return {
    apiKey,
    prompt,
    startupImage,
    userName,
    userEmail,
    avatarSrc,
    isDarkMode,
    systemError,
    handleSavePrompt,
    handleToggleTheme,
    handleLogout,
  };
};
