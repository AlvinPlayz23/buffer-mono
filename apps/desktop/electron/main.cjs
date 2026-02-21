const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { join, resolve, basename, dirname } = require("node:path");
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } = require("node:fs");
const { homedir } = require("node:os");
const { createHash } = require("node:crypto");

const ROOT_DIR = resolve(__dirname, "..");

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

class JsonRpcStdioClient {
  constructor() {
    this.child = null;
    this.buffer = "";
    this.seq = 1;
    this.pending = new Map();
    this.permissionRequests = new Map();
    this.listeners = new Set();
  }

  isRunning() {
    return Boolean(this.child && !this.child.killed);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitEvent(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  start(config) {
    this.stop();
    const launchCommand =
      config?.launchCommand?.trim() ||
      (config?.command ? `${config.command} ${(Array.isArray(config?.args) ? config.args.join(" ") : "--acp")}` : "") ||
      "buffer --acp";
    const cwd = config?.cwd || process.cwd();

    this.child = spawn(launchCommand, {
      cwd,
      stdio: "pipe",
      env: process.env,
      shell: true
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.emitEvent({ type: "stderr", text: String(chunk) });
    });
    this.child.on("error", (error) => {
      this.emitEvent({ type: "disconnected", reason: `ACP process error: ${error.message}` });
    });

    this.child.on("exit", (code, signal) => {
      const message = `ACP process exited (code=${String(code)}, signal=${String(signal)})`;
      for (const [id, handlers] of this.pending) {
        handlers.reject(new Error(message));
        this.pending.delete(id);
      }
      this.permissionRequests.clear();
      this.child = null;
      this.emitEvent({ type: "disconnected", reason: message });
    });

    this.emitEvent({ type: "connected", command: launchCommand, args: [], cwd });
  }

  stop() {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
    this.pending.clear();
    this.permissionRequests.clear();
    this.buffer = "";
    this.emitEvent({ type: "stopped" });
  }

  handleStdout(chunk) {
    this.buffer += chunk;
    let idx = this.buffer.indexOf("\n");
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length > 0) this.handleLine(line);
      idx = this.buffer.indexOf("\n");
    }
  }

