import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { getDesktopApi } from "./lib/api";
import { initialState, reduceEvent, type AppState } from "./lib/state";
import type {
  AppSettings,
  DesktopEvent,
  PermissionOption,
  PermissionOutcome,
  ThreadItem,
  ProjectMeta,
  ProjectItem
} from "./types/acp";

const api = getDesktopApi();

type RememberMap = Record<string, string>;
type PreWarmedThread = { projectId: string; sessionId: string; used: boolean };

const THEMES = [
  { id: "midnight", name: "Midnight", icon: "🌙" },
  { id: "dawn", name: "Dawn", icon: "🌅" },
  { id: "forest", name: "Forest", icon: "🌲" },
  { id: "arctic", name: "Arctic", icon: "❄" }
] as const;

function formatProjectName(path: string): string {
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

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [activeThreadId, setActiveThreadId] = useState("");

  const [promptInput, setPromptInput] = useState("");
  const [rememberChoice, setRememberChoice] = useState(false);
  const [threadRemember, setThreadRemember] = useState<RememberMap>({});
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
  const threadRememberRef = useRef(threadRemember);
  threadRememberRef.current = threadRemember;
  const lastPersistedMetaRef = useRef<string>("");
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const preWarmedThreadRef = useRef<PreWarmedThread | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toolCalls = useMemo(() => Object.values(state.toolCalls), [state.toolCalls]);
  const activeToolCalls = useMemo(
    () => toolCalls.filter((tool) => tool.status === "pending" || tool.status === "in_progress"),
    [toolCalls]
  );
  const recentToolCalls = useMemo(() => toolCalls.slice(-6).reverse(), [toolCalls]);
  const canSend = Boolean(promptInput.trim()) && !isSending && !busy && !!activeProjectId && acpStatus === "connected";

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

  function resetConversationView(newThreadId = "") {
    setActiveThreadId(newThreadId);
    setState((prev) => ({
      ...prev,
      sessionId: newThreadId,
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

  async function refreshProjects() {
    const result = await api.listProjects();
    setProjects(result.projects);
    return result;
  }

  async function refreshThreads(projectId: string) {
    const result = await api.listThreads(projectId);
    setThreads(result.threads);
    return result;
  }

  function applySessionMetadata(result: any, sessionId = "") {
    const modes = Array.isArray(result?.modes?.availableModes) ? result.modes.availableModes : [];
    const currentModeId = String(result?.modes?.currentModeId || "");
    const models = Array.isArray(result?.models?.availableModels) ? result.models.availableModels : [];
    const currentModelId = String(result?.models?.currentModelId || "");
    setState((prev) => ({
      ...prev,
      sessionId: sessionId || prev.sessionId,
      modes,
      currentModeId,
      models,
      currentModelId
    }));
    if (currentModelId) setSelectedModelId(currentModelId);
  }

  function applyProjectMetadata(meta: ProjectMeta | null) {
    if (!meta) return;
    setState((prev) => ({
      ...prev,
      availableCommands: Array.isArray(meta.availableCommands) ? meta.availableCommands : [],
      modes: Array.isArray(meta.modes) ? meta.modes : [],
      currentModeId: String(meta.currentModeId || ""),
      models: Array.isArray(meta.models) ? meta.models : [],
      currentModelId: String(meta.currentModelId || "")
    }));
    if (meta.currentModelId) setSelectedModelId(meta.currentModelId);
  }

  function getUnusedPreWarmedThread(projectId: string): PreWarmedThread | null {
    const preWarmed = preWarmedThreadRef.current;
    if (!preWarmed) return null;
    if (preWarmed.used) return null;
    if (preWarmed.projectId !== projectId) return null;
    return preWarmed;
  }

  async function cleanupUnusedPreWarmedThread(keepProjectId = ""): Promise<void> {
    const preWarmed = preWarmedThreadRef.current;
    if (!preWarmed || preWarmed.used) return;
    if (keepProjectId && preWarmed.projectId === keepProjectId) return;
    preWarmedThreadRef.current = null;
    try {
      await api.deleteSession({ sessionId: preWarmed.sessionId });
      if (activeProjectIdRef.current === preWarmed.projectId) {
        await refreshThreads(preWarmed.projectId);
      }
    } catch {
      // Best-effort cleanup only.
    }
  }

  async function preWarmProjectThread(project: ProjectItem): Promise<void> {
    if (acpStatus !== "connected") return;
    if (activeThreadId) return;
    if (getUnusedPreWarmedThread(project.id)) return;
    try {
      const result = await api.newSession({ projectId: project.id, cwd: project.path, mcpServers: [] });
      if (activeProjectIdRef.current !== project.id) return;
      const sid = String(result?.sessionId || "");
      if (!sid) return;

      preWarmedThreadRef.current = { projectId: project.id, sessionId: sid, used: false };
      applySessionMetadata(result, sid);
      await refreshThreads(project.id);
    } catch {
      // Non-critical: fallback is creating a session on first prompt.
    }
  }

  async function applyProjectModelPreference(projectId: string, sessionId: string) {
    const pref = await api.getProjectPrefs(projectId);
    if (!pref.preferredModelId) return;
    setSelectedModelId(pref.preferredModelId);

    if (sessionId) {
      await api.setModel({ sessionId, modelId: pref.preferredModelId });
    }
  }

  async function createThreadForProject(project: ProjectItem): Promise<string> {
    const result = await api.newSession({ projectId: project.id, cwd: project.path, mcpServers: [] });
    const sid = String(result?.sessionId || "");
    resetConversationView(sid);
    applySessionMetadata(result, sid);

    await applyProjectModelPreference(project.id, sid);
    await refreshThreads(project.id);
    return sid;
  }

  async function loadThreadForProject(project: ProjectItem, sessionId: string): Promise<void> {
    await cleanupUnusedPreWarmedThread("");
    resetConversationView(sessionId);
    const result = await api.loadSession({ projectId: project.id, sessionId, cwd: project.path, mcpServers: [] });
    applySessionMetadata(result, sessionId);

    const pref = await api.getProjectPrefs(project.id);
    if (pref.preferredModelId) setSelectedModelId(pref.preferredModelId);
    await refreshThreads(project.id);
  }

  async function openProject(projectId: string) {
    const selected = projects.find((t) => t.id === projectId);
    if (!selected) return;

    setError("");
    setBusy(true);
    try {
      await cleanupUnusedPreWarmedThread(projectId);
      await api.selectProject(projectId);
      setActiveProjectId(projectId);
      setSettings((prev) => ({ ...prev, cwd: selected.path }));
      resetConversationView("");
      setSelectedModelId("");
      await refreshThreads(projectId);
      const [pref, projectMeta] = await Promise.all([api.getProjectPrefs(projectId), api.getProjectMeta(projectId)]);
      applyProjectMetadata(projectMeta);
      if (pref.preferredModelId) setSelectedModelId(pref.preferredModelId);
      await preWarmProjectThread(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open project");
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    const picked = await api.pickFolder();
    const path = String(picked?.path || "").trim();
    if (!path) return;

    setError("");
    setBusy(true);
    try {
      const created = await api.createProject({ path, name: formatProjectName(path) });
      await refreshProjects();
      await openProject(created.projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
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
    if (!text || !activeProjectId) return;

    setError("");
    setBusy(true);
    setIsSending(true);
    try {
      let sessionId = activeThreadId;
      const project = projects.find((t) => t.id === activeProjectId);
      if (!project) throw new Error("No active project selected");

      if (!sessionId) {
        const preWarmed = getUnusedPreWarmedThread(project.id);
        if (preWarmed) {
          preWarmed.used = true;
          preWarmedThreadRef.current = preWarmed;
          sessionId = preWarmed.sessionId;
          setActiveThreadId(sessionId);
          setState((prev) => ({ ...prev, sessionId }));
          await refreshThreads(project.id);
        } else {
          sessionId = await createThreadForProject(project);
        }
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { role: "user", text }]
      }));

      await api.prompt({ sessionId, prompt: [{ type: "text", text }] });
      if ((threads.find((s) => s.id === sessionId)?.title || "") === "New thread") {
        await api.renameThread(sessionId, text.slice(0, 60));
      }
      await refreshThreads(activeProjectId);
      setPromptInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt failed");
    } finally {
      setIsSending(false);
      setBusy(false);
    }
  }

  async function changeMode(modeId: string) {
    if (!activeThreadId || !modeId) return;
    setError("");
    try {
      await api.setMode({ sessionId: activeThreadId, modeId });
      setState((prev) => ({ ...prev, currentModeId: modeId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set mode");
    }
  }

  async function changeModel(modelId: string) {
    if (!activeProjectId || !modelId) return;
    setError("");
    try {
      await api.setProjectModelPref(activeProjectId, modelId);
      setSelectedModelId(modelId);
      if (activeThreadId) {
        await api.setModel({ sessionId: activeThreadId, modelId });
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
        setThreadRemember((prev) => ({ ...prev, [rememberKey]: option.optionId }));
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
    const unlisten = api.onEvent((event: DesktopEvent) => {
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
        const rememberedOption = threadRememberRef.current[kind];
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

      if (event.type === "session_update") {
        const preWarmed = preWarmedThreadRef.current;
        if (preWarmed && !preWarmed.used && event.params.sessionId === preWarmed.sessionId) {
          const sessionUpdate = String(event.params.update?.sessionUpdate || "");
          const allowedDuringPreWarm = new Set([
            "available_commands_update",
            "current_mode_update",
            "available_modes_update",
            "models_update",
            "current_model_update"
          ]);
          if (!allowedDuringPreWarm.has(sessionUpdate)) return;
        }
      }

      setState((prev) => reduceEvent(prev, event));
    });

    void (async () => {
      const loadedSettings = await api.getSettings();
      setSettings(loadedSettings);

      const currentStatus = await api.getAcpStatus();
      setAcpStatus(currentStatus.status);

      const threadData = await refreshProjects();
      if (threadData.activeProjectId && threadData.projects.some((t) => t.id === threadData.activeProjectId)) {
        await openProject(threadData.activeProjectId);
      }
    })();

    return () => {
      unlisten();
    };
  }, []);

  useEffect(() => {
    return () => {
      void cleanupUnusedPreWarmedThread("");
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    const payload: Partial<ProjectMeta> = {
      availableCommands: state.availableCommands,
      modes: state.modes,
      currentModeId: state.currentModeId,
      models: state.models,
      currentModelId: state.currentModelId
    };
    const key = JSON.stringify({ projectId: activeProjectId, payload });
    if (key === lastPersistedMetaRef.current) return;
    lastPersistedMetaRef.current = key;
    void api.setProjectMeta(activeProjectId, payload);
  }, [activeProjectId, state.availableCommands, state.modes, state.currentModeId, state.models, state.currentModelId]);

  const activeProject = projects.find((t) => t.id === activeProjectId);

  return (
    <div className="project-layout">
      <aside className="project-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-brand">Buffer</span>
          <span className={`status-dot ${acpStatus}`} title={acpStatus} />
        </div>
        <button className="btn btn-new-project" onClick={createProject} disabled={busy}>
          <span className="btn-icon">+</span> New project
        </button>
        <div className="project-sidebar-title">PROJECTS</div>
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                className={`project-item ${project.id === activeProjectId ? "active" : ""}`}
                onClick={() => openProject(project.id)}
              >
                <span className="project-folder">{project.name}</span>
                <span className="project-path">{project.path}</span>
              </button>
              {project.id === activeProjectId && threads.length > 0 && (
                <ul className="thread-list">
                  {threads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        className={`thread-item ${thread.id === activeThreadId ? "active" : ""}`}
                        disabled={busy}
                        onClick={async () => {
                          if (busy || thread.id === activeThreadId) return;
                          setBusy(true);
                          setError("");
                          try {
                            await loadThreadForProject(project, thread.id);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to load thread");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {thread.title || "Untitled thread"}
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
            <h1>{activeProject?.name || "Buffer"}</h1>
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
              <h3>{activeProject?.name || "Select a project to start"}</h3>
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
                    disabled={!activeProjectId || busy || isSending}
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
              {message.role === "user" ? (
                <div className="chat-bubble">
                  <pre>{message.text}</pre>
                </div>
              ) : (
                <div className={`chat-flat ${message.role}`}>
                  <div className="chat-role">{message.role}</div>
                  <Markdown>{message.text}</Markdown>
                </div>
              )}
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
              placeholder={activeProjectId ? "Message Buffer… Type / for commands" : "Select a project to start…"}
              value={promptInput}
              disabled={isSending || !activeProjectId}
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
                  <button className="btn btn-sm" onClick={() => activeThreadId && api.cancel({ sessionId: activeThreadId })}>
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
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <header className="settings-header">
                <h2>Settings</h2>
                <button className="btn-icon-only" onClick={() => setShowSettings(false)}>✕</button>
              </header>

              <div className="settings-body">
                <div className="settings-grid">
                  <section className="settings-section">
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

                  <section className="settings-section">
                    <div className="settings-section-head">
                      <h3>ACP Connection</h3>
                      <span className={`status-pill ${acpStatus}`}>{acpStatus}</span>
                    </div>
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
                </div>

                <div className="settings-grid">
                  <details className="settings-section">
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

                  <details className="settings-section">
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
                </div>

                <div className="settings-grid">
                  <details className="settings-section">
                    <summary>Plan</summary>
                    <ol className="plan-list">
                      {state.plan.map((entry, idx) => (
                        <li key={`${entry.content}-${idx}`} className={`plan-item ${entry.status || "pending"}`}>
                          {entry.content}
                        </li>
                      ))}
                    </ol>
                  </details>

                  <details className="settings-section">
                    <summary>Logs</summary>
                    <div className="drawer-logs">
                      {state.logs.map((line, idx) => (
                        <pre key={`${line}-${idx}`}>{line}</pre>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>
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
                Remember for this tool kind (thread)
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
