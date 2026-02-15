const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("acpDesktop", {
  getSettings: () => ipcRenderer.invoke("acp:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("acp:save-settings", settings),
  start: (config) => ipcRenderer.invoke("acp:start", config),
  stop: () => ipcRenderer.invoke("acp:stop"),
  initialize: (params) => ipcRenderer.invoke("acp:initialize", params),
  newSession: (params) => ipcRenderer.invoke("acp:new-session", params),
  loadSession: (params) => ipcRenderer.invoke("acp:load-session", params),
  prompt: (params) => ipcRenderer.invoke("acp:prompt", params),
  cancel: (params) => ipcRenderer.invoke("acp:cancel", params),
  setMode: (params) => ipcRenderer.invoke("acp:set-mode", params),
  respondPermission: (requestId, outcome) =>
    ipcRenderer.invoke("acp:respond-permission", requestId, outcome),
  onEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("acp:event", handler);
    return () => ipcRenderer.removeListener("acp:event", handler);
  }
});
