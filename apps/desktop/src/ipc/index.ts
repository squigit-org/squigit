import { registerThreadHandlers } from "./features/thread";
import { registerMediaHandlers } from "./features/media";
import { registerProfileHandlers } from "./features/profiles";
import { registerStorageHandlers } from "./features/storage";
import { registerAppHandlers } from "./system/app";
import { registerFilesystemHandlers } from "./system/filesystem";
import { registerIdentityHandlers } from "./features/identity";

export function setupIpc() {
  registerProfileHandlers();
  registerStorageHandlers();
  registerThreadHandlers();
  registerMediaHandlers();
  registerFilesystemHandlers();
  registerAppHandlers();
  registerIdentityHandlers();
}
