const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onImagePath: (callback) => ipcRenderer.on('image-path', (event, path) => callback(path)),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  sendImagePath: (path) => ipcRenderer.send('image-path', path),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window')
});
