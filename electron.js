const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater'); // ✅ auto-updater import
const log = require('electron-log'); // optional (for debugging logs)

// optional but useful for debugging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public', 'Fire4.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // ✅ Check for updates when window ready
  win.webContents.on('did-finish-load', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}

// When app ready
app.whenReady().then(() => {
  createWindow();

  // macOS compatibility
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows closed (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Optional — listen for updater events
autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded. Will install now...');
  autoUpdater.quitAndInstall();
});
