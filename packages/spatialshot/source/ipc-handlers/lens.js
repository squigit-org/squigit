/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { shell } = require("electron");
const fs = require("fs");
const axios = require("axios");
const { IMGBB_API_KEY } = require("../config");

async function openImageInLens(localImagePath) {
  try {
    const image = fs.readFileSync(localImagePath, { encoding: "base64" });

    const formData = new URLSearchParams();
    formData.append("image", image);

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
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
    const imagePath = getCurrentImagePath();
    if (!imagePath) {
      console.error("No image path found in main process");
      return;
    }
    await openImageInLens(imagePath);
  });
}

module.exports = setupLensHandlers;
