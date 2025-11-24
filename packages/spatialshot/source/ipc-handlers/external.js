const { shell } = require("electron");

module.exports = function (ipcMain) {
  ipcMain.on("open-external-url", (event, url) => shell.openExternal(url));
};
