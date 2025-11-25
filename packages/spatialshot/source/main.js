/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  BrowserView,
  nativeTheme,
} = require("electron");
const path = require("path");
const fs = require("fs");
const {
  getUserDataPath,
  writeSession,
  readPreferences,
} = require("./utilities");
const { setupIpcHandlers } = require("./ipc-handlers");

// --- App State ---
let currentImagePath = null;
let mainView = null;
let mainWindow;
const getCurrentImagePath = () => currentImagePath;
const setCurrentImagePath = (path) => {
  currentImagePath = path;
};
const getMainView = () => mainView;
const setMainView = (view) => {
  mainView = view;
};

// --- Paths ---
const SPALOAD_PATH = path.join(__dirname, "spaload.js");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const RENDERER_PATH = path.join(__dirname, "./renderer");
const ICON_PATH = path.join(__dirname, "../assets/icons/light/512.png");

const getMainViewBounds = (width, height) => ({
  x: 0,
  y: 60,
  width,
  height: height - 60,
});
const hideMainViewBounds = { x: 0, y: 0, width: 0, height: 0 };

function setupMainView(theme) {
  if (mainView) return;

  mainView = new BrowserView({ webPreferences: { preload: SPALOAD_PATH } });

  mainWindow.addBrowserView(mainView);
  mainView.setBounds(hideMainViewBounds);

  mainView.webContents.on("did-finish-load", () => {
    if (currentImagePath) {
      mainView.webContents.send("image-path", currentImagePath);
      if (mainWindow) {
        const [width, height] = mainWindow.getSize();
        mainView.setBounds(getMainViewBounds(width, height));
      }
    }
  });

  const viewPath = RENDERER_PATH + `/view/${theme}.html`;
  mainView.webContents.loadURL(`file://${viewPath}`);
}

function createWindow() {
  const theme = readPreferences().theme;
  const bgColor = theme === "light" ? "#ffffff" : "#0a0a0a";

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    show: false,
    icon: ICON_PATH,
    backgroundColor: bgColor,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegrationInSubFrames: true,
    },
  });

  const cliImageArg = process.argv.find((arg) =>
    arg.toLowerCase().match(/\.(png|jpe?g|bmp|webp)$/)
  );

  if (cliImageArg) {
    const resolved = path.resolve(cliImageArg);
    if (fs.existsSync(resolved)) {
      currentImagePath = resolved;
      writeSession({ imagePath: currentImagePath });
      mainWindow.loadFile(RENDERER_PATH + "/index.html");
    } else {
      currentImagePath = null;
      mainWindow.loadFile(RENDERER_PATH + "/hello/index.html");
    }
  } else {
    currentImagePath = null;
    mainWindow.loadFile(RENDERER_PATH + "/hello/index.html");
  }

  ipcMain.once("theme-applied", () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on("resize", () => {
    if (mainView) {
      const currentBounds = mainView.getBounds();
      if (currentBounds.width > 0 || currentBounds.height > 0) {
        const [width, height] = mainWindow.getSize();
        mainView.setBounds(getMainViewBounds(width, height));
      }
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (currentImagePath) {
      mainWindow.webContents.send("image-path", currentImagePath);
    }

    const userFilePath = path.join(getUserDataPath(), "profile.json");
    const keyFilePath = path.join(getUserDataPath(), "encrypted_api.json");
    const isAuthed = fs.existsSync(userFilePath) && fs.existsSync(keyFilePath);

    if (isAuthed) {
      mainWindow.webContents.send("auth-result", { success: true });

      if (currentImagePath) {
        setupMainView(theme);
      }
    }

    const preferences = readPreferences();
    nativeTheme.themeSource = preferences.theme;
    mainWindow.webContents.send("set-theme", preferences.theme);
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers(
    ipcMain,
    mainWindow,
    setupMainView,
    getCurrentImagePath,
    setCurrentImagePath,
    getMainView,
    setMainView
  );
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
