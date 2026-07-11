import { ipcMain } from "electron";
import { addon } from "../system/addon";

export function registerProfileHandlers() {
  // Profile commands
  ipcMain.handle("get_active_profile_id", () => addon.getActiveProfileId?.());
  ipcMain.handle("get_store_base_dir", () => addon.getStoreBaseDir?.());
  ipcMain.handle("set_active_profile", (_, args) =>
    addon.setActiveProfile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("clear_active_profile", () => addon.clearActiveProfile?.());
  ipcMain.handle("list_profiles", () => addon.listProfiles?.());
  ipcMain.handle("get_profile", (_, args) =>
    addon.getProfile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("delete_profile", (_, args) =>
    addon.deleteProfile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("has_profiles", () => addon.hasProfiles?.());
  ipcMain.handle("start_google_auth", () => addon.startGoogleAuth?.());
  ipcMain.handle("cancel_google_auth", () => addon.cancelGoogleAuth?.());
  ipcMain.handle("save_api_key", (_, args) =>
    addon.saveApiKey?.(
      args.profileId || args.profile_id,
      args.provider,
      args.key,
    ),
  );
  ipcMain.handle("get_api_key", (_, args) =>
    addon.getApiKey?.(args.profileId || args.profile_id, args.provider),
  );

  ipcMain.handle("logout", () => addon.clearActiveProfile?.());
  ipcMain.handle("hydrate_avatar", (_, args) =>
    addon.hydrateAvatar?.(args.url, args.profileId || args.profile_id),
  );
  ipcMain.handle("encrypt_and_save", (_, args) =>
    addon.saveApiKey?.(
      args.profileId || args.profile_id,
      args.provider,
      args.plaintext,
    ),
  );
  ipcMain.handle("get_profile_count", () => addon.profileCount?.());

  ipcMain.handle("get_active_profile", () => {
    try {
      const id = addon.getActiveProfileId?.();
      if (id) return addon.getProfile?.(id) || null;
    } catch {}
    return null;
  });
}
