/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { setupTrafficLights, setupThemeHandling } from "./utils.js";

setupTrafficLights();
setupThemeHandling();

const contentContainer = document.getElementById("content-container");
const loginViewFrame = document.getElementById("login-view");
const settingsBtn = document.getElementById("settings-btn");

settingsBtn.addEventListener("click", () => {
  window.electron.toggleSettings();
});

window.addEventListener("DOMContentLoaded", () => {
  window.electron.checkAuthStatus().then(async (isAuthenticated) => {
    if (isAuthenticated) {
      loginViewFrame.style.display = "none";
      initializeSPA();
    } else {
      loginViewFrame.style.display = "block";
      window.electron.hideMainView();

      const keyExists = await window.electron.checkFileExists(
        "gemini_key.json"
      );
      const command = keyExists ? "show-login" : "show-gemini";

      const sendMessage = () => {
        loginViewFrame.contentWindow.postMessage(command, "*");
      };

      if (
        loginViewFrame.contentDocument &&
        loginViewFrame.contentDocument.readyState === "complete"
      ) {
        sendMessage();
      } else {
        loginViewFrame.addEventListener("load", sendMessage, { once: true });
      }
    }
  });
});

window.electron.onAuthResult((result) => {
  if (result.success) {
    loginViewFrame.style.display = "none";
    initializeSPA();
  }
});

function initializeSPA() {
  const rect = contentContainer.getBoundingClientRect();
  const viewBounds = {
    x: Math.floor(rect.left),
    y: Math.floor(rect.top),
    width: Math.floor(rect.width),
    height: Math.floor(rect.height),
  };
  window.electron.setMainViewBounds(viewBounds);
}
