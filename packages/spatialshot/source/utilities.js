/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { APP_DEFAULTS } = require("./constants");

// --- UTILITIES ---

function getUserDataPath() {
  const platform = process.platform;
  if (platform === "win32") {
    return path.join(app.getPath("localAppData"), "Spatialshot");
  } else if (platform === "darwin") {
    return path.join(app.getPath("appData"), "Spatialshot");
  } else {
    return path.join(app.getPath("home"), ".local", "share", "spatialshot");
  }
}

// --- CRYPTO ---

function getStablePassphrase() {
  const homeDir = os.homedir();
  return crypto.createHash("sha256").update(homeDir).digest("hex");
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, 150_000, 32, "sha256");
}

async function getDecryptedKey(provider) {
  if (!provider) throw new Error("provider required");
  const filePath = path.join(getUserDataPath(), `${provider}_key.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const passphrase = getStablePassphrase();
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw);
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

async function getDecryptedApiKey() {
  return getDecryptedKey('gemini');
}

// --- CONFIG & SESSION ---

function getSessionFilePath() {
  return path.join(getUserDataPath(), "session.json");
}

function readSession() {
  const sPath = getSessionFilePath();
  if (fs.existsSync(sPath)) {
    try {
      const txt = fs.readFileSync(sPath, "utf8");
      if (txt) return JSON.parse(txt);
    } catch (e) {
      console.error("Failed to read session.json:", e);
    }
  }
  return {};
}

function writeSession(obj) {
  const sPath = getSessionFilePath();
  try {
    fs.writeFileSync(sPath, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("Failed to write session.json:", e);
  }
}

const defs = {
  theme: APP_DEFAULTS.theme,
  prompt: APP_DEFAULTS.prompt,
};

// --- PREFERENCES ---

function getPreferencesPath() {
  return path.join(getUserDataPath(), "preferences.json");
}

function readPreferences() {
  const preferencesPath = getPreferencesPath();
  let preferences = {};
  if (fs.existsSync(preferencesPath)) {
    try {
      preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    } catch (e) {
      preferences = {};
    }
  }
  if (!preferences.prompt) preferences.prompt = defs.prompt || "";
  if (preferences.theme !== "light" && preferences.theme !== "dark") {
    preferences.theme = "dark";
  }
  return preferences;
}

function writePreferences(data) {
  fs.writeFileSync(getPreferencesPath(), JSON.stringify(data, null, 2));
}

module.exports = {
  getUserDataPath,
  getDecryptedApiKey,
  getDecryptedKey,
  getStablePassphrase,
  deriveKey,
  getSessionFilePath,
  readSession,
  writeSession,
  defs,
  getPreferencesPath,
  readPreferences,
  writePreferences,
};
