const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const EDUCA_URL = 'https://educagestionescolar.study/';
const EDUCA_ORIGIN = new URL(EDUCA_URL).origin;

function showOfflinePage(window) {
  window.loadFile(path.join(__dirname, 'offline.html'));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 360,
    minHeight: 560,
    show: false,
    title: 'EDUCA | Gestión Escolar',
    backgroundColor: '#f3f7f8',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:') shell.openExternal(target.toString());
    } catch (_) {}
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== EDUCA_ORIGIN) event.preventDefault();
    } catch (_) {
      event.preventDefault();
    }
  });

  window.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) showOfflinePage(window);
  });

  window.loadURL(EDUCA_URL).catch(() => showOfflinePage(window));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
