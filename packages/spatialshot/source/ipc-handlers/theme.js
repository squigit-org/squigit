const { nativeTheme } = require("electron");
const { readPreferences, writePreferences } = require("../utilities");

module.exports = function (ipcMain, mainWindow, getMainView) {
  ipcMain.on("set-theme", (event, theme) => {
    if (theme === "dark" || theme === "light") {
      nativeTheme.themeSource = theme;
      const preferences = readPreferences();
      preferences.theme = theme;
      writePreferences(preferences);
      if (mainWindow) mainWindow.webContents.send("set-theme", theme);
      const mainView = getMainView();
      if (mainView) mainView.webContents.send("set-theme", theme);
    }
  });
};
