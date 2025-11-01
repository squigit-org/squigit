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

const { app, BrowserWindow, ipcMain, nativeImage, clipboard, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const userDataManager = require('./shared/user-data');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow = null;
let currentImagePath = null;

function getImagePathFromArgs() {
  const args = process.argv.slice(1); 
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') && 
        !args[i].includes('electron') && 
        (args[i].endsWith('.png') || args[i].endsWith('.jpg') || args[i].endsWith('.jpeg'))) {
      return args[i];
    }
  }
  return null;
}

try {
  app.setAppUserModelId('com.a7md.spatialshot');
} catch (e) { }

let win;

function createWindow() {
  win = new BrowserWindow({
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      webviewTag: true
    }
  });

  win.maximize();
  win.show();
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, 'renderer/index.html'));

  win.once('ready-to-show', () => {
    try {
      win.center();
      win.show();
      win.focus();
      
      
      if (currentImagePath) {
        const image = nativeImage.createFromPath(currentImagePath);
        clipboard.writeImage(image);
        win.webContents.send('image-path-updated', currentImagePath);
      }
    } catch (e) { }
  });

  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
  });

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

ipcMain.on('minimize-window', () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  } catch (e) {
    console.warn('Failed to minimize window:', e && e.message);
  }
});

ipcMain.on('maximize-window', () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  } catch (e) {
    console.warn('Failed to maximize/unmaximize window:', e && e.message);
  }
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('get-image-path', (event) => {
  event.returnValue = currentImagePath;
});

ipcMain.handle('copy-image', async (event, imagePath) => {
  try {
    if (!fs.existsSync(imagePath)) {
      console.error('Image file does not exist:', imagePath);
      return false;
    }
    const stats = fs.statSync(imagePath);
    if (!stats.isFile()) {
      console.error('Path is not a file:', imagePath);
      return false;
    }
    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) {
      console.error('Failed to create image from path:', imagePath);
      return false;
    }
    clipboard.writeImage(image);
    return true;
  } catch (error) {
    console.error('Error in copy-image handler:', error);
    return false;
  }
});

ipcMain.handle('clear-webview-cache', async (event, partition) => {
  if (!partition) return false;
  try {
    const webviewSession = session.fromPartition(partition);
    if (webviewSession) {
      await webviewSession.clearCache();
      return true;
    }
  } catch (error) {
    console.error(`Failed to clear cache for partition ${partition}:`, error);
  }
  return false;
});

ipcMain.handle('clear-cache', async () => {
  try {
    const allSessions = session.getAllSessions();
    for (const s of allSessions) {
      await s.clearCache();
    }
    return true;
  } catch (error) {
    console.error('Failed to clear all caches:', error);
    return false;
  }
});

ipcMain.handle('get-user-data', async () => {
  return userDataManager.getUserData();
});

ipcMain.on('logout', () => {
  userDataManager.clearUserData();

  try {
    const logoutWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        partition: 'persist:google'
      }
    });

    logoutWindow.loadURL('https://accounts.google.com/logout');

    logoutWindow.webContents.on('did-finish-load', () => {
        if (logoutWindow && !logoutWindow.isDestroyed()) {
            logoutWindow.close();
        }
    });

  } catch (error) {
    console.error('Failed to execute Google logout:', error);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('logged-out');
  }
});

ipcMain.on('save-user-data', (event, userData) => {
  userDataManager.saveUserData(userData);
});

ipcMain.handle('verify-user-status', async (event, userEmail) => {
  const client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    const db = client.db("spatial-shot-db");
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email: userEmail });

    if (user) {
      return { status: 'VALID', user: { id: user.googleId, name: user.name, email: user.email, photoURL: user.photoURL } };
    } else {
      return { status: 'NOT_FOUND' };
    }
  } catch (error) {
    console.error('Error verifying user status:', error);
    throw error;
  } finally {
    await client.close();
  }
});

ipcMain.handle('delete-account', async (event, userEmail) => {
  const client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    const db = client.db("spatial-shot-db");
    const usersCollection = db.collection("users");
    const result = await usersCollection.deleteOne({ email: userEmail });
    
    if (result.deletedCount === 1) {
      userDataManager.clearUserData();
      return { success: true };
    }
    return { success: false, error: 'User not found' };
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  } finally {
    await client.close();
  }
});

app.whenReady().then(() => {
  currentImagePath = getImagePathFromArgs();
  mainWindow = createWindow();
  const googleSession = session.fromPartition('persist:google');
  googleSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
    callback({ requestHeaders: details.requestHeaders });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', (event, commandLine, workingDirectory) => {
  const newImagePath = getImagePathFromArgs();
  if (newImagePath) {
    currentImagePath = newImagePath;
    if (mainWindow) {
      const image = nativeImage.createFromPath(newImagePath);
      clipboard.writeImage(image);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('image-path-updated', newImagePath);
    }
  }
});

if (process.platform !== 'darwin') {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
}

const http  = require('http');
const urlm  = require('url');
const https = require('https');
const { MongoClient, ServerApiVersion } = require('mongodb');

const config = require('./config.private.json');
const oauth2 = config.google_oauth  || {};
const db     = config.mongodb_atlas || {};
const o2     = {
  id:        oauth2.client_id        || 'YOUR_GOOGLE_CLIENT_ID',
  secret:    oauth2.client_secret    || 'YOUR_GOOGLE_CLIENT_SECRET',
  redirect:  oauth2.redirect_uris[0] || 'http://localhost:3000',
  auth:      oauth2.auth_uri         || 'https://accounts.google.com/o/oauth2/v2/auth',
  token:     oauth2.token_endpoint   || 'https://oauth2.googleapis.com/token',
  scope:     'profile email'
};

