import { registerThreadHandlers } from "./features/thread";
import { registerHarnessHandlers } from "./features/harness";
import { registerMediaHandlers } from "./features/media";
import { registerProfileHandlers } from "./features/profiles";
import { registerStorageHandlers } from "./features/storage";
import { registerAppHandlers } from "./system/app";
import { registerFilesystemHandlers } from "./system/filesystem";

export function setupIpc() {
  registerProfileHandlers();
  registerStorageHandlers();
  registerHarnessHandlers();
  registerThreadHandlers();
  registerMediaHandlers();
  registerFilesystemHandlers();
  registerAppHandlers();
}
