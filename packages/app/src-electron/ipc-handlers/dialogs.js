/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { dialog, app } = require("electron");
const { getUserDataPath } = require("../utilities");
const path = require("path");

module.exports = function (ipcMain) {
  ipcMain.handle("open-file-dialog", async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "webp"] },
      ],
    });
    return filePaths[0];
  });

  ipcMain.handle("show-unsaved-changes-alert", async () => {
    const result = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Save", "Don't Save"],
      title: "Unsaved Changes",
      message: "You have unsaved changes. Do you want to save them?",
      defaultId: 0,
      cancelId: 1,
    });
    return result.response === 0 ? "save" : "dont-save";
  });

  const showErrorBoxHelper = (title, message) => {
    dialog.showMessageBox({
      type: "error",
      title: title,
      message: message,
      buttons: ["OK"],
    });
  };

  return {
    showErrorBox: showErrorBoxHelper,

    showUpdateDialog: (newVersion, oldVersion) => {
      dialog
        .showMessageBox({
          type: "info",
          title: "Update Available",
          message: `New version ${newVersion} is available!`,
          detail: `You are on ${oldVersion}. Check the changelog for details.`,
          buttons: ["Update now", "Cancel"],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        })
        .then(async (result) => {
          if (result.response === 0) {
            
            const updatesDir = path.join(getUserDataPath(), "updates");
            const platform = process.platform;
            let installerName;

            if (platform === "win32") {
              installerName = "Spatialshot-Setup.exe";
            } else if (platform === "darwin") {
              installerName = "Spatialshot-Setup.dmg";
            } else {
              installerName = "Spatialshot-Setup";
            }

            const fullPath = path.join(updatesDir, installerName);

            if (!fs.existsSync(fullPath)) {
              showErrorBoxHelper(
                "Installer Not Found",
                `The update file is missing at:\n${fullPath}\n\nPlease download it manually from GitHub.`
              );
              shell.openExternal("https://github.com/a7mddra/spatialshot/releases");
              return;
            }

            try {
              if (platform === "linux") {
                try {
                  fs.chmodSync(fullPath, 0o755);
                } catch (e) {
                  console.warn("Could not chmod installer:", e);
                }
              }

              if (platform === "darwin") {
                await shell.openPath(fullPath);
              } else {
                const child = spawn(fullPath, [], {
                  detached: true,
                  stdio: "ignore", 
                  windowsHide: false 
                });
                
                child.unref();
              }

              setTimeout(() => {
                app.quit();
              }, 1500);

            } catch (err) {
              showErrorBoxHelper(
                "Update Error",
                `Failed to launch setup: ${err.message}`
              );
            }
          }
        });
    },
  };
};
