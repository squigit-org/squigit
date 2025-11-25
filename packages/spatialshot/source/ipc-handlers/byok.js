/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("node:crypto");
const {
  getUserDataPath,
  getStablePassphrase,
  deriveKey,
} = require("../utilities");
let watcher = null;

function setupByokHandlers() {
  /* ---------- Clipboard watcher (library + fallback) ---------- */
  ipcMain.handle("start-clipboard-watcher", (ev) => {
    const { clipboard } = require("electron");
    if (watcher && watcher.intervalId) clearInterval(watcher.intervalId);

    const intervalId = setInterval(() => {
      try {
        const t = clipboard.readText();
        if (t && ev.sender && !ev.sender.isDestroyed()) {
          ev.sender.send("clipboard-text", t);
        }
      } catch (_) {}
    }, 1000);

    watcher = { intervalId };
    return { ok: true, used: "polling" };
  });

  ipcMain.handle("stop-clipboard-watcher", () => {
    if (!watcher) return;
    if (watcher.stop) watcher.stop();
    if (watcher.intervalId) clearInterval(watcher.intervalId);
    watcher = null;
  });

  /* --- Encryption helpers (AES-256-GCM, PBKDF2 key derivation) --- */
  ipcMain.handle("encrypt-and-save", async (ev, { plaintext }) => {
    if (!plaintext) throw new Error("plaintext required");
    const passphrase = getStablePassphrase();
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = deriveKey(passphrase, salt);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload = {
      version: 1,
      algo: "aes-256-gcm",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    };

    const outPath = path.join(getUserDataPath(), "encrypted_api.json");
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), {
      mode: 0o600,
    });
    return { path: outPath };
  });
}

module.exports = { setupByokHandlers };
