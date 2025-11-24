const { app } = require("electron");
const path = require("path");
const fs = require("fs");

// --- CONFIG & SESSION ---

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

const { theme, prompt } = require("../config.private.json").app_defaults;

const { api_key } = require("../config.private.json").google_gemini;

const defs = { theme, prompt };
const apiKey = api_key || "";

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
  getSessionFilePath,
  readSession,
  writeSession,
  defs,
  apiKey,
  getPreferencesPath,
  readPreferences,
  writePreferences,
};
