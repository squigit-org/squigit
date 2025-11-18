const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  getStartupImage: () => ipcRenderer.invoke('get-startup-image'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  exitApp: (code) => ipcRenderer.invoke('exit-app', code),
});