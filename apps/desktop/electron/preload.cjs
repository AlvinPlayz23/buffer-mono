const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("acpDesktop", {
  getSettings: () => ipcRenderer.invoke("acp:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("acp:save-settings", settings),
  pickFolder: () => ipcRenderer.invoke("system:pick-folder"),

  listProjects: () => ipcRenderer.invoke("projects:list"),
  createProject: (params) => ipcRenderer.invoke("projects:create", params),
  selectProject: (projectId) => ipcRenderer.invoke("projects:select", { projectId }),
  removeProject: (projectId) => ipcRenderer.invoke("projects:remove", { projectId }),

  listThreads: (projectId) => ipcRenderer.invoke("threads:list", { projectId }),
  renameThread: (threadId, title) => ipcRenderer.invoke("threads:rename", { threadId, title }),

  getProjectPrefs: (projectId) => ipcRenderer.invoke("prefs:get-project", { projectId }),
  setProjectModelPref: (projectId, modelId) => ipcRenderer.invoke("prefs:set-project-model", { projectId, modelId }),
  getProjectMeta: (projectId) => ipcRenderer.invoke("prefs:get-project-meta", { projectId }),
  setProjectMeta: (projectId, meta) => ipcRenderer.invoke("prefs:set-project-meta", { projectId, meta }),

  getAcpStatus: () => ipcRenderer.invoke("acp:status"),
  start: (config) => ipcRenderer.invoke("acp:start", config),
  stop: () => ipcRenderer.invoke("acp:stop"),
  initialize: (params) => ipcRenderer.invoke("acp:initialize", params),
  newSession: (params) => ipcRenderer.invoke("acp:new-session", params),
  loadSession: (params) => ipcRenderer.invoke("acp:load-session", params),
  prompt: (params) => ipcRenderer.invoke("acp:prompt", params),
  cancel: (params) => ipcRenderer.invoke("acp:cancel", params),
  deleteSession: (params) => ipcRenderer.invoke("acp:delete-session", params),
  setMode: (params) => ipcRenderer.invoke("acp:set-mode", params),
  setModel: (params) => ipcRenderer.invoke("acp:set-model", params),
  respondPermission: (requestId, outcome) => ipcRenderer.invoke("acp:respond-permission", requestId, outcome),

  onEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("acp:event", handler);
    return () => ipcRenderer.removeListener("acp:event", handler);
  }
});
