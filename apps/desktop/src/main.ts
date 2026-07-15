import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import { app, BrowserWindow, shell, session, protocol } from "electron";
import path from "path";
import { setupIpc } from "./ipc";
import { addon } from "./ipc/system/addon";
import { registerProtocols } from "./protocol";

const originalUserData = app.getPath("userData");
app.setPath("userData", path.join(originalUserData, "chromium"));

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
const primaryOAuthScheme = "org.squigit.app";
const clientIdOAuthSchemePrefix = "com.googleusercontent.apps.";
const oauthCallbackPath = "/oauth2redirect/google";
let authStatusUrl = "https://squigit-org.github.io/login/popup-google-auth/";
const pendingOAuthCallbacks: string[] = [];
let isHandlingOAuthCallback = false;

if (isDev) {
  process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
}

function statusPageUrl(fragment: "complete" | "invalid" | "unavailable") {
  const url = new URL(authStatusUrl);
  url.hash = fragment;
  return url.toString();
}

async function openOAuthStatusPage(
  fragment: "complete" | "invalid" | "unavailable",
) {
  if (process.env.SQUIGIT_OPEN_OAUTH_STATUS_PAGE !== "1") {
    return;
  }
  await shell.openExternal(statusPageUrl(fragment));
}

function isOAuthCallbackUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const scheme = url.protocol.replace(/:$/, "");
    return (
      (scheme === primaryOAuthScheme ||
        scheme.startsWith(clientIdOAuthSchemePrefix)) &&
      url.pathname === oauthCallbackPath
    );
  } catch {
    return false;
  }
}

function findOAuthCallbackUrl(values: readonly string[]) {
  return values.find((value) => isOAuthCallbackUrl(value));
}

function googleAuthProtocolSchemes() {
  const schemes = new Set<string>([primaryOAuthScheme]);
  const getSchemes = addon.get_google_auth_callback_schemes;
  if (typeof getSchemes === "function") {
    try {
      const nativeSchemes = getSchemes();
      if (Array.isArray(nativeSchemes)) {
        for (const scheme of nativeSchemes) {
          if (typeof scheme === "string" && scheme.trim()) {
            schemes.add(scheme.trim());
          }
        }
      }
    } catch (error) {
      console.warn("Could not load Google auth callback schemes:", error);
    }
  }
  return [...schemes];
}

function refreshAuthStatusUrl() {
  const getStatusUrl = addon.get_google_auth_status_url;
  if (typeof getStatusUrl !== "function") {
    return;
  }

  try {
    const nativeStatusUrl = getStatusUrl();
    if (typeof nativeStatusUrl === "string" && nativeStatusUrl.trim()) {
      authStatusUrl = nativeStatusUrl.trim();
    }
  } catch (error) {
    console.warn("Could not load Google auth status URL:", error);
  }
}

function protocolLaunchArgs() {
  const maybeDefaultApp = process as NodeJS.Process & { defaultApp?: boolean };
  if (!app.isPackaged) {
    return ["--no-sandbox", app.getAppPath()];
  }
  if (maybeDefaultApp.defaultApp && process.argv.length >= 2) {
    return [path.resolve(process.argv[1])];
  }
  return [];
}

function desktopExecQuote(value: string) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function runDetached(command: string, args: string[]) {
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Optional desktop integration command is not available.
  }
}

function registerLinuxOAuthProtocolClient(
  schemes: readonly string[],
  appArgs: readonly string[],
) {
  if (process.platform !== "linux") {
    return;
  }

  try {
    const applicationsDir = path.join(
      os.homedir(),
      ".local",
      "share",
      "applications",
    );
    const desktopFileName = "squigit-oauth.desktop";
    const desktopFilePath = path.join(applicationsDir, desktopFileName);
    const mimeTypes = schemes.map((scheme) => `x-scheme-handler/${scheme}`);
    const execParts = [
      desktopExecQuote(process.execPath),
      ...appArgs.map(desktopExecQuote),
      "%u",
    ];
    const desktopFile = [
      "[Desktop Entry]",
      "Type=Application",
      "Name=Squigit",
      `Exec=${execParts.join(" ")}`,
      "Terminal=false",
      "NoDisplay=true",
      "Categories=Utility;",
      `MimeType=${mimeTypes.join(";")};`,
      "",
    ].join("\n");

    fs.mkdirSync(applicationsDir, { recursive: true });
    fs.writeFileSync(desktopFilePath, desktopFile);

    for (const scheme of schemes) {
      runDetached("xdg-mime", [
        "default",
        desktopFileName,
        `x-scheme-handler/${scheme}`,
      ]);
    }
    runDetached("update-desktop-database", [applicationsDir]);
  } catch (error) {
    console.warn("Could not register Linux OAuth protocol handlers:", error);
  }
}

function registerOAuthProtocolClient() {
  const schemes = googleAuthProtocolSchemes();
  const appArgs = protocolLaunchArgs();
  for (const scheme of schemes) {
    if (appArgs.length > 0) {
      app.setAsDefaultProtocolClient(scheme, process.execPath, [...appArgs]);
    } else {
      app.setAsDefaultProtocolClient(scheme);
    }
  }
  registerLinuxOAuthProtocolClient(schemes, appArgs);
}

async function focusMainWindow() {
  if (!mainWindow && app.isReady()) {
    await createWindow();
  }
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

async function completeOAuthCallback(rawUrl: string) {
  await focusMainWindow();

  const completeCallback = addon.complete_google_auth_callback;
  if (typeof completeCallback !== "function") {
    console.error("Missing napi-bridge export 'complete_google_auth_callback'.");
    await openOAuthStatusPage("unavailable");
    return;
  }

  try {
    await completeCallback(rawUrl);
    await openOAuthStatusPage("complete");
  } catch (error) {
    console.error("Google auth callback failed:", error);
    await openOAuthStatusPage("invalid");
  }
}

async function drainOAuthCallbacks() {
  if (isHandlingOAuthCallback) return;
  isHandlingOAuthCallback = true;
  try {
    while (pendingOAuthCallbacks.length > 0) {
      const rawUrl = pendingOAuthCallbacks.shift();
      if (rawUrl) {
        await completeOAuthCallback(rawUrl);
      }
    }
  } finally {
    isHandlingOAuthCallback = false;
  }
}

function enqueueOAuthCallback(rawUrl: string) {
  if (!isOAuthCallbackUrl(rawUrl)) {
    return false;
  }
  pendingOAuthCallbacks.push(rawUrl);
  if (app.isReady()) {
    void drainOAuthCallbacks();
  }
  return true;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, commandLine) => {
  const callbackUrl = findOAuthCallbackUrl(commandLine);
  if (callbackUrl) {
    enqueueOAuthCallback(callbackUrl);
  } else {
    void focusMainWindow();
  }
});

app.on("open-url", (event, rawUrl) => {
  event.preventDefault();
  enqueueOAuthCallback(rawUrl);
});

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

app.whenReady().then(async () => {
  refreshAuthStatusUrl();
  registerOAuthProtocolClient();

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
  await createWindow();

  const initialCallbackUrl = findOAuthCallbackUrl(process.argv);
  if (initialCallbackUrl) {
    enqueueOAuthCallback(initialCallbackUrl);
  }
  await drainOAuthCallbacks();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
