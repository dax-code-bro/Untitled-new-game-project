import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;
const WEB_URL = isDev ? "http://localhost:3000" : `file://${path.join(__dirname, "../../web/dist/index.html")}`;

function startApiServer() {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  apiProcess = spawn(pythonCmd, ["-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"], {
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env },
  });

  apiProcess.stdout?.on("data", (d) => console.log("[Legend API]", d.toString()));
  apiProcess.stderr?.on("data", (d) => console.error("[Legend API]", d.toString()));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#000000",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
    icon: path.join(__dirname, "../../assets/branding/legend-icon.png"),
  });

  mainWindow.loadURL(WEB_URL);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startApiServer();
  // Wait briefly for API to start
  setTimeout(createWindow, 1500);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    apiProcess?.kill();
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

app.on("before-quit", () => {
  apiProcess?.kill();
});

ipcMain.handle("get-version", () => app.getVersion());
