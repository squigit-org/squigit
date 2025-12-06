/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { shell, BrowserWindow, app } = require("electron");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getDecryptedKey, getDynamicDims } = require("../utilities");

async function openImageInLens(localImagePath) {
  try {
    const imgbbApiKey = await getDecryptedKey("imgbb");
    if (!imgbbApiKey) {
      console.error("ImgBB API key not found.");
      return;
    }
    const image = fs.readFileSync(localImagePath, { encoding: "base64" });

    const formData = new URLSearchParams();
    formData.append("image", image);

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${imgbbApiKey}`,
      formData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.success) {
      const encodedUrl = encodeURIComponent(response.data.data.url);
      const configUrl = "&ep=subb&re=df&s=4&hl=en&gl=US";
      const lensUrl = "https://lens.google.com/uploadbyurl?";
      await shell.openExternal(lensUrl + "url=" + encodedUrl + configUrl);
    } else {
      console.error("Error uploading to ImgBB:", response.data);
    }
  } catch (error) {
    console.error("Error in openImageInLens:", error);
  }
}

function setupLensHandlers(ipcMain, getCurrentImagePath) {
  ipcMain.handle("trigger-lens-search", async () => {
    const imgbbApiKey = await getDecryptedKey("imgbb");
    if (imgbbApiKey) {
      const imagePath = getCurrentImagePath();
      if (!imagePath) {
        console.error("No image path found in main process");
        return;
      }
      await openImageInLens(imagePath);
    } else {
      const dims = getDynamicDims(480, 430);
      const win = new BrowserWindow({
        width: dims.windowWidth,
        height: dims.windowHeight,
        x: dims.x,
        y: dims.y,
        alwaysOnTop: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        webPreferences: {
          preload: path.join(app.getAppPath(), "source", "preload.js"),
        },
      });

      win.loadFile(
        path.join(
          app.getAppPath(),
          "source",
          "renderer",
          "login",
          "index.html"
        ),
        { query: { mode: "imgbb" } }
      );

      win.on("close", async () => {
        const imgbbApiKey = await getDecryptedKey("imgbb");
        if (imgbbApiKey) {
          const imagePath = getCurrentImagePath();
          if (!imagePath) return;
          await openImageInLens(imagePath);
        }
      });
    }
  });
}

module.exports = setupLensHandlers;
