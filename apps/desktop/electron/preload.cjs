const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("acpDesktop", {
  getSettings: () => ipcRenderer.invoke("acp:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("acp:save-settings", settings),
  pickFolder: () => ipcRenderer.invoke("system:pick-folder"),

  listThreads: () => ipcRenderer.invoke("threads:list"),
  createThread: (params) => ipcRenderer.invoke("threads:create", params),
  selectThread: (threadId) => ipcRenderer.invoke("threads:select", { threadId }),
  removeThread: (threadId) => ipcRenderer.invoke("threads:remove", { threadId }),

  listSessions: (threadId) => ipcRenderer.invoke("sessions:list", { threadId }),
  renameSession: (sessionId, title) => ipcRenderer.invoke("sessions:rename", { sessionId, title }),

  getThreadPrefs: (threadId) => ipcRenderer.invoke("prefs:get-thread", { threadId }),
  setThreadModelPref: (threadId, modelId) => ipcRenderer.invoke("prefs:set-thread-model", { threadId, modelId }),

  start: (config) => ipcRenderer.invoke("acp:start", config),
  stop: () => ipcRenderer.invoke("acp:stop"),
  initialize: (params) => ipcRenderer.invoke("acp:initialize", params),
  newSession: (params) => ipcRenderer.invoke("acp:new-session", params),
  loadSession: (params) => ipcRenderer.invoke("acp:load-session", params),
  prompt: (params) => ipcRenderer.invoke("acp:prompt", params),
  cancel: (params) => ipcRenderer.invoke("acp:cancel", params),
  setMode: (params) => ipcRenderer.invoke("acp:set-mode", params),
  respondPermission: (requestId, outcome) => ipcRenderer.invoke("acp:respond-permission", requestId, outcome),

  onEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("acp:event", handler);
    return () => ipcRenderer.removeListener("acp:event", handler);
  }
});
