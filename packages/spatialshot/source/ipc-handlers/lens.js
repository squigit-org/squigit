const { shell } = require("electron");
const express = require("express");
const localtunnel = require("localtunnel");

async function openImageInLens(localImagePath) {
  const app = express();
  const server = app.listen(0);
  const { port } = server.address();

  app.get("/image.png", (req, res) => {
    res.sendFile(localImagePath);
  });

  const tunnel = await localtunnel({ port });

  const encodedUrl = encodeURIComponent(`${tunnel.url}/image.png`);
  const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodedUrl}&ep=subb&re=df&s=4&hl=en&gl=US`;
  await shell.openExternal(lensUrl);

  setTimeout(() => {
    tunnel.close();
    server.close();
  }, 30000);
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
