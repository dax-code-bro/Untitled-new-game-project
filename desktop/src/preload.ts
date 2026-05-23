import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("legend", {
  getVersion: () => ipcRenderer.invoke("get-version"),
});
