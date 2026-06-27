/// <reference lib="dom" />
import { exposeElectronApi } from './preload/bridge';
import { preventWindowFileDrops } from './preload/file-drop';

preventWindowFileDrops();
exposeElectronApi();
