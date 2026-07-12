import { ipcMain } from "electron";

export function registerFilesystemHandlers() {
  // File system and other Electron-specific shims
  // The renderer expects some platform.fs methods
  const fs = require("fs/promises");
  const path = require("path");
  const { app } = require("electron");

  const resolveFsPath = (args: any) => {
    let targetPath = args.path;
    if (args.baseDir === "AppConfig") {
      const configDir = path.join(app.getPath("appData"), "squigit");
      targetPath = path.join(configDir, args.path);
    }
    return targetPath;
  };

  ipcMain.handle("fs:exists", async (_, args) => {
    try {
      await fs.access(resolveFsPath(args));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("fs:readTextFile", async (_, args) => {
    return await fs.readFile(resolveFsPath(args), "utf-8");
  });

  ipcMain.handle("fs:writeTextFile", async (_, args) => {
    await fs.writeFile(resolveFsPath(args), args.content, "utf-8");
  });

  ipcMain.handle("fs:mkdir", async (_, args) => {
    await fs.mkdir(resolveFsPath(args), { recursive: args.recursive });
  });

  ipcMain.handle("fs:removeFile", async (_, args) => {
    try {
      await fs.unlink(resolveFsPath(args));
    } catch {
      // ignore error if file doesn't exist
    }
  });

  ipcMain.handle("reveal_in_file_manager", (_, args) =>
    require("electron").shell.showItemInFolder(args.path),
  );
  ipcMain.handle("open_external_url", (_, args) =>
    require("electron").shell.openExternal(args.url),
  );

  // Dialog
  ipcMain.handle("dialog:open", async (_, options) => {
    const { dialog: electronDialog } = require("electron");
    const filters = (options?.filters || []).map((f: any) => ({
      name: f.name || "Files",
      extensions: f.extensions || ["*"],
    }));
    let defaultPath: string | undefined;
    if (options?.defaultPath) {
      try {
        const knownDirs: Record<string, string> = {
          Documents: app.getPath("documents"),
          Home: app.getPath("home"),
          Desktop: app.getPath("desktop"),
          Downloads: app.getPath("downloads"),
        };
        defaultPath = knownDirs[options.defaultPath] || options.defaultPath;
      } catch {
        // ignore — let the OS pick its own default
      }
    }
    const result = await electronDialog.showOpenDialog({
      properties: options?.multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: filters.length > 0 ? filters : undefined,
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return options?.multiple ? result.filePaths : result.filePaths[0];
  });

  ipcMain.handle("dialog:save", async (_, options) => {
    const { dialog: electronDialog } = require("electron");
    const filters = (options?.filters || []).map((f: any) => ({
      name: f.name || "Files",
      extensions: f.extensions || ["*"],
    }));
    let defaultPath: string | undefined;
    if (options?.defaultPath) {
      try {
        const knownDirs: Record<string, string> = {
          Documents: app.getPath("documents"),
          Home: app.getPath("home"),
          Desktop: app.getPath("desktop"),
          Downloads: app.getPath("downloads"),
        };
        defaultPath = knownDirs[options.defaultPath] || options.defaultPath;
      } catch {
        // ignore
      }
    }
    const result = await electronDialog.showSaveDialog({
      filters: filters.length > 0 ? filters : undefined,
      defaultPath,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle("copy_image_to_path", async (_, args) => {
    const fs = require("fs/promises");
    await fs.copyFile(args.sourcePath, args.targetPath);
  });
}