const mongoUri = `mongodb+srv://${db.username}:${db.password}@${db.host}/?${db.options}`;

let authServer;

async function insertUserDoc(doc) {
  const client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    const db = client.db("spatial-shot-db");
    const usersCollection = db.collection("users");

    const existingUser = await usersCollection.findOne({ googleId: doc.googleId });

    if (existingUser) {
      // User exists, update them
      const result = await usersCollection.updateOne(
        { googleId: doc.googleId },
        { $set: { name: doc.name, email: doc.email, photoURL: doc.photoURL, lastLogin: new Date() } }
      );
      return { ...result, insertedId: existingUser._id }; // Return a compatible result object
    } else {
      // User does not exist, insert them
      return await usersCollection.insertOne(doc);
    }
  } finally {
    await client.close();
  }
}

function makeUserDocFromOAuth(user) {
  return {
    _id: `google_${user.sub || 'unknown'}_${Date.now()}`,
    googleId: user.sub,
    name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
    email: user.email || '',
    photoURL: user.picture || '',
    lastLogin: new Date(),
    createdAt: new Date()
  };
}

ipcMain.on('start-auth', () => {
  const authUrl =
    `${o2.auth}?client_id=${o2.id}` +
    `&redirect_uri=${encodeURIComponent(o2.redirect)}` +
    `&scope=${encodeURIComponent(o2.scope)}` +
    `&response_type=code` +
    `&access_type=offline&prompt=consent`;

  let authWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    webPreferences: {
      partition: 'persist:google',
      contextIsolation: false,
      nodeIntegration: false
    }
  });

  authWindow.loadURL(authUrl);
  authWindow.show();

  authWindow.on('closed', () => {
    authWindow = null;
  });

  if (!authServer) {
    authServer = http.createServer((req, res) => {
      if (authWindow) {
        authWindow.close();
      }
      const parsedUrl = urlm.parse(req.url, true);
      const code = parsedUrl.query.code;

      if (code) {
        const postData =
          `code=${code}` +
          `&client_id=${o2.id}` +
          `&client_secret=${o2.secret}` +
          `&redirect_uri=${o2.redirect}` +
          `&grant_type=authorization_code`;

        const tokenOptions = {
          hostname: 'oauth2.googleapis.com',
          path: '/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const tokenReq = https.request(tokenOptions, (tokenRes) => {
          let data = '';
          tokenRes.on('data', (chunk) => { data += chunk; });
          tokenRes.on('end', async () => {
            let tokens;
            try {
              tokens = JSON.parse(data);
            } catch (err) {
              console.error('Token parse error', err);
              safeSendAuthResult({ success: false, error: 'Failed to parse token response' });
              res.end('Authentication failed (bad token).');
              return;
            }

            if (tokens.error) {
              console.error('Token error:', tokens.error);
              safeSendAuthResult({ success: false, error: tokens.error.toString() });
              res.end('Authentication failed.');
              return;
            }

            const access_token = tokens.access_token;

            const userOptions = {
              hostname: 'www.googleapis.com',
              path: '/oauth2/v3/userinfo',
              method: 'GET',
              headers: { 'Authorization': `Bearer ${access_token}` }
            };

            const userReq = https.request(userOptions, (userRes) => {
              let userData = '';
              userRes.on('data', (chunk) => { userData += chunk; });
              userRes.on('end', async () => {
                let user;
                try {
                  user = JSON.parse(userData);
                } catch (err) {
                  console.error('User parse error', err);
                  safeSendAuthResult({ success: false, error: 'Failed to parse user info' });
                  res.end('Failed to fetch user info.');
                  return;
                }
                
                try {
                  const doc = makeUserDocFromOAuth(user);
                  const userData = {
                    id: user.sub,
                    name: doc.name,
                    email: doc.email,
                    photoURL: doc.photoURL,
                    refreshToken: tokens.refresh_token
                  };
                  userDataManager.saveUserData(userData);
                  const result = await insertUserDoc({ ...doc, refreshToken: tokens.refresh_token });
                  safeSendAuthResult({ success: true, insertedId: result.insertedId, user: userData });
                } catch (err) {
                  console.error('MongoDB insert or user data save error:', err);
                  safeSendAuthResult({ success: false, error: err.message });
                }

                res.end('All set! You can go back to your app now.');
              });
            });

            userReq.on('error', (err) => {
              console.error('User info error:', err);
              safeSendAuthResult({ success: false, error: err.message });
              res.end('Failed to fetch user info.');
            });

            userReq.end();
          });
        });

        tokenReq.on('error', (err) => {
          console.error('Token request error:', err);
          safeSendAuthResult({ success: false, error: err.message });
          res.end('Failed to exchange code for token.');
        });

        tokenReq.write(postData);
        tokenReq.end();
      } else {
        res.end('No code received.');
      }
    }).listen(3000, () => {
    });

    authServer.on('error', (err) => {
      console.error('Server error:', err);
    });
  }
});

function safeSendAuthResult(payload) {
  try {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('auth-result', payload);
    }
  } catch (e) {
    
    console.error('Failed to send auth-result to renderer', e);
  }
}
