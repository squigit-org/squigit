/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const setupAuthHandlers = require("../auth/ipc");
const setupDialogHandlers = require("./dialogs");
const setupExternalHandlers = require("./external");
const setupImageHandlers = require("./images");
const setupPromptHandlers = require("./prompts");
const setupSettingsHandlers = require("./settings");
const setupThemeHandlers = require("./theme");
const setupViewHandlers = require("./view");
const setupWindowHandlers = require("./window");
const setupLensHandlers = require("./lens");
const { setupByokHandlers } = require("./byok");

function setupIpcHandlers(
  ipcMain,
  mainWindow,
  setupMainView,
  getCurrentImagePath,
  setCurrentImagePath,
  getMainView,
  setMainView
) {
  const dialogHelpers = setupDialogHandlers(ipcMain);

  setupAuthHandlers(
    ipcMain,
    mainWindow,
    getMainView,
    setMainView,
    setupMainView,
    getCurrentImagePath,
    dialogHelpers
  );

  setupExternalHandlers(ipcMain);

  setupImageHandlers(
    ipcMain,
    mainWindow,
    getMainView,
    getCurrentImagePath,
    setCurrentImagePath
  );

  setupPromptHandlers(ipcMain, mainWindow);

  setupSettingsHandlers(ipcMain, getMainView);

  setupThemeHandlers(ipcMain, mainWindow, getMainView);

  setupViewHandlers(ipcMain, getMainView, getCurrentImagePath);

  setupWindowHandlers(ipcMain);

  setupLensHandlers(ipcMain, getCurrentImagePath);

  setupByokHandlers();

  return dialogHelpers;
}

module.exports = { setupIpcHandlers };
