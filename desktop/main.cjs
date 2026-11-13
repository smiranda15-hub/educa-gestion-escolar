const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const EDUCA_URL = 'https://educagestionescolar.study/';
const EDUCA_ORIGIN = new URL(EDUCA_URL).origin;

function showOfflinePage(window) {
  window.loadFile(path.join(__dirname, 'offline.html'));
}

function getDownloadFolder(filename) {
  const root = path.join(app.getPath('documents'), 'EDUCA');
  const normalized = String(filename || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/respaldo|backup|copia-de-seguridad/.test(normalized)) return path.join(root, 'Respaldos');
  if (/boletin|certificado|constancia|matricula|informe|reporte|\.csv$/.test(normalized)) return path.join(root, 'Informes y documentos');
  return path.join(root, 'Descargas');
}

function uniqueDownloadPath(folder, filename) {
  const safeName = path.basename(filename || 'archivo').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  const extension = path.extname(safeName);
  const stem = path.basename(safeName, extension) || 'archivo';
  let candidate = path.join(folder, safeName);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(folder, `${stem} (${suffix++})${extension}`);
  }
  return candidate;
}

function configureDownloads(window) {
  window.webContents.session.on('will-download', (event, item) => {
    const folder = getDownloadFolder(item.getFilename());
    try {
      fs.mkdirSync(folder, { recursive: true });
      item.setSavePath(uniqueDownloadPath(folder, item.getFilename()));
    } catch (error) {
      console.error('No se pudo preparar la carpeta local de descargas de EDUCA:', error.message);
    }
  });
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
  configureDownloads(window);
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
