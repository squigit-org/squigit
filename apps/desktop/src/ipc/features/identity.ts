import { ipcMain } from "electron";
import { addon } from "../system/addon";

export function registerIdentityHandlers() {
  ipcMain.handle("get_identity_config", () => {
    return addon.getIdentityConfig?.();
  });

  ipcMain.handle("set_identity_prompt", (_, args) => {
    return addon.setIdentityPrompt?.(args.prompt);
  });

  ipcMain.handle("set_identity_soul", (_, args) => {
    return addon.setIdentitySoul?.(args.name, args.markdown);
  });

  ipcMain.handle("remove_identity_soul", () => {
    return addon.removeIdentitySoul?.();
  });
}
