/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

const { contextBridge, clipboard, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  copyText: (text) => {
    try {
      clipboard.writeText(String(text));
      return true;
    } catch (e) {
      console.error('Failed to copy text:', e);
      return false;
    }
  },

  copyImage: (imagePath) => {
    try {
      return ipcRenderer.invoke('copy-image', imagePath);
    } catch (e) {
      console.error('Failed to copy image:', e);
      return false;
    }
  },

  minimize: () => {
    try {
      ipcRenderer.send('minimize-window');
      return true;
    } catch (e) {
      console.error('Failed to minimize window:', e);
      return false;
    }
  },

  maximize: () => {
    try {
      ipcRenderer.send('maximize-window');
      return true;
    } catch (e) {
      console.error('Failed to maximize window:', e);
      return false;
    }
  },

  getImagePath: () => {
    try {
      return ipcRenderer.sendSync('get-image-path');
    } catch (e) {
      console.error('Failed to get image path:', e);
      return null;
    }
  },

  onImagePathUpdate: (callback) => {
    try {
      ipcRenderer.on('image-path-updated', (event, path) => callback(path));
      return true;
    } catch (e) {
      console.error('Failed to set image path update listener:', e);
      return false;
    }
  },

  clearWebviewCache: (partition) => {
    try {
      return ipcRenderer.invoke('clear-webview-cache', partition);
    } catch (e) {
      console.error('Failed to clear webview cache:', e);
      return false;
    }
  },

  clearCache: () => {
    try {
      return ipcRenderer.invoke('clear-cache');
    } catch (e) {
      console.error('Failed to clear cache:', e);
      return false;
    }
  },

  removeAllListeners: (channel) => {
    try {
      ipcRenderer.removeAllListeners(channel);
      return true;
    } catch (e) {
      console.error('Failed to remove all listeners:', e);
      return false;
    }
  },

  startAuth: () => {
    try {
      ipcRenderer.send('start-auth');
      return true;
    } catch (e) {
      console.error('Failed to start auth:', e);
      return false;
    }
  },

  onAuthResult: (cb) => {
    try {
      ipcRenderer.on('auth-result', (event, data) => {
        cb(data);
      });
      return true;
    } catch (e) {
      console.error('Failed to set auth result listener:', e);
      return false;
    }
  },

  getUserData: () => {
    try {
      return ipcRenderer.invoke('get-user-data');
    } catch (e) {
      console.error('Failed to get user data:', e);
      return null;
    }
  },

  verifyUserStatus: (email) => {
    try {
      return ipcRenderer.invoke('verify-user-status', email);
    } catch (e) {
      console.error('Failed to verify user status:', e);
      throw e;
    }
  },

  saveUserData: (data) => {
    try {
      ipcRenderer.send('save-user-data', data);
    } catch (e) {
      console.error('Failed to save user data:', e);
    }
  },

  logout: () => {
    try {
      ipcRenderer.send('logout');
    } catch (e) {
      console.error('Failed to logout:', e);
    }
  },

  deleteAccount: (email) => {
    try {
      return ipcRenderer.invoke('delete-account', email);
    } catch (e) {
      console.error('Failed to delete account:', e);
      throw e;
    }
  },

  openExternal: (url) => {
    try {
      ipcRenderer.send('open-external', url);
    } catch (e) {
      console.error('Failed to open external link:', e);
    }
  }
});
