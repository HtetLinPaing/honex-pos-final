const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// 🧩 Logger setup
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // ✅ Check for updates when loaded
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Checking for updates...');
    autoUpdater.checkForUpdatesAndNotify();
  });
}

// 🟢 App ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 🔴 Close app when all windows closed (Windows)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 🟣 Optional — updater events for user feedback
autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `POS System v${info.version} is available.\nIt will be downloaded automatically in the background.`,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded. Installing now...');
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Update v${info.version} downloaded. The app will now restart to install.`,
    })
    .then(() => {
      autoUpdater.quitAndInstall();
    });
});

autoUpdater.on('error', (err) => {
  log.error('Update error:', err);
});
