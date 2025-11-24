const fs = require("fs");
const path = require("path");
const { authenticate } = require(".");
const { getUserDataPath, readPreferences } = require("../utilities");

module.exports = function (
  ipcMain,
  mainWindow,
  getMainView,
  setMainView,
  setupMainView,
  getCurrentImagePath
) {
  function safeSendAuthResult(payload) {
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("auth-result", payload);
    }
  }

  ipcMain.on("start-auth", async () => {
    try {
      const { profile } = await authenticate();
      const theme = readPreferences().theme;

      const user = {
        name: profile.names?.[0]?.displayName || "",
        email: profile.emailAddresses?.[0]?.value || "",
        avatar: profile.photos?.[0]?.url || "",
      };
      fs.writeFileSync(
        path.join(getUserDataPath(), "profile.json"),
        JSON.stringify(user)
      );

      safeSendAuthResult({ success: true });

      if (getCurrentImagePath()) {
        setupMainView(theme);
      }
    } catch (error) {
      console.error("Authentication error:", error);
      safeSendAuthResult({ success: false, error: error.message });
    }
  });

  ipcMain.on("logout", async () => {
    const mainView = getMainView();
    if (mainWindow) {
      if (mainView) {
        mainWindow.removeBrowserView(mainView);
        mainView.webContents.destroy();
        setMainView(null);
      }
      mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }
    const userFilePath = path.join(getUserDataPath(), "profile.json");
    if (fs.existsSync(userFilePath)) {
      fs.unlinkSync(userFilePath);
    }
  });

  ipcMain.handle("get-user-data", () => {
    const p = path.join(getUserDataPath(), "profile.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    return null;
  });

  ipcMain.handle("check-auth-status", () =>
    fs.existsSync(path.join(getUserDataPath(), "profile.json"))
  );
};