  handleLine(line) {
    const msg = safeJsonParse(line);
    if (!msg) {
      this.emitEvent({ type: "protocol_log", text: line });
      return;
    }

    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const handlers = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) handlers.reject(new Error(msg.error.message || "Unknown JSON-RPC error"));
      else handlers.resolve(msg.result);
      return;
    }

    if (msg.method === "session/update") {
      this.emitEvent({ type: "session_update", params: msg.params });
      return;
    }

    if (msg.method === "session/request_permission" && msg.id !== undefined) {
      this.permissionRequests.set(String(msg.id), msg.id);
      this.emitEvent({ type: "permission_request", requestId: String(msg.id), params: msg.params });
      return;
    }

    this.emitEvent({ type: "notification", payload: msg });
  }

  send(payload) {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("ACP process is not running");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  request(method, params) {
    const id = this.seq++;
    const payload = { jsonrpc: "2.0", id, method, params };
    this.send(payload);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  notify(method, params) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  respondPermission(requestId, outcome) {
    const rpcId = this.permissionRequests.get(String(requestId));
    if (rpcId === undefined) throw new Error(`Unknown permission request id: ${requestId}`);
    this.permissionRequests.delete(String(requestId));
    this.send({
      jsonrpc: "2.0",
      id: rpcId,
      result: {
        outcome
      }
    });
  }
}

function getDesktopDir() {
  const dir = join(app.getPath("userData"), "desktop");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getSettingsPath() {
  return join(getDesktopDir(), "settings.json");
}

function getDataPath() {
  return join(getDesktopDir(), "data.json");
}

function getAcpSessionMapPath() {
  return join(getAgentDir(), "acp-sessions.json");
}

function getAgentDir() {
  const envDir = process.env.BUFFER_CODING_AGENT_DIR;
  if (typeof envDir === "string" && envDir.trim()) {
    if (envDir === "~") return homedir();
    if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
    return envDir;
  }
  return join(homedir(), ".buffer", "agent");
}

function getDefaultSessionDir(cwd) {
  const safePath = `--${String(cwd || "").replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(getAgentDir(), "sessions", safePath);
}

function parseSessionFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    let header = null;
    let name = "";
    let firstMessage = "";
    let lastMessageTime = 0;
    let messageCount = 0;

    for (const line of lines) {
      const entry = safeJsonParse(line);
      if (!entry || typeof entry !== "object") continue;

      if (!header && entry.type === "session" && typeof entry.id === "string") {
        header = entry;
      }

      if (entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim()) {
        name = entry.name.trim();
      }

      if (entry.type === "message" && entry.message && typeof entry.message === "object") {
        const role = String(entry.message.role || "");
        if (role !== "user" && role !== "assistant") continue;
        messageCount += 1;

        let text = "";
        const msgContent = entry.message.content;
        if (typeof msgContent === "string") {
          text = msgContent;
        } else if (Array.isArray(msgContent)) {
          text = msgContent
            .map((block) => (block && block.type === "text" && typeof block.text === "string" ? block.text : ""))
            .filter(Boolean)
            .join(" ");
        }

        if (!firstMessage && role === "user" && text.trim()) firstMessage = text.trim();

        const tsNum = Number(entry.message.timestamp);
        if (Number.isFinite(tsNum) && tsNum > 0) {
          lastMessageTime = Math.max(lastMessageTime, tsNum);
        } else if (typeof entry.timestamp === "string") {
          const t = Date.parse(entry.timestamp);
          if (!Number.isNaN(t)) lastMessageTime = Math.max(lastMessageTime, t);
        }
      }
    }

    if (!header || typeof header.id !== "string") return null;
    const stats = statSync(filePath);
    const modifiedAtIso = new Date(lastMessageTime || stats.mtimeMs || Date.now()).toISOString();
    const title = name || firstMessage || "New session";

    return {
      id: String(header.id),
      cwd: typeof header.cwd === "string" ? header.cwd : "",
      title: String(title).slice(0, 120),
      filePath,
      createdAt: typeof header.timestamp === "string" ? header.timestamp : modifiedAtIso,
      updatedAt: modifiedAtIso,
      lastOpenedAt: modifiedAtIso
    };
  } catch {
    return null;
  }
}

function listCliSessionsForCwd(cwd) {
  const sessionDir = getDefaultSessionDir(cwd);
  if (!existsSync(sessionDir)) return [];
  let files = [];
  try {
    files = readdirSync(sessionDir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => join(sessionDir, name));
  } catch {
    return [];
  }

  const sessions = [];
  for (const filePath of files) {
    const parsed = parseSessionFile(filePath);
    if (parsed) sessions.push(parsed);
  }
  sessions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return sessions;
}

function upsertAcpSessionMapEntry(entry) {
  const path = getAcpSessionMapPath();
  mkdirSync(dirname(path), { recursive: true });
  const current = existsSync(path) ? safeJsonParse(readFileSync(path, "utf8")) : null;
  const next = {
    version: 1,
    sessions: {},
    ...(current && typeof current === "object" ? current : {})
  };
  next.sessions = typeof next.sessions === "object" && next.sessions ? next.sessions : {};
  next.sessions[entry.sessionId] = {
    sessionId: entry.sessionId,
    cwd: entry.cwd,
    sessionFile: entry.sessionFile,
    updatedAt: nowIso()
  };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return {
      acpLaunchCommand: "buffer --acp",
      cwd: process.cwd(),
      autoAllow: false,
      autoStartAcp: true
    };
  }
  const parsed = safeJsonParse(readFileSync(settingsPath, "utf8"));
  const migratedLaunchCommand =
    typeof parsed?.acpLaunchCommand === "string"
      ? parsed.acpLaunchCommand
      : typeof parsed?.acpCommand === "string"
        ? `${parsed.acpCommand} ${typeof parsed?.acpArgs === "string" ? parsed.acpArgs : "--acp"}`
        : "buffer --acp";
  return {
    acpLaunchCommand: migratedLaunchCommand.trim(),
    cwd: process.cwd(),
    autoAllow: false,
    autoStartAcp: true,
    ...(parsed || {})
  };
}

function saveSettings(next) {
  const settingsPath = getSettingsPath();
  writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
}

function emptyData() {
  return {
    threads: [],
    sessions: [],
    threadPrefs: {},
    appState: {
      activeThreadId: null,
      activeSessionId: null,
      recentThreadIds: []
    }
  };
}

function loadData() {
  const path = getDataPath();
  if (!existsSync(path)) return emptyData();
  const parsed = safeJsonParse(readFileSync(path, "utf8"));
  return {
    ...emptyData(),
    ...(parsed || {}),
    appState: {
      ...emptyData().appState,
      ...(parsed?.appState || {})
    }
  };
}

function saveData(next) {
  writeFileSync(getDataPath(), JSON.stringify(next, null, 2));
  return next;
}

function threadIdForPath(path) {
  return createHash("sha1").update(path).digest("hex").slice(0, 12);
}

function touchThreadRecents(data, threadId) {
  const without = data.appState.recentThreadIds.filter((id) => id !== threadId);
  data.appState.recentThreadIds = [threadId, ...without].slice(0, 200);
}

function upsertSessionMeta(data, sessionMeta) {
  const idx = data.sessions.findIndex((s) => s.id === sessionMeta.id);
  if (idx >= 0) {
    data.sessions[idx] = { ...data.sessions[idx], ...sessionMeta, updatedAt: nowIso() };
  } else {
    data.sessions.push({ ...sessionMeta, createdAt: nowIso(), updatedAt: nowIso() });
  }
}

const rpc = new JsonRpcStdioClient();
let mainWindow = null;
let acpInitialized = false;

function sendEventToRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("acp:event", event);
}

rpc.onEvent((event) => {
  if (event.type === "connected") {
    sendEventToRenderer({ type: "acp_status_update", status: "connected" });
    return;
  }
  if (event.type === "disconnected" || event.type === "stopped") {
    acpInitialized = false;
    sendEventToRenderer({ type: "acp_status_update", status: "disconnected" });
    return;
  }
  sendEventToRenderer(event);
});

async function ensureAcpStarted() {
  if (rpc.isRunning() && acpInitialized) return;
  const settings = loadSettings();

  if (!rpc.isRunning()) {
    sendEventToRenderer({ type: "acp_status_update", status: "starting" });
    rpc.start({ launchCommand: settings.acpLaunchCommand, cwd: settings.cwd || process.cwd() });
  }

  if (!acpInitialized) {
    await rpc.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false
      },
      clientInfo: {
        name: "buffer-desktop",
        title: "Buffer Desktop",
        version: "0.2.0"
      }
    });
    acpInitialized = true;
    sendEventToRenderer({ type: "acp_status_update", status: "connected" });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  if (!app.isPackaged) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(ROOT_DIR, "dist", "index.html"));
  }
}

ipcMain.handle("acp:get-settings", async () => loadSettings());
ipcMain.handle("acp:save-settings", async (_event, nextSettings) => saveSettings(nextSettings));
ipcMain.handle("system:pick-folder", async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow || null;
  const result = await dialog.showOpenDialog(focusedWindow, {
    properties: ["openDirectory"],
    title: "Select Thread Folder"
  });
  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return { path: null };
  }
  return { path: String(result.filePaths[0]) };
});

ipcMain.handle("threads:list", async () => {
  const data = loadData();
  const order = new Map(data.appState.recentThreadIds.map((id, index) => [id, index]));
  const threads = [...data.threads].sort((a, b) => {
    const ai = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  return { threads, activeThreadId: data.appState.activeThreadId };
});

ipcMain.handle("threads:create", async (_event, params) => {
  const data = loadData();
  const path = String(params?.path || "").trim();
  if (!path) throw new Error("Thread path is required");
  const id = threadIdForPath(path);
  const existing = data.threads.find((t) => t.id === id);
  const now = nowIso();

  if (!existing) {
    data.threads.push({
      id,
      name: String(params?.name || basename(path) || path),
      path,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    });
  } else {
    existing.name = String(params?.name || existing.name || basename(path) || path);
    existing.updatedAt = now;
    existing.lastOpenedAt = now;
  }

  data.appState.activeThreadId = id;
  touchThreadRecents(data, id);
  saveData(data);
  return { threadId: id };
});

ipcMain.handle("threads:select", async (_event, params) => {
  const data = loadData();
  const threadId = String(params?.threadId || "");
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error(`Unknown thread: ${threadId}`);

  thread.lastOpenedAt = nowIso();
  thread.updatedAt = nowIso();
  data.appState.activeThreadId = threadId;
  touchThreadRecents(data, threadId);
  saveData(data);

  return { thread };
});

ipcMain.handle("threads:remove", async (_event, params) => {
  const data = loadData();
  const threadId = String(params?.threadId || "");
  data.threads = data.threads.filter((t) => t.id !== threadId);
  data.sessions = data.sessions.filter((s) => s.threadId !== threadId);
  delete data.threadPrefs[threadId];
  data.appState.recentThreadIds = data.appState.recentThreadIds.filter((id) => id !== threadId);
  if (data.appState.activeThreadId === threadId) data.appState.activeThreadId = null;
  if (data.appState.activeSessionId && !data.sessions.some((s) => s.id === data.appState.activeSessionId)) {
    data.appState.activeSessionId = null;
  }
  saveData(data);
  return { ok: true };
});

ipcMain.handle("sessions:list", async (_event, params) => {
  const data = loadData();
  const threadId = String(params?.threadId || "");
  const thread = data.threads.find((t) => t.id === threadId);
  const fromCli = thread ? listCliSessionsForCwd(thread.path) : [];
  const fromCliIds = new Set(fromCli.map((s) => s.id));
  const fromMeta = data.sessions.filter((s) => s.threadId === threadId && !fromCliIds.has(s.id));
  const sessions = [
    ...fromCli.map((s) => ({
      id: s.id,
      threadId,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastOpenedAt: s.lastOpenedAt
    })),
    ...fromMeta
  ].sort((a, b) => String(b.lastOpenedAt || b.updatedAt || "").localeCompare(String(a.lastOpenedAt || a.updatedAt || "")));
  return { sessions, activeSessionId: data.appState.activeSessionId };
});

ipcMain.handle("sessions:rename", async (_event, params) => {
  const data = loadData();
  const sessionId = String(params?.sessionId || "");
  const title = String(params?.title || "").trim();
  const s = data.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error(`Unknown session: ${sessionId}`);
  s.title = title || s.title;
  s.updatedAt = nowIso();
  saveData(data);
  return { ok: true };
});

ipcMain.handle("prefs:get-thread", async (_event, params) => {
  const data = loadData();
  const threadId = String(params?.threadId || "");
  return data.threadPrefs[threadId] || {};
});

ipcMain.handle("prefs:set-thread-model", async (_event, params) => {
  const data = loadData();
  const threadId = String(params?.threadId || "");
  const modelId = String(params?.modelId || "");
  data.threadPrefs[threadId] = { ...(data.threadPrefs[threadId] || {}), preferredModelId: modelId };
  saveData(data);
  return { ok: true };
});

ipcMain.handle("acp:start", async (_event, config) => {
  rpc.start(config);
  acpInitialized = false;
  return { ok: true };
});

ipcMain.handle("acp:stop", async () => {
  rpc.stop();
  acpInitialized = false;
  return { ok: true };
});

ipcMain.handle("acp:initialize", async (_event, params) => {
  const result = await rpc.request("initialize", params);
  acpInitialized = true;
  return result;
});

ipcMain.handle("acp:new-session", async (_event, params) => {
  await ensureAcpStarted();
  const threadId = String(params?.threadId || "");
  const payload = { cwd: params?.cwd, mcpServers: params?.mcpServers || [] };
  const result = await rpc.request("session/new", payload);

  if (threadId && result?.sessionId) {
    const data = loadData();
    const thread = data.threads.find((t) => t.id === threadId);
    if (thread) {
      const sid = String(result.sessionId);
      upsertSessionMeta(data, {
        id: sid,
        threadId,
        title: "New session",
        lastOpenedAt: nowIso()
      });
      data.appState.activeThreadId = threadId;
      data.appState.activeSessionId = sid;
      touchThreadRecents(data, threadId);
      thread.updatedAt = nowIso();
      thread.lastOpenedAt = nowIso();
      saveData(data);
    }
  }

  return result;
});

ipcMain.handle("acp:load-session", async (_event, params) => {
  await ensureAcpStarted();
  const threadId = String(params?.threadId || "");
  const sessionId = String(params?.sessionId || "");
  const cwd = String(params?.cwd || "");
  if (sessionId && cwd) {
    const cliSessions = listCliSessionsForCwd(cwd);
    const match = cliSessions.find((s) => s.id === sessionId);
    if (match?.filePath) {
      upsertAcpSessionMapEntry({
        sessionId,
        cwd,
        sessionFile: match.filePath
      });
    }
  }
  const payload = { sessionId: params?.sessionId, cwd: params?.cwd, mcpServers: params?.mcpServers || [] };
  const result = await rpc.request("session/load", payload);

  if (threadId && params?.sessionId) {
    const data = loadData();
    const sid = String(params.sessionId);
    const thread = data.threads.find((t) => t.id === threadId);
    if (thread) {
      upsertSessionMeta(data, {
        id: sid,
        threadId,
        lastOpenedAt: nowIso()
      });
      data.appState.activeThreadId = threadId;
      data.appState.activeSessionId = sid;
      touchThreadRecents(data, threadId);
      thread.updatedAt = nowIso();
      thread.lastOpenedAt = nowIso();
      saveData(data);
    }
  }

  return result;
});

ipcMain.handle("acp:prompt", async (_event, params) => {
  await ensureAcpStarted();
  const result = await rpc.request("session/prompt", params);

  const sessionId = String(params?.sessionId || "");
  if (sessionId) {
    const data = loadData();
    const s = data.sessions.find((x) => x.id === sessionId);
    if (s) {
      s.lastOpenedAt = nowIso();
      s.updatedAt = nowIso();
      if ((!s.title || s.title === "New session") && Array.isArray(params?.prompt) && params.prompt[0]?.text) {
        s.title = String(params.prompt[0].text).trim().slice(0, 60) || s.title;
      }
      data.appState.activeSessionId = sessionId;
      saveData(data);
    }
  }

  return result;
});

ipcMain.handle("acp:cancel", async (_event, params) => {
  rpc.notify("session/cancel", params);
  return { ok: true };
});

ipcMain.handle("acp:set-mode", async (_event, params) => {
  await ensureAcpStarted();
  return rpc.request("session/set_mode", params);
});

ipcMain.handle("acp:respond-permission", async (_event, requestId, outcome) => {
  rpc.respondPermission(requestId, outcome);
  return { ok: true };
});

app.whenReady().then(async () => {
  createWindow();
  const settings = loadSettings();
  if (settings.autoStartAcp) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await ensureAcpStarted();
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (attempt < maxRetries) {
          sendEventToRenderer({
            type: "acp_status_update",
            status: "starting",
            reason: `Retry ${attempt}/${maxRetries}: ${reason}`
          });
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          sendEventToRenderer({
            type: "acp_status_update",
            status: "error",
            reason: `Failed after ${maxRetries} attempts: ${reason}`
          });
        }
      }
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    rpc.stop();
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
