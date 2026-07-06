import { ipcMain } from "electron";
import { addon } from "./addon";

export function registerAppHandlers() {
  // App commands
  ipcMain.handle("app:getVersion", () => require("electron").app.getVersion());
  ipcMain.handle("app:getRuntimeVersion", () => process.versions.electron);
  ipcMain.handle("app:exit", (_, args) =>
    require("electron").app.exit(args?.code || 0),
  );
  ipcMain.handle("app:relaunch", () => {
    require("electron").app.relaunch();
    require("electron").app.exit(0);
  });

  // Shims for missing Tauri handlers
  ipcMain.handle("get_linux_package_manager", () => "apt");
  ipcMain.handle("get_machine_info", () => addon.getMachineInfo?.());
  ipcMain.handle("set_background_color", () => {});
  ipcMain.handle("get_app_constants", () => ({
    appVersion: require("electron").app.getVersion(),
  }));
  ipcMain.handle("get_system_theme", () => "dark");
  ipcMain.handle("run_sidecar_version", (_, args) => addon.runSidecarVersion?.(args.command));
  ipcMain.handle("updater:check", () => null);
  ipcMain.handle("get_initial_image", () => null);
  ipcMain.handle("get_wizard_state", async () => {
    try {
      const fs = require("fs/promises");
      const path = require("path");
      const { app } = require("electron");
      const userData = app.getPath("userData");
      const data = await fs.readFile(
        path.join(userData, ".squigit-wizard-state.json"),
        "utf-8",
      );
      return JSON.parse(data);
    } catch {
      const defaultState = {
        step: 0,
        isFinished: false,
        data: {
          step_3: { theme: "dark", captureType: "traditional", ocrEnabled: true, autoExpandOCR: true },
          step_4: { agreed: false },
        },
      };
      try {
        const fs = require("fs/promises");
        const path = require("path");
        const { app } = require("electron");
        const userData = app.getPath("userData");
        await fs.writeFile(
          path.join(userData, ".squigit-wizard-state.json"),
          JSON.stringify(defaultState, null, 2),
          "utf-8",
        );
      } catch (err) {
        console.error("Failed to pre-create .squigit-wizard-state.json", err);
      }
      return defaultState;
    }
  });
  ipcMain.handle("set_wizard_state", async (_, state) => {
    const fs = require("fs/promises");
    const path = require("path");
    const { app } = require("electron");
    const userData = app.getPath("userData");
    await fs.writeFile(
      path.join(userData, ".squigit-wizard-state.json"),
      JSON.stringify(state),
    );
  });

  // Window commands
  ipcMain.handle("close_window", () =>
    require("electron").BrowserWindow.getFocusedWindow()?.close(),
  );
  ipcMain.handle("minimize_window", () =>
    require("electron").BrowserWindow.getFocusedWindow()?.minimize(),
  );
  ipcMain.handle("maximize_window", () => {
    const win = require("electron").BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.handle("set_always_on_top", (_, args) =>
    require("electron")
      .BrowserWindow.getFocusedWindow()
      ?.setAlwaysOnTop(args.state),
  );
  ipcMain.handle("window:startDragging", () => {});
  // UI dialog audio
  ipcMain.handle("play_ui_sound", (_, args) => addon.playUiSound?.(args.effect));
}
