import { useEffect, useMemo, useRef, useState } from "react";
import { getDesktopApi } from "./lib/api";
import { initialState, reduceEvent, type AppState } from "./lib/state";
import type {
  AppSettings,
  DesktopEvent,
  PermissionOption,
  PermissionOutcome,
  SessionItem,
  ThreadItem
} from "./types/acp";

const api = getDesktopApi();

type RememberMap = Record<string, string>;

const THEMES = [
  { id: "midnight", name: "Midnight", icon: "🌙" },
  { id: "dawn", name: "Dawn", icon: "🌅" },
  { id: "forest", name: "Forest", icon: "🌲" },
  { id: "arctic", name: "Arctic", icon: "❄" }
] as const;

function formatThreadName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [settings, setSettings] = useState<AppSettings>({
    acpLaunchCommand: "buffer --acp",
    cwd: "",
    autoAllow: false,
    autoStartAcp: true
  });

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState("");

  const [promptInput, setPromptInput] = useState("");
  const [rememberChoice, setRememberChoice] = useState(false);
  const [sessionRemember, setSessionRemember] = useState<RememberMap>({});
  const [selectedModelId, setSelectedModelId] = useState("");
  const [, setInitInfo] = useState<{ agentName?: string; protocolVersion?: number }>({});
  const [acpStatus, setAcpStatus] = useState<"starting" | "connected" | "disconnected" | "error">("disconnected");

  const [busy, setBusy] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [theme, setTheme] = useState("midnight");

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionRememberRef = useRef(sessionRemember);
  sessionRememberRef.current = sessionRemember;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toolCalls = useMemo(() => Object.values(state.toolCalls), [state.toolCalls]);
  const activeToolCalls = useMemo(
    () => toolCalls.filter((tool) => tool.status === "pending" || tool.status === "in_progress"),
    [toolCalls]
  );
  const recentToolCalls = useMemo(() => toolCalls.slice(-6).reverse(), [toolCalls]);
  const canSend = Boolean(promptInput.trim()) && !isSending && !busy && !!activeThreadId && acpStatus === "connected";

  const filteredSlashCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    const q = slashFilter.toLowerCase();
    return state.availableCommands.filter((cmd) => cmd.name.toLowerCase().startsWith(q));
  }, [showSlashMenu, slashFilter, state.availableCommands]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function handlePromptChange(value: string) {
    setPromptInput(value);
    if (value.startsWith("/")) {
      const query = value.slice(1).split(/\s/)[0] || "";
      setSlashFilter(query);
      setShowSlashMenu(true);
      setSlashSelectedIdx(0);
    } else {
      setShowSlashMenu(false);
    }
  }

  function insertSlashCommand(name: string) {
    setPromptInput(`/${name} `);
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  }

  function resetConversationView(newSessionId = "") {
    setActiveSessionId(newSessionId);
    setState((prev) => ({
      ...prev,
      sessionId: newSessionId,
      messages: [],
      toolCalls: {},
      plan: [],
      availableCommands: [],
      modes: [],
      currentModeId: "",
      models: [],
      currentModelId: "",
      permissionRequest: null
    }));
  }

  async function refreshThreads() {
    const result = await api.listThreads();
    setThreads(result.threads);
    return result;
  }

  async function refreshSessions(threadId: string) {
    const result = await api.listSessions(threadId);
    setSessions(result.sessions);
    return result;
  }

  async function applyThreadModelPreference(threadId: string, sessionId: string) {
    const pref = await api.getThreadPrefs(threadId);
    if (!pref.preferredModelId) return;
    setSelectedModelId(pref.preferredModelId);

    if (sessionId) {
      await api.prompt({
        sessionId,
        prompt: [{ type: "text", text: `/model ${pref.preferredModelId}` }]
      });
    }
  }

  async function createSessionForThread(thread: ThreadItem): Promise<string> {
    const result = await api.newSession({ threadId: thread.id, cwd: thread.path, mcpServers: [] });
    const sid = String(result?.sessionId || "");
    resetConversationView(sid);

    const modes = Array.isArray(result?.modes?.availableModes) ? result.modes.availableModes : [];
    const currentModeId = String(result?.modes?.currentModeId || "");
    const models = Array.isArray(result?.models?.availableModels) ? result.models.availableModels : [];
    const currentModelId = String(result?.models?.currentModelId || "");
    setState((prev) => ({ ...prev, modes, currentModeId, models, currentModelId }));
    if (currentModelId) setSelectedModelId(currentModelId);

    await applyThreadModelPreference(thread.id, sid);
    await refreshSessions(thread.id);
    return sid;
  }

  async function loadSessionForThread(thread: ThreadItem, sessionId: string): Promise<void> {
    resetConversationView(sessionId);
    const result = await api.loadSession({ threadId: thread.id, sessionId, cwd: thread.path, mcpServers: [] });

    const modes = Array.isArray(result?.modes?.availableModes) ? result.modes.availableModes : [];
    const currentModeId = String(result?.modes?.currentModeId || "");
    const models = Array.isArray(result?.models?.availableModels) ? result.models.availableModels : [];
    const currentModelId = String(result?.models?.currentModelId || "");
    setState((prev) => ({ ...prev, modes, currentModeId, models, currentModelId }));
    if (currentModelId) setSelectedModelId(currentModelId);

    const pref = await api.getThreadPrefs(thread.id);
    if (pref.preferredModelId) setSelectedModelId(pref.preferredModelId);
    await refreshSessions(thread.id);
  }

  async function openThread(threadId: string) {
    const selected = threads.find((t) => t.id === threadId);
    if (!selected) return;

    setError("");
    setBusy(true);
    try {
      await api.selectThread(threadId);
      setActiveThreadId(threadId);
      setSettings((prev) => ({ ...prev, cwd: selected.path }));
      resetConversationView("");

      const sessionResult = await refreshSessions(threadId);
      const latest = sessionResult.sessions[0];
      if (latest) {
        await loadSessionForThread(selected, latest.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open thread");
    } finally {
      setBusy(false);
    }
  }

  async function createThread() {
    const picked = await api.pickFolder();
    const path = String(picked?.path || "").trim();
    if (!path) return;

    setError("");
    setBusy(true);
    try {
      const created = await api.createThread({ path, name: formatThreadName(path) });
      await refreshThreads();
      await openThread(created.threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create thread");
    } finally {
      setBusy(false);
    }
  }

  async function connectAndInitialize() {
    setError("");
    setBusy(true);
    setAcpStatus("starting");
    try {
      await api.start({ launchCommand: settings.acpLaunchCommand, cwd: settings.cwd || "" });
      const initialized = await api.initialize({
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

      setInitInfo({
        agentName: initialized?.agentInfo?.name,
        protocolVersion: initialized?.protocolVersion
      });
      setAcpStatus("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize ACP");
      setAcpStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function sendPrompt() {
    const text = promptInput.trim();
    if (!text || !activeThreadId) return;

    setError("");
    setBusy(true);
    setIsSending(true);
    try {
      let sessionId = activeSessionId;
      const thread = threads.find((t) => t.id === activeThreadId);
      if (!thread) throw new Error("No active thread selected");

      if (!sessionId) {
        sessionId = await createSessionForThread(thread);
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { role: "user", text }]
      }));

      await api.prompt({ sessionId, prompt: [{ type: "text", text }] });
      if ((sessions.find((s) => s.id === sessionId)?.title || "") === "New session") {
        await api.renameSession(sessionId, text.slice(0, 60));
      }
      await refreshSessions(activeThreadId);
      setPromptInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt failed");
    } finally {
      setIsSending(false);
      setBusy(false);
    }
  }

  async function changeMode(modeId: string) {
    if (!activeSessionId || !modeId) return;
    setError("");
    try {
      await api.setMode({ sessionId: activeSessionId, modeId });
      setState((prev) => ({ ...prev, currentModeId: modeId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set mode");
    }
  }

  async function changeModel(modelId: string) {
    if (!activeThreadId || !modelId) return;
    setError("");
    try {
      await api.setThreadModelPref(activeThreadId, modelId);
      setSelectedModelId(modelId);
      if (activeSessionId) {
        await api.prompt({ sessionId: activeSessionId, prompt: [{ type: "text", text: `/model ${modelId}` }] });
        setState((prev) => ({ ...prev, currentModelId: modelId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set model");
    }
  }

  async function stopAcp() {
    await api.stop();
    setAcpStatus("disconnected");
  }

  async function respondPermission(option: PermissionOption | null, forceCancelled = false) {
    const permissionRequest = state.permissionRequest;
    if (!permissionRequest) return;

    let outcome: PermissionOutcome;
    if (forceCancelled || !option) {
      outcome = { outcome: "cancelled" };
    } else {
      outcome = { outcome: "selected", optionId: option.optionId };
      const rememberKey = permissionRequest.toolKind;
      if (rememberChoice && typeof rememberKey === "string" && rememberKey.length > 0) {
        setSessionRemember((prev) => ({ ...prev, [rememberKey]: option.optionId }));
      }
    }

    await api.respondPermission(permissionRequest.requestId, outcome);
    setRememberChoice(false);
    setState((prev) => ({ ...prev, permissionRequest: null }));
  }

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, activeToolCalls]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      const loadedSettings = await api.getSettings();
      setSettings(loadedSettings);

      const threadData = await refreshThreads();
      if (threadData.activeThreadId && threadData.threads.some((t) => t.id === threadData.activeThreadId)) {
        await openThread(threadData.activeThreadId);
      }

      unlisten = api.onEvent((event: DesktopEvent) => {
        if (event.type === "acp_status_update") {
          setAcpStatus(event.status);
          return;
        }

        if (event.type === "connected") {
          setAcpStatus("connected");
          return;
        }

        if (event.type === "disconnected" || event.type === "stopped") {
          setAcpStatus("disconnected");
        }

        if (event.type === "permission_request") {
          const kind = event.params.toolCall?.kind || "other";
          const rememberedOption = sessionRememberRef.current[kind];
          const available = event.params.options.find((option) => option.optionId === rememberedOption);

          if (settingsRef.current.autoAllow) {
            const firstAllow = event.params.options.find((option) => option.kind.startsWith("allow"));
            if (firstAllow) {
              void api.respondPermission(event.requestId, {
                outcome: "selected",
                optionId: firstAllow.optionId
              });
              return;
            }
          }

          if (available) {
            void api.respondPermission(event.requestId, {
              outcome: "selected",
              optionId: available.optionId
            });
            return;
          }
        }

        setState((prev) => reduceEvent(prev, event));
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="thread-layout">
      <aside className="thread-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-brand">Buffer</span>
          <span className={`status-dot ${acpStatus}`} title={acpStatus} />
        </div>
        <button className="btn btn-new-thread" onClick={createThread} disabled={busy}>
          <span className="btn-icon">+</span> New thread
        </button>
        <div className="thread-sidebar-title">THREADS</div>
        <ul className="thread-list">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                className={`thread-item ${thread.id === activeThreadId ? "active" : ""}`}
                onClick={() => openThread(thread.id)}
              >
                <span className="thread-folder">{thread.name}</span>
                <span className="thread-path">{thread.path}</span>
              </button>
              {thread.id === activeThreadId && sessions.length > 0 && (
                <ul className="session-list">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <button
                        className={`session-item ${session.id === activeSessionId ? "active" : ""}`}
                        disabled={busy}
                        onClick={async () => {
                          if (busy || session.id === activeSessionId) return;
                          setBusy(true);
                          setError("");
                          try {
                            await loadSessionForThread(thread, session.id);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to load session");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {session.title || "Untitled session"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <main className="app-shell">
        <header className="chat-header">
          <div className="chat-title">
            <h1>{activeThread?.name || "Buffer"}</h1>
            <span className={`status-pill ${acpStatus}`}>{acpStatus}</span>
          </div>

          <div className="chat-controls">
            <button className="btn-icon-only" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
          </div>
        </header>

        <main className="chat-main">
          {state.messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-logo-glow">
                <div className="empty-logo">⚡</div>
              </div>
              <h2>What shall we build?</h2>
              <h3>{activeThread?.name || "Select a thread to start"}</h3>
              <div className="suggestion-grid">
                {[
                  { text: "Create a classic snake game", icon: "🎮" },
                  { text: "Find and fix a bug in my code", icon: "🔍" },
                  { text: "Summarize this app in a short doc", icon: "📄" }
                ].map((idea) => (
                  <button
                    key={idea.text}
                    className="suggestion-card"
                    onClick={() => setPromptInput(idea.text)}
                    disabled={!activeThreadId || busy || isSending}
                  >
                    <span className="suggestion-icon">{idea.icon}</span>
                    <span>{idea.text}</span>
                  </button>
                ))}
              </div>
              {acpStatus !== "connected" && (
                <div className="empty-actions">
                  <button className="btn btn-primary" onClick={connectAndInitialize} disabled={busy}>
                    {acpStatus === "starting" ? "Connecting…" : "Start ACP"}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeToolCalls.length > 0 && (
            <section className="tool-indicator-strip">
              {activeToolCalls.map((tool) => (
                <article key={tool.toolCallId} className={`tool-pill ${tool.status || "pending"}`}>
                  <span className="tool-dot" />
                  <strong>{tool.title || tool.kind || "Tool call"}</strong>
                  <span>{tool.status === "in_progress" ? "Running" : "Pending"}</span>
                </article>
              ))}
            </section>
          )}

          {state.messages.map((message, idx) => (
            <article key={`${message.role}-${idx}`} className={`chat-row ${message.role}`}>
              <div className="chat-bubble">
                <div className="chat-role">{message.role}</div>
                <pre>{message.text}</pre>
              </div>
            </article>
          ))}

          {state.messages.length > 0 && recentToolCalls.length > 0 && (
            <section className="tool-call-feed">
              {recentToolCalls.map((tool) => (
                <article key={`feed-${tool.toolCallId}`} className={`tool-feed-card ${tool.status || "pending"}`}>
                  <header>
                    <strong>{tool.title || tool.toolCallId}</strong>
                    <span>{tool.status || "pending"}</span>
                  </header>
                  <p>{tool.kind || "other"}</p>
                </article>
              ))}
            </section>
          )}

          <div ref={chatEndRef} />
        </main>

        <footer className="composer-wrap">
          <div className="composer-box">
            {showSlashMenu && filteredSlashCommands.length > 0 && (
              <div className="slash-menu">
                {filteredSlashCommands.map((cmd, idx) => (
                  <button
                    key={cmd.name}
                    className={`slash-menu-item ${idx === slashSelectedIdx ? "active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertSlashCommand(cmd.name);
                    }}
                    onMouseEnter={() => setSlashSelectedIdx(idx)}
                  >
                    <strong>/{cmd.name}</strong>
                    {cmd.description && <span>{cmd.description}</span>}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              placeholder={activeThreadId ? "Message Buffer… Type / for commands" : "Select a thread to start…"}
              value={promptInput}
              disabled={isSending || !activeThreadId}
              onChange={(e) => handlePromptChange(e.target.value)}
              onKeyDown={(e) => {
                if (showSlashMenu && filteredSlashCommands.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashSelectedIdx((i) => (i + 1) % filteredSlashCommands.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashSelectedIdx((i) => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    insertSlashCommand(filteredSlashCommands[slashSelectedIdx].name);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setShowSlashMenu(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendPrompt();
                }
              }}
              onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
            />
            <div className="composer-footer">
              <div className="composer-meta">
                <select
                  className="composer-select"
                  aria-label="Model"
                  value={selectedModelId || state.currentModelId}
                  onChange={(e) => {
                    if (e.target.value) void changeModel(e.target.value);
                  }}
                >
                  <option value="" disabled>Select model…</option>
                  {state.models.map((model) => (
                    <option key={model.modelId} value={model.modelId}>
                      {model.name || model.modelId}
                    </option>
                  ))}
                  {state.models.length === 0 && (
                    <option value="" disabled>No models available</option>
                  )}
                </select>
                <select
                  className="composer-select"
                  aria-label="Mode"
                  value={state.currentModeId}
                  onChange={(e) => {
                    if (e.target.value) void changeMode(e.target.value);
                  }}
                >
                  <option value="" disabled>Select mode…</option>
                  {state.modes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.name}
                    </option>
                  ))}
                  {state.modes.length === 0 && (
                    <option value="" disabled>No modes available</option>
                  )}
                </select>
              </div>
              <div className="composer-actions">
                {isSending && (
                  <button className="btn btn-sm" onClick={() => activeSessionId && api.cancel({ sessionId: activeSessionId })}>
                    Stop
                  </button>
                )}
                <button className="btn btn-primary btn-sm btn-send" onClick={sendPrompt} disabled={!canSend}>
                  {isSending ? (
                    <span className="btn-loading">
                      <span className="spinner" />
                    </span>
                  ) : (
                    "↵"
                  )}
                </button>
              </div>
            </div>
          </div>
        </footer>

        {showSettings && (
          <div className="drawer-overlay" onClick={() => setShowSettings(false)}>
            <aside className="settings-drawer" onClick={(e) => e.stopPropagation()}>
              <header>
                <h2>Settings</h2>
                <button className="btn btn-sm" onClick={() => setShowSettings(false)}>✕</button>
              </header>

              <section>
                <h3>Theme</h3>
                <div className="theme-picker">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      className={`theme-chip ${theme === t.id ? "active" : ""}`}
                      onClick={() => setTheme(t.id)}
                    >
                      <span>{t.icon}</span>
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3>ACP Connection</h3>
                <label>
                  Launch command
                  <input
                    value={settings.acpLaunchCommand}
                    onChange={(e) => setSettings((prev) => ({ ...prev, acpLaunchCommand: e.target.value }))}
                  />
                </label>
                <label>
                  Working directory
                  <input
                    value={settings.cwd}
                    onChange={(e) => setSettings((prev) => ({ ...prev, cwd: e.target.value }))}
                  />
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={settings.autoAllow}
                    onChange={(e) => setSettings((prev) => ({ ...prev, autoAllow: e.target.checked }))}
                  />
                  Auto-allow permissions
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={settings.autoStartAcp}
                    onChange={(e) => setSettings((prev) => ({ ...prev, autoStartAcp: e.target.checked }))}
                  />
                  Auto-start ACP on launch
                </label>
                <div className="row-actions">
                  <button className="btn btn-primary" disabled={busy} onClick={connectAndInitialize}>
                    {acpStatus === "connected" ? "Reconnect" : "Start ACP"}
                  </button>
                  <button className="btn" onClick={() => void stopAcp()} disabled={busy || acpStatus === "disconnected"}>Stop</button>
                </div>
                <div className="row-actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      const saved = await api.saveSettings(settings);
                      setSettings(saved);
                    }}
                  >
                    Save Settings
                  </button>
                </div>
              </section>

              <details>
                <summary>Slash Commands</summary>
                <ul className="cmd-list">
                  {state.availableCommands.map((cmd) => (
                    <li key={cmd.name}>
                      <strong>/{cmd.name}</strong>
                      {cmd.description && <span>{cmd.description}</span>}
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary>Tool Calls ({toolCalls.length})</summary>
                {toolCalls.map((tool) => (
                  <article key={tool.toolCallId} className="drawer-card">
                    <header>
                      <strong>{tool.title || tool.toolCallId}</strong>
                      <span className={`tool-status-badge ${tool.status || "pending"}`}>{tool.status || "pending"}</span>
                    </header>
                    <p>{tool.kind || "other"}</p>
                    {tool.content !== undefined && tool.content !== null && <pre>{JSON.stringify(tool.content, null, 2)}</pre>}
                  </article>
                ))}
              </details>

              <details>
                <summary>Plan</summary>
                <ol className="plan-list">
                  {state.plan.map((entry, idx) => (
                    <li key={`${entry.content}-${idx}`} className={`plan-item ${entry.status || "pending"}`}>
                      {entry.content}
                    </li>
                  ))}
                </ol>
              </details>

              <details>
                <summary>Logs</summary>
                <div className="drawer-logs">
                  {state.logs.map((line, idx) => (
                    <pre key={`${line}-${idx}`}>{line}</pre>
                  ))}
                </div>
              </details>
            </aside>
          </div>
        )}

        {error && (
          <div className="error-toast" onClick={() => setError("")}>
            {error}
            <button className="error-dismiss">&times;</button>
          </div>
        )}

        {state.permissionRequest && (
          <div className="modal">
            <div className="modal-card">
              <h3>Permission Request</h3>
              <p className="perm-title">{state.permissionRequest.title || "Tool execution request"}</p>
              <p className="perm-kind">{state.permissionRequest.toolKind || "other"}</p>
              <div className="row-actions">
                {state.permissionRequest.options.map((option) => (
                  <button className="btn" key={option.optionId} onClick={() => void respondPermission(option)}>
                    {option.name}
                  </button>
                ))}
                <button className="btn" onClick={() => void respondPermission(null, true)}>Cancel</button>
              </div>
              <label className="checkbox-inline">
                <input type="checkbox" checked={rememberChoice} onChange={(e) => setRememberChoice(e.target.checked)} />
                Remember for this tool kind (session)
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
