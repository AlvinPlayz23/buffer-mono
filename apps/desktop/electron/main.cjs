const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { join, resolve } = require("node:path");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const ROOT_DIR = resolve(__dirname, "..");

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

function getSettingsPath() {
  const dir = join(app.getPath("userData"), "desktop");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return {
      acpLaunchCommand: "buffer --acp",
      cwd: process.cwd(),
      autoAllow: false
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
    ...(parsed || {})
  };
}

function saveSettings(next) {
  const settingsPath = getSettingsPath();
  writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
}

const rpc = new JsonRpcStdioClient();
let mainWindow = null;

function sendEventToRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("acp:event", event);
}

rpc.onEvent(sendEventToRenderer);

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

ipcMain.handle("acp:start", async (_event, config) => {
  rpc.start(config);
  return { ok: true };
});

ipcMain.handle("acp:stop", async () => {
  rpc.stop();
  return { ok: true };
});

ipcMain.handle("acp:initialize", async (_event, params) => {
  return rpc.request("initialize", params);
});

ipcMain.handle("acp:new-session", async (_event, params) => {
  return rpc.request("session/new", params);
});

ipcMain.handle("acp:load-session", async (_event, params) => {
  return rpc.request("session/load", params);
});

ipcMain.handle("acp:prompt", async (_event, params) => {
  return rpc.request("session/prompt", params);
});

ipcMain.handle("acp:cancel", async (_event, params) => {
  rpc.notify("session/cancel", params);
  return { ok: true };
});

ipcMain.handle("acp:set-mode", async (_event, params) => {
  return rpc.request("session/set_mode", params);
});

ipcMain.handle("acp:respond-permission", async (_event, requestId, outcome) => {
  rpc.respondPermission(requestId, outcome);
  return { ok: true };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    rpc.stop();
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
