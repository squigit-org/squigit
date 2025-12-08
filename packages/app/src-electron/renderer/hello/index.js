/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { setupThemeHandling, setupTrafficLights } from "../utils.js";

setupTrafficLights();
setupThemeHandling();

const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");

uploadArea.addEventListener("click", () => {
  fileInput.click();
});

uploadArea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

["dragenter", "dragover"].forEach((ev) => {
  uploadArea.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add("dragging");
  });
});
["dragleave", "dragend"].forEach((ev) => {
  uploadArea.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove("dragging");
  });
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove("dragging");
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);
  }
});

function handleFiles(files) {
  if (!files || !files.length) return;
  const file = files[0];
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const maxSize = 20 * 1024 * 1024; // 20MB

  if (!allowedTypes.includes(file.type)) {
    return;
  }

  if (file.size > maxSize) {
    return;
  }

  if (
    file.path &&
    window.electron &&
    typeof window.electron.sendImagePath === "function"
  ) {
    window.electron.sendImagePath(file.path);
  } else {
  }
}

function handleFirstTab(e) {
  if (e.key === "Tab")
    document.documentElement.classList.add("user-is-tabbing");
  window.removeEventListener("keydown", handleFirstTab);
}
window.addEventListener("keydown", handleFirstTab);
