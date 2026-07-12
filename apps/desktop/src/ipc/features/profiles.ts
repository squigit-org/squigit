import { ipcMain } from "electron";
import { addon } from "../system/addon";

export function registerProfileHandlers() {
  ipcMain.handle("get_active_profile_id", () => addon.get_active_profile_id?.());
  ipcMain.handle("set_active_profile", (_, args) =>
    addon.set_active_profile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("list_profiles", () => addon.list_profiles?.());
  ipcMain.handle("get_profile_snapshot", () => addon.get_profile_snapshot?.());
  ipcMain.handle("get_profile", (_, args) =>
    addon.get_profile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("delete_profile", (_, args) =>
    addon.delete_profile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("has_profiles", () => addon.has_profiles?.());
  ipcMain.handle("start_google_auth", () => addon.start_google_auth?.());
  ipcMain.handle("cancel_google_auth", () => addon.cancel_google_auth?.());
  ipcMain.handle("get_api_key", (_, args) =>
    addon.get_api_key?.(args.profileId || args.profile_id, args.provider),
  );

  ipcMain.handle("logout", () => addon.clear_active_profile?.());
  ipcMain.handle("hydrate_avatar", (_, args) =>
    addon.hydrate_avatar?.(args.url, args.profileId || args.profile_id),
  );
  ipcMain.handle("encrypt_and_save", (_, args) =>
    addon.encrypt_and_save_api_key?.(
      args.profileId || args.profile_id,
      args.provider,
      args.plaintext,
    ),
  );
  ipcMain.handle("get_profile_count", () => addon.profile_count?.());

  ipcMain.handle("get_active_profile", () => addon.get_active_profile?.() || null);
}
