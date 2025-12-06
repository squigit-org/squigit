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
        })
        .then(async (result) => {
          if (result.response === 0) {
            const { default: open } = await import("open");
            const { spawn } = require("child_process");
            const fs = require("fs");
            const platform = process.platform;
            let installerName;

            if (platform === "win32") {
              installerName = "spatialshot-installer.exe";
            } else if (platform === "darwin") {
              installerName = "spatialshot-installer.dmg";
            } else {
              installerName = "spatialshot-installer";
            }

            const fullPath = path.join(
              getUserDataPath() + "-installer",
              installerName
            );

            if (!fs.existsSync(fullPath)) {
              showErrorBoxHelper(
                "Installer Not Found",
                `The installer file was not found at:\n${fullPath}\n\nDid you download it?`
              );
              return;
            }

            try {
              if (platform === "linux") {
                try {
                  fs.chmodSync(fullPath, 0o755);
                } catch (e) {
                  console.warn("Could not chmod installer:", e);
                }

                const terminals = [
                  { cmd: "gnome-terminal", args: ["--"] },
                  { cmd: "konsole", args: ["-e"] },
                  { cmd: "xfce4-terminal", args: ["-e"] },
                  { cmd: "terminator", args: ["--"] },
                  { cmd: "tilix", args: ["--"] },
                  { cmd: "xterm", args: ["-e"] },
                ];

                function tryNext(index) {
                  if (index >= terminals.length) {
                    const fallback = spawn(fullPath, [], {
                      detached: true,
                      stdio: "ignore",
                    });
                    fallback.unref();
                    fallback.on("error", (fallbackErr) => {
                      showErrorBoxHelper(
                        "Update Error",
                        `Could not open a terminal to run the installer.\nPlease run it manually:\n${fullPath}`
                      );
                    });
                    return;
                  }
                  const term = terminals[index];
                  const child = spawn(term.cmd, [...term.args, fullPath], {
                    detached: true,
                    stdio: "ignore",
                  });
                  child.on("error", () => {
                    tryNext(index + 1);
                  });
                  child.unref();
                }

                tryNext(0);
              } else {
                await open(fullPath);
              }

              setTimeout(() => {
                app.quit();
              }, 1000);
            } catch (err) {
              showErrorBoxHelper(
                "Update Error",
                `Could not open the installer: ${err.message}`
              );
              console.error(getUserDataPath() + "-installer", err);
            }
          }
        });
    },
  };
};
