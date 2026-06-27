import { registerChatHandlers } from "./features/chat";
import { registerMediaHandlers } from "./features/media";
import { registerProfileHandlers } from "./features/profiles";
import { registerStorageHandlers } from "./features/storage";
import { registerAppHandlers } from "./system/app";
import { registerFilesystemHandlers } from "./system/filesystem";

export function setupIpc() {
  registerProfileHandlers();
  registerStorageHandlers();
  registerChatHandlers();
  registerMediaHandlers();
  registerFilesystemHandlers();
  registerAppHandlers();
}
