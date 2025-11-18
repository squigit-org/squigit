const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'linux') {
    process.env.GTK_IM_MODULE = 'xim';
}

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: "SpatialShot",
    show: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  if (isDev) {
      console.log("Running in Development Mode");
      win.loadURL('http://localhost:5173').catch(() => {
        console.log("Vite dev server not found. Falling back to dist/index.html");
        const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
        win.loadFile(indexPath);
      });
      win.once('ready-to-show', () => {
        win.show();
      });
  } else {
      console.log("Running in Production Mode");
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      win.loadFile(indexPath).catch(err => {
          console.error("Failed to load index.html:", err);
      });
      win.once('ready-to-show', () => {
        win.show();
      });
  }
}

app.whenReady().then(() => {
  try {
    const args = process.argv || [];
    let imagePath = null;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (!arg.startsWith('--') && (arg.toLowerCase().endsWith('.png') || arg.toLowerCase().endsWith('.jpg') || arg.toLowerCase().endsWith('.jpeg') || arg.toLowerCase().endsWith('.webp'))) {
        if (fs.existsSync(arg)) {
          imagePath = arg;
          break;
        }
      }
    }

    if (!imagePath) {
      console.error('Missing or invalid startup image argument. Usage: spatialshot <image-file.(png|jpg|jpeg|webp)>');
      app.exit(1);
      return;
    }
  } catch (err) {
    console.error('Failed to validate startup args:', err);
    app.exit(1);
    return;
  }
  ipcMain.handle('get-api-key', async () => {
    try {
        const possiblePaths = [
            path.join(app.getAppPath(), 'config.private.json'),
            path.join(process.cwd(), 'config.private.json'),
            path.join(process.resourcesPath, 'config.private.json'),
            path.join(__dirname, '..', 'config.private.json')
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                console.log(`Loading config from: ${p}`);
                const rawData = fs.readFileSync(p, 'utf8');
                const config = JSON.parse(rawData);
                return config.google_gemini?.api_key || '';
            }
        }
        console.error('config.private.json not found.');
        return '';
    } catch (error) {
        console.error('Error reading config:', error);
        return '';
    }
  });

  ipcMain.handle('get-startup-image', async () => {
    try {
        const args = process.argv;
        let imagePath = null;

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (!arg.startsWith('--') && 
               (arg.toLowerCase().endsWith('.png') || 
                arg.toLowerCase().endsWith('.jpg') || 
                arg.toLowerCase().endsWith('.jpeg') || 
                arg.toLowerCase().endsWith('.webp'))) {
                
                if (fs.existsSync(arg)) {
                    imagePath = arg;
                    break;
                }
            }
        }

        if (imagePath) {
            console.log(`Loading startup image: ${imagePath}`);
            const fileBuffer = fs.readFileSync(imagePath);
            const base64 = fileBuffer.toString('base64');
            const ext = path.extname(imagePath).toLowerCase().replace('.', '');
            let mimeType = 'image/jpeg';
            if (ext === 'png') mimeType = 'image/png';
            if (ext === 'webp') mimeType = 'image/webp';
            
            return {
                base64,
                mimeType
            };
        }
        return null;
    } catch (error) {
        console.error("Error loading startup image:", error);
        return null;
    }
  });

  ipcMain.handle('exit-app', async (event, code = 0) => {
    try {
      const exitCode = Number(code) || 0;
      console.log(`Renderer requested exit with code: ${exitCode}`);
      setTimeout(() => {
        app.exit(exitCode);
      }, 50);
      return true;
    } catch (err) {
      console.error('Failed to exit app from renderer:', err);
      return false;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
