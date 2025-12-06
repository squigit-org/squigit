/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require("fs");
const path = require("path");
const { writeSession } = require("../utilities");

module.exports = function (
  ipcMain,
  mainWindow,
  getMainView,
  getCurrentImagePath,
  setCurrentImagePath
) {
  ipcMain.on("image-path", (event, imagePath) => {
    try {
      if (!imagePath || !fs.existsSync(imagePath)) return;

      setCurrentImagePath(path.resolve(imagePath));
      writeSession({ imagePath: getCurrentImagePath() });

      if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
      }

      const mainView = getMainView();
      if (mainView && !mainView.webContents.isDestroyed()) {
        mainView.webContents.send("image-path", getCurrentImagePath());
      }
    } catch (e) {
      console.error("Error handling image-path:", e);
    }
  });

  ipcMain.handle("get-session-path", () => getCurrentImagePath());

  ipcMain.handle("read-image-file", async (event, filePath) => {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).replace(".", "").toLowerCase();
    return {
      base64: buf.toString("base64"),
      mimeType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    };
  });
};
