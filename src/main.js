// main.js
const { app, BrowserWindow, autoUpdater, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// 🧠 GitHub Repo Info (must match your electron-builder config)
const server = "https://github.com/HtetLinPaing/honex-pos-final";
const feedURL = `${server}/releases/latest/download`;

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
    // Development mode
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    // Production mode
    const indexPath = path.join(process.resourcesPath, "app.asar.unpacked", "dist", "index.html");
    const fallbackPath = path.join(__dirname, "dist", "index.html");
    const fileToLoad = fs.existsSync(indexPath) ? indexPath : fallbackPath;

    win.loadFile(fileToLoad).catch((err) => {
      console.error("Failed to load index.html:", err);
    });
  }

  // 🟢 Auto Updater (only in production)
  if (!isDev) {
    autoUpdater.setFeedURL({ url: feedURL });

    autoUpdater.on("checking-for-update", () => {
      console.log("Checking for update...");
    });

    autoUpdater.on("update-available", () => {
      console.log("Update available. Downloading...");
    });

    autoUpdater.on("update-not-available", () => {
      console.log("No updates available.");
    });

    autoUpdater.on("error", (err) => {
      console.error("Auto update error:", err);
    });

    autoUpdater.on("update-downloaded", () => {
      const dialogOpts = {
        type: "info",
        buttons: ["Restart", "Later"],
        title: "Update Ready",
        message: "A new version has been downloaded.",
        detail: "Restart the app to apply updates.",
      };
      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
      });
    });

    // 🔁 Check for updates automatically
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 5000);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
