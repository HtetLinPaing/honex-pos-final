// main.js (electron entry)
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    // ✅ Development mode
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    // ✅ Production mode
    const indexPath = path.join(process.resourcesPath, "app.asar.unpacked", "dist", "index.html");
    const fallbackPath = path.join(__dirname, "dist", "index.html");

    // File check
    const fileToLoad = fs.existsSync(indexPath) ? indexPath : fallbackPath;

    win.loadFile(fileToLoad).catch((err) => {
      console.error("Failed to load index.html:", err);
    });
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
