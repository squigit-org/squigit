/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

function initialize() {
  const setupView = document.getElementById("setup-view");
  const loginView = document.getElementById("login-view");

  window.addEventListener("message", (event) => {
    if (event.data === "show-login") {
      setupView.classList.add("hidden");
      loginView.classList.remove("hidden");
    } else if (event.data === "show-setup") {
      loginView.classList.add("hidden");
      setupView.classList.remove("hidden");
    }
  });

  // --- Setup View Logic ---
  const setupBtn = document.getElementById("setup-btn");
  const buttonSvg = document.getElementById("button-svg");
  const spinner = document.getElementById("spinner");
  let watcherStarted = false;

  setupBtn.addEventListener("click", async () => {
    if (watcherStarted) return;
    watcherStarted = true;

    window.parent.electron.openExternalUrl(
      "https://aistudio.google.com/app/apikey"
    );
    buttonSvg.style.display = "none";
    spinner.style.display = "block";
    await window.parent.electron.startClipboardWatcher();
  });

  window.parent.electron.onClipboardText(async (text) => {
    if (text && text.startsWith("AIzaS")) {
      await window.parent.electron.stopClipboardWatcher();
      const passphrase = new Date().toISOString();
      await window.parent.electron.encryptAndSave(text, passphrase);

      const profileExists = await window.parent.electron.checkFileExists(
        "profile.json"
      );
      if (profileExists) {
        window.parent.electron.byokLogin();
      } else {
        setupView.classList.add("hidden");
        loginView.classList.remove("hidden");
      }
    }
  });

  // --- Login View Logic ---
  const loginBtn = document.getElementById("login-btn");
  loginBtn.addEventListener("click", () => {
    window.parent.electron.startAuth();
  });
}

window.addEventListener("DOMContentLoaded", initialize);
