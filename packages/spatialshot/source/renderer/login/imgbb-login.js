/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

function initialize() {
  const setupBtn = document.getElementById("setup-btn");
  const buttonSvg = document.getElementById("button-svg");
  const spinner = document.getElementById("spinner");
  let watcherStarted = false;

  setupBtn.addEventListener("click", async () => {
    if (watcherStarted) return;
    watcherStarted = true;

    window.electron.openExternalUrl("https://api.imgbb.com/");
    buttonSvg.style.display = "none";
    spinner.style.display = "block";
    await window.electron.startClipboardWatcher();
  });

  window.electron.onClipboardText(async (data) => {
    if (data && data.provider === "imgbb" && data.key) {
      await window.electron.stopClipboardWatcher();
      await window.electron.encryptAndSave({
        plaintext: data.key,
        provider: "imgbb",
      });
      window.electron.closeWindow();
    }
  });
}

window.addEventListener("DOMContentLoaded", initialize);
