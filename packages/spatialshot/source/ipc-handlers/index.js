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

function setupIpcHandlers(
  ipcMain,
  mainWindow,
  setupMainView,
  getCurrentImagePath,
  setCurrentImagePath,
  getMainView,
  setMainView
) {
  setupAuthHandlers(
    ipcMain,
    mainWindow,
    getMainView,
    setMainView,
    setupMainView,
    getCurrentImagePath
  );

  setupDialogHandlers(ipcMain);

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
}

module.exports = { setupIpcHandlers };
