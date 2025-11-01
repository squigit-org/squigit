/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

import * as welcome from "../pages/welcome/index.js";
import { showFeedbackMessage } from "../shared/utils.js";
import {
  createPage as createSettingsPage,
  updateUserInfo,
} from "../pages/settings/index.js";

const pageMap = {
  ai: "../pages/ai/index.js",
  lens: "../pages/lens/index.js",
};

let currentImagePath = null;
let currentCategory = null;
let isRendering = false;
const pageCache = {};

async function loadPageModule(category) {
  const modulePath = pageMap[category];
  if (!modulePath) return null;
  try {
    const mod = await import(modulePath);
    return mod;
  } catch (err) {
    console.error("Failed to import page", modulePath, err);
    return null;
  }
}

async function renderCategory(category) {
  const container = document.getElementById("content-container");
  if (!container) return;

  if (isRendering && currentCategory === category) {
    console.log("renderCategory: already rendering", category);
    return;
  }

  isRendering = true;
  currentCategory = category;

  try {
    for (const child of container.children) {
      child.style.display = "none";
    }

    if (pageCache[category]) {
      pageCache[category].style.display = "flex";
    } else {
      const mod = await loadPageModule(category);
      let pageEl;
      if (mod && typeof mod.createPage === "function") {
        pageEl = mod.createPage(currentImagePath);
      } else {
        pageEl = document.createElement("div");
        pageEl.className = "page-center";
        const message = document.createElement("div");
        message.className = "page-text";
        message.textContent = currentImagePath
          ? `Processing image for ${category}...`
          : "No image provided. Please launch with an image path.";
        pageEl.appendChild(message);
      }
      pageCache[category] = pageEl;
      container.appendChild(pageEl);
      pageEl.style.display = "flex";
    }
  } catch (err) {
    console.error("renderCategory error", err);
  } finally {
    isRendering = false;
  }
}

function toggleSettingsPanel() {
  const panel = document.getElementById("panel");
  const panelOverlay = document.getElementById("panel-overlay");
  panel.classList.toggle("active");
  panelOverlay.classList.toggle("active");
}

function closeSettingsPanel() {
  const panel = document.getElementById("panel");
  const panelOverlay = document.getElementById("panel-overlay");
  panel.classList.remove("active");
  panelOverlay.classList.remove("active");
}

function initializeSettingsPanel() {
  const panel = document.getElementById("panel");
  const panelOverlay = document.getElementById("panel-overlay");
  const welcomeScreen = document.getElementById("welcome-screen");
  const settingsContent = document.getElementById("settings-content");

  const settingsPage = createSettingsPage();
  settingsContent.appendChild(settingsPage);

  const settingsBtn = document.querySelector(
    '.cat-btn[data-category="settings"]'
  );
  if (settingsBtn) {
    settingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (welcomeScreen.style.display !== "none") return;

      toggleSettingsPanel();
    });
  }

  // For panel Esc close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('active')) {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        closeSettingsPanel();
      }
    }
  });

  // For global Esc close window
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        window.handleEscape();
      }
    }
  });

  panelOverlay.addEventListener("click", () => {
    closeSettingsPanel();
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !settingsBtn.contains(e.target)) {
      panel.classList.remove('active');
      const promptView = document.getElementById('promptView');
      if (promptView) {
        promptView.classList.remove('active');
        const settingsPage = document.querySelector('.settings-page');
        if (settingsPage) settingsPage.classList.remove('subview-active');
      }
      const premiumView = document.getElementById('premiumView'); // Add this
      if (premiumView) {
        premiumView.classList.remove('active');
        const settingsPage = document.querySelector('.settings-page');
        if (settingsPage) settingsPage.classList.remove('subview-active');
      }
    }
  });

  const darkModeBtn = document.getElementById("darkModeBtn");
  const darkModeToggle = document.getElementById("darkModeToggle");
  if (darkModeBtn) {
    darkModeBtn.addEventListener("click", () => {
      darkModeToggle.checked = !darkModeToggle.checked;
      electronAPI.toggleTheme();
    });
  }

  const clearCacheBtn = document.getElementById("clearCacheBtn");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      electronAPI.clearCache();
      showFeedbackMessage("Cache cleared", "success");
    });
  }

  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", async () => {
      const userData = await electronAPI.getUserData();
      if (
        userData &&
        confirm(
          "Are you sure you want to permanently delete your account? This action cannot be undone."
        )
      ) {
        await electronAPI.deleteAccount(userData.email);
        window.location.reload();
      }
    });
  }
}

