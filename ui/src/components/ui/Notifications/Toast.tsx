/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export function showToast(message: string, type: "success" | "done" | "error") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  const existingTimerId = Number(toast.dataset.timerId);
  if (existingTimerId) {
    clearTimeout(existingTimerId);
  }

  toast.textContent = message;
  toast.classList.remove("success", "done", "error");
  toast.classList.add(type, "show");

  const newTimerId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
  toast.dataset.timerId = String(newTimerId);
}
