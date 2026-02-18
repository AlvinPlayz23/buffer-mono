import { useEffect, useMemo, useState } from "react";
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
  const [initInfo, setInitInfo] = useState<{ agentName?: string; protocolVersion?: number }>({});
  const [acpStatus, setAcpStatus] = useState<"starting" | "connected" | "disconnected" | "error">("disconnected");

  const [busy, setBusy] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const toolCalls = useMemo(() => Object.values(state.toolCalls), [state.toolCalls]);
  const activeToolCalls = useMemo(
    () => toolCalls.filter((tool) => tool.status === "pending" || tool.status === "in_progress"),
    [toolCalls]
  );
  const recentToolCalls = useMemo(() => toolCalls.slice(-6).reverse(), [toolCalls]);
  const canSend = Boolean(promptInput.trim()) && !isSending && !busy && !!activeThreadId;

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
    const result = await api.loadSession({ threadId: thread.id, sessionId, cwd: thread.path, mcpServers: [] });
    resetConversationView(sessionId);

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
      } else {
        await createSessionForThread(selected);
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
      await api.start({ launchCommand: settings.acpLaunchCommand, cwd: settings.cwd || process.cwd() });
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
          const rememberedOption = sessionRemember[kind];
          const available = event.params.options.find((option) => option.optionId === rememberedOption);

          if (settings.autoAllow) {
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

  return (
    <div className="thread-layout">
      <aside className="thread-sidebar">
        <button className="btn btn-new-thread" onClick={createThread}>+ New thread</button>
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
                        onClick={() => {
                          void loadSessionForThread(thread, session.id);
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
            <h1>{threads.find((t) => t.id === activeThreadId)?.name || "New thread"}</h1>
            <span className={`status-pill ${acpStatus}`}>{acpStatus}</span>
            {initInfo.agentName && <span>{initInfo.agentName} v{initInfo.protocolVersion}</span>}
            {!!activeSessionId && <span className="session-chip">{activeSessionId}</span>}
          </div>

          <div className="chat-controls">
            <select aria-label="Model" value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)}>
              <option value="">Model</option>
              {state.models.map((model) => (
                <option key={model.modelId} value={model.modelId}>
                  {model.name || model.modelId}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => changeModel(selectedModelId)} disabled={!selectedModelId || !activeThreadId || busy}>
              Apply
            </button>
            <select aria-label="Mode" value={state.currentModeId} onChange={(e) => changeMode(e.target.value)}>
              <option value="">Mode</option>
              {state.modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>
            <button className="btn settings-button" onClick={() => setShowSettings(true)}>Settings</button>
          </div>
        </header>

        <main className="chat-main">
          {state.messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-logo">☁</div>
              <h2>Let's build</h2>
              <h3>{threads.find((t) => t.id === activeThreadId)?.name || "your project"}</h3>
              <div className="suggestion-grid">
                {[
                  "Create a classic snake game",
                  "Find and fix a bug in my code",
                  "Summarize this app in a short doc"
                ].map((idea) => (
                  <button
                    key={idea}
                    className="suggestion-card"
                    onClick={() => setPromptInput(idea)}
                    disabled={!activeThreadId || busy || isSending}
                  >
                    {idea}
                  </button>
                ))}
              </div>
              <div className="empty-actions">
                {acpStatus === "connected" ? (
                  <button className="btn" onClick={() => void stopAcp()} disabled={busy}>Connected - Stop ACP</button>
                ) : (
                  <button className="btn btn-primary" onClick={connectAndInitialize} disabled={busy}>Start ACP</button>
                )}
                <button className="btn" onClick={() => setShowSettings(true)}>Settings</button>
              </div>
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
        </main>

        <footer className="composer-wrap">
          <div className="composer-box">
            <textarea
              placeholder={activeThreadId ? "Ask Codex anything..." : "Create or select a thread first..."}
              value={promptInput}
              disabled={isSending || !activeThreadId}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendPrompt();
                }
              }}
            />
            <div className="composer-footer">
              <div className="composer-meta">
                <span className="chip">Model: {selectedModelId || state.currentModelId || "Default"}</span>
                <span className="chip">Mode: {state.currentModeId || "Default"}</span>
              </div>
              <div className="composer-actions">
                <button className="btn" onClick={() => activeSessionId && api.cancel({ sessionId: activeSessionId })} disabled={!activeSessionId}>Stop</button>
                <button className="btn btn-primary" onClick={sendPrompt} disabled={!canSend}>
                  {isSending ? (
                    <span className="btn-loading">
                      <span className="spinner" />
                      Sending
                    </span>
                  ) : (
                    "Send"
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
                <button className="btn" onClick={() => setShowSettings(false)}>Close</button>
              </header>

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
                  Default working directory
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
                  Auto-allow permission prompts
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={settings.autoStartAcp}
                    onChange={(e) => setSettings((prev) => ({ ...prev, autoStartAcp: e.target.checked }))}
                  />
                  Auto-start ACP on app launch
                </label>
                <div className="row-actions">
                  <button className="btn btn-primary" disabled={busy} onClick={connectAndInitialize}>Start + Initialize</button>
                  <button className="btn" onClick={() => void stopAcp()} disabled={busy}>Stop ACP</button>
                </div>
                <div className="row-actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      const saved = await api.saveSettings(settings);
                      setSettings(saved);
                    }}
                  >
                    Save
                  </button>
                </div>
              </section>

              <details>
                <summary>Slash Commands</summary>
                <ul>
                  {state.availableCommands.map((cmd) => (
                    <li key={cmd.name}>/{cmd.name} {cmd.description ? `- ${cmd.description}` : ""}</li>
                  ))}
                </ul>
              </details>

              <details>
                <summary>Tool Calls</summary>
                {toolCalls.map((tool) => (
                  <article key={tool.toolCallId} className="drawer-card">
                    <header>
                      <strong>{tool.title || tool.toolCallId}</strong>
                      <span>{tool.status || "pending"}</span>
                    </header>
                    <p>{tool.kind || "other"}</p>
                    {tool.content !== undefined && tool.content !== null && <pre>{JSON.stringify(tool.content, null, 2)}</pre>}
                  </article>
                ))}
              </details>

              <details>
                <summary>Plan</summary>
                <ol>
                  {state.plan.map((entry, idx) => (
                    <li key={`${entry.content}-${idx}`}>
                      {entry.content} ({entry.status || "pending"})
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

        {error && <div className="error-toast">{error}</div>}

        {state.permissionRequest && (
          <div className="modal">
            <div className="modal-card">
              <h3>Permission Request</h3>
              <p>{state.permissionRequest.title || "Tool execution request"}</p>
              <p>Kind: {state.permissionRequest.toolKind || "other"}</p>
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
                Remember this choice for this tool kind (session only)
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
