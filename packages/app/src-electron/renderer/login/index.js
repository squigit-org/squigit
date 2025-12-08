/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

function el(id) {
  return document.getElementById(id);
}

const views = {
  gemini: el("gemini-setup-view"),
  imgbb: el("imgbb-setup-view"),
  login: el("login-view"),
};

function showView(id) {
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  views[id].classList.remove("hidden");
}

const isPopup = window.top === window.self; 

const urlParams = new URLSearchParams(window.location.search);
const modeParam = urlParams.get("mode");

const provider = isPopup || modeParam === "imgbb" ? "imgbb" : "gemini";

function initialize() {
  if (provider == "imgbb") {
    showView("imgbb");
  }

  window.addEventListener("message", (event) => {
    if (event.data === "show-login") {
      showView("login");
    } else if (event.data === "show-gemini") {
      showView("gemini");
    }
  });

  const setupBtn = el(provider + "-setup-btn");
  const buttonSvg = el(provider + "-button-svg");
  const spinner = el(provider + "-spinner");
  let watcherStarted = false;

  setupBtn.addEventListener("click", async () => {
    if (watcherStarted) return;
    watcherStarted = true;

    const deepLink =
      provider == "gemini"
        ? "https://aistudio.google.com/app/apikey"
        : "https://api.imgbb.com/";

    window.parent.electron.openExternalUrl(deepLink);
    buttonSvg.style.display = "none";
    spinner.style.display = "block";
    setupBtn.style.pointerEvents = "none";
    setupBtn.style.cursor = "not-allowed";
    await window.parent.electron.startClipboardWatcher();
  });

  window.parent.electron.onClipboardText(async (data) => {
    if (
      data && data.provider === provider &&
      data.key && data.key.startsWith("AIzaS")
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
        showView("login");
      }
    } else if (
      data && data.provider === provider &&
      data.key && data.key.length == 32
    ) {
      await window.electron.stopClipboardWatcher();
      await window.electron.encryptAndSave({
        plaintext: data.key,
        provider: "imgbb",
      });
      window.electron.closeWindow();
    }
  });


  el("login-btn").addEventListener("click", () => {
    el("google-logo").style.display = "none";
    el("login-spinner").style.display = "block";
    el("login-btn").style.pointerEvents = "none";
    el("login-btn").style.cursor = "not-allowed";
    window.parent.electron.startAuth();
  });
}

window.addEventListener("DOMContentLoaded", initialize);
