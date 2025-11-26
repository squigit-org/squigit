/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

function initialize() {
  const geminiView = document.getElementById("gemini-view");
  const imgbbView = document.getElementById("imgbb-view");
  const loginView = document.getElementById("login-view");

  window.addEventListener("message", (event) => {
    if (event.data === "show-login") {
      geminiView.classList.add("hidden");
      imgbbView.classList.add("hidden");
      loginView.classList.remove("hidden");
    } else if (event.data === "show-gemini") {
      loginView.classList.add("hidden");
      imgbbView.classList.add("hidden");
      geminiView.classList.remove("hidden");
    } else if (event.data === "show-imgbb") {
      geminiView.classList.add("hidden");
      loginView.classList.add("hidden");
      imgbbView.classList.remove("hidden");
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

    const deepLink = "https://aistudio.google.com/app/apikey";
    const geminiKeyExists = await window.parent.electron.checkFileExists(
      "gemini_key.json"
    );
    if (geminiKeyExists) {
      deepLink = "https://api.imgbb.com/";
    }
    window.parent.electron.openExternalUrl(deepLink);
    buttonSvg.style.display = "none";
    spinner.style.display = "block";
    await window.parent.electron.startClipboardWatcher();
  });

  window.parent.electron.onClipboardText(async (data) => {
    if (
      data &&
      data.provider === "gemini" &&
      data.key &&
      data.key.startsWith("AIzaS")
    ) {
      await window.parent.electron.stopClipboardWatcher();
      await window.parent.electron.encryptAndSave({
        plaintext: data.key,
        provider: "gemini",
      });

      const profileExists = await window.parent.electron.checkFileExists(
        "profile.json"
      );
      if (profileExists) {
        window.parent.electron.byokLogin();
      } else {
        geminiView.classList.add("hidden");
        imgbbView.classList.add("hidden");
        loginView.classList.remove("hidden");
      }
    } else if (data && data.provider === "imgbb" && data.key) {
      await window.electron.stopClipboardWatcher();
      await window.electron.encryptAndSave({
        plaintext: data.key,
        provider: "imgbb",
      });
      window.electron.closeWindow();
    }
  });

  // --- Login View Logic ---
  const loginBtn = document.getElementById("login-btn");
  loginBtn.addEventListener("click", () => {
    window.parent.electron.startAuth();
  });
}

window.addEventListener("DOMContentLoaded", initialize);