async function preLoadCategory(category) {
  const container = document.getElementById("content-container");
  if (!container || pageCache[category]) return;

  try {
    const mod = await loadPageModule(category);
    let pageEl;
    if (mod && typeof mod.createPage === "function") {
      pageEl = mod.createPage(currentImagePath);
    } else {
      pageEl = document.createElement("div");
      pageEl.className = "page-center";
      const message = document.createElement("div");
      message.className = "page-text";
      message.textContent = currentImagePath
        ? `Processing image for ${category}...`
        : "No image provided. Please launch with an image path.";
      pageEl.appendChild(message);
    }
    pageCache[category] = pageEl;
    container.appendChild(pageEl);
    pageEl.style.display = "none";
  } catch (err) {
    console.error("preLoadCategory error", err);
  }
}

async function initializeApp() {
  const electronAPI = /** @type {any} */ (window).electronAPI;

  currentImagePath = electronAPI?.getImagePath?.() || null;

  electronAPI?.onImagePathUpdate?.(async (newImagePath) => {
    console.log("Image path updated:", newImagePath);
    currentImagePath = newImagePath;

    if (currentCategory) {
      await renderCategory(currentCategory);
    }
  });

  let lastClickInfo = { time: 0, category: null };

  document.querySelectorAll(".cat-btn").forEach((btn) => {
    const category = btn.dataset.category;
    btn.addEventListener("click", async () => {
      if (!category || category === "settings") return;

      if (welcome.onTabClick(category)) {
        const now = Date.now();
        const { time, category: lastCategory } = lastClickInfo;

        if (lastCategory === category && now - time < 300) {
          if (pageCache[category]) {
            const webview = pageCache[category].querySelector("webview");
            switch (category) {
              case "ai":
              case "lens":
                if (webview) {
                  await webview._clearCache();
                  webview._safeReload();
                }
                break;
              case "settings":
                break;
            }
          }
        } else {
          lastClickInfo = { time: now, category };

          if (!btn.classList.contains("active")) {
            document
              .querySelectorAll(".cat-btn")
              .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            await renderCategory(category);
          }
        }
      }
    });
  });

  const activateAiTab = () => {
    const aiBtn = document.querySelector('.cat-btn[data-category="ai"]');
    if (aiBtn) {
      aiBtn.classList.add("active");
      renderCategory("ai");
      preLoadCategory("lens");
    }
  };

  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      electronAPI?.startAuth?.();
    });
  }

  electronAPI.onAuthResult(async (result) => {
    if (result.success && result.user) {
      welcome.onActivate(activateAiTab);
      updateUserInfo();
    } else {
      console.error("Authentication failed:", result.error);
    }
  });

  const userData = await electronAPI.getUserData();
  if (userData) {
    welcome.onActivate(activateAiTab, true);

    electronAPI
      .verifyUserStatus(userData.email)
      .then((verificationResult) => {
        if (!verificationResult) return;

        if (verificationResult.status === "VALID") {
          electronAPI.saveUserData(verificationResult.user);
        } else if (verificationResult.status === "NOT_FOUND") {
          electronAPI.logout();
          window.location.reload();
        }
      })
      .catch((error) => {
        console.warn(
          "Could not verify user status (likely offline): ",
          error.message
        );
      });
  } else {
    welcome.onAppStart();
  }

  const closeBtn = document.querySelector(".close-btn");
  if (closeBtn) closeBtn.addEventListener("click", () => window.close());

  const minimizeBtn = document.querySelector(".minimize-btn");
  if (minimizeBtn)
    minimizeBtn.addEventListener("click", () => electronAPI?.minimize?.());

  const maximizeBtn = document.querySelector(".maximize-btn");
  if (maximizeBtn)
    maximizeBtn.addEventListener("click", () => electronAPI?.maximize?.());

  window.handleEscape = () => {
    window.close();
  };

  initializeSettingsPanel();
}

document.addEventListener("DOMContentLoaded", initializeApp);
