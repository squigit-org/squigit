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
      const lensParams = new URLSearchParams();
      lensParams.append("url", response.data.data.url);
      lensParams.append("ep", "subb");
      lensParams.append("re", "df");
      lensParams.append("s", "4");
      lensParams.append("hl", "en");
      lensParams.append("gl", "US");

      const finalLensUrl = `https://lens.google.com/uploadbyurl?${lensParams.toString()}`;
      
      console.log(`Opening Lens: ${finalLensUrl}`);
      await shell.openExternal(finalLensUrl);
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
    
    const imagePath = getCurrentImagePath();
    if (!imagePath && imgbbApiKey) {
        console.error("Triggered Lens search but no image path available.");
        return;
    }

    if (imgbbApiKey) {
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
        icon: path.join(app.getAppPath(), "assets", "icons", "light", "128.png"), 
        webPreferences: {
          preload: path.join(app.getAppPath(), "preload.js"), 
        },
      });

      win.loadFile(
        path.join(
          app.getAppPath(),
          "renderer",
          "login",
          "index.html"
        ),
        { query: { mode: "imgbb" } }
      );

      win.on("close", async () => {
        const newKey = await getDecryptedKey("imgbb");
        if (newKey) {
          const currentPath = getCurrentImagePath();
          if (currentPath) {
            await openImageInLens(currentPath);
          }
        }
      });
    }
  });
}

module.exports = setupLensHandlers;
