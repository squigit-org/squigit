const {
  readPreferences,
  writePreferences,
  apiKey,
  defs,
} = require("../utilities");

module.exports = function (ipcMain, mainWindow) {
  ipcMain.handle("get-prompt", () => readPreferences().prompt);
  ipcMain.handle("get-api-key", async () => apiKey);
  ipcMain.handle("reset-prompt", () => {
    return defs.prompt;
  });
  ipcMain.handle("save-prompt", (event, prompt) => {
    const p = readPreferences();
    p.prompt = prompt;
    writePreferences(p);
    if (mainWindow)
      mainWindow.webContents.send("show-feedback", {
        message: "prompt saved",
        type: "done",
      });
  });
};
