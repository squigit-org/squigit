import { app, BrowserWindow, shell, session, protocol } from "electron";
import path from "path";
import { setupIpc } from "./ipc";
import { registerProtocols } from "./protocol";

const originalUserData = app.getPath("userData");
app.setPath("userData", path.join(originalUserData, "chromuim"));

protocol.registerSchemesAsPrivileged([
  {
    scheme: "squigit-asset",
    privileges: {
      standard: false,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

if (isDev) {
  process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    transparent: true,
    frame: false,
  });

  mainWindow.webContents.on("did-start-navigation", () => {
    // Polyfill Uint8Array.prototype.toHex/fromHex for pdfjs-dist v5.x
    // Electron 33 ships Chromium ~130, but these APIs landed in Chrome 133.
    // Must run in the main world (not preload's isolated context).
    mainWindow?.webContents
      .executeJavaScript(
        `
      if (typeof Uint8Array.prototype.toHex !== 'function') {
        Uint8Array.prototype.toHex = function() {
          let h = '';
          for (let i = 0; i < this.length; i++) h += this[i].toString(16).padStart(2, '0');
          return h;
        };
      }
      if (typeof Uint8Array.fromHex !== 'function') {
        Uint8Array.fromHex = function(s) {
          const b = new Uint8Array(s.length / 2);
          for (let i = 0; i < s.length; i += 2) b[i/2] = parseInt(s.substring(i, i+2), 16);
          return b;
        };
      }
    `,
      )
      .catch(() => {});
  });

  if (isDev) {
    const devServerUrl =
      process.env.VITE_DEV_SERVER_URL || "http://localhost:1420";
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // In production, the renderer files are in apps/renderer/dist
    // Note: In an actual packed electron app, we would point to the bundled resources.
    const rendererHtml = path.join(__dirname, "../../renderer/dist/index.html");
    await mainWindow.loadFile(rendererHtml);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("context-menu", (_, params) => {
    if (params.y <= 46) {
      mainWindow?.webContents.send("show-titlebar-context-menu", {
        x: params.x,
        y: params.y,
      });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": isDev
          ? [
              "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http: https: squigit-asset:; connect-src 'self' ws: http: https: data: blob: squigit-asset:; img-src 'self' data: blob: https: squigit-asset:; media-src 'self' data: blob: squigit-asset:; style-src 'self' 'unsafe-inline'; font-src 'self' data:",
            ]
          : [
              "default-src 'self' squigit-asset:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com squigit-asset:; img-src 'self' data: blob: https: squigit-asset:; media-src 'self' data: blob: squigit-asset:; font-src 'self' data:",
            ],
      },
    });
  });

  registerProtocols();
  setupIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
