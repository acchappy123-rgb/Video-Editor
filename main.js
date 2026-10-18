'use strict';
// Electron entry point for the desktop app (Windows, macOS, Linux).
const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 500,
    title: 'Atelier',
    backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Open external links in the user's browser; never navigate the app window away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // about:blank is used for the print preview window
    return { action: url === 'about:blank' || url === '' ? 'allow' : 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    }
  });
  // The page cancels unload while a save is pending or failing; Electron shows no prompt of its own and would just keep the window open.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Leave', 'Stay'], defaultId: 1, cancelId: 1, message: 'Your latest changes may not be saved yet.', detail: 'Leave anyway, or stay a moment while Atelier finishes saving.' });
    if (choice === 0) e.preventDefault();
  });
}

// Only camera/microphone (for recording presentations), fullscreen, clipboard and
// notifications are ever granted.
function setupPermissions() {
  const allowed = new Set(['media', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
}

const template = [
  ...(isMac ? [{ role: 'appMenu' }] : []),
  { role: 'fileMenu' },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
  },
  { role: 'windowMenu' },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  setupPermissions();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
