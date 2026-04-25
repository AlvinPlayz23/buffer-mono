import { useEffect, useMemo, useRef, useState } from "react";
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
import { PrimaryRail } from "./components/PrimaryRail";
import { SessionsPanel } from "./components/SessionsPanel";
import { Workspace } from "./components/Workspace";
import { Composer } from "./components/Composer";
import { SettingsModal } from "./components/SettingsModal";
import { PermissionModal } from "./components/PermissionModal";

const api = getDesktopApi();

type RememberMap = Record<string, string>;
type PreWarmedThread = { projectId: string; sessionId: string; used: boolean };

function formatProjectName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [settings, setSettings] = useState<AppSettings>({
    cwd: "",
    autoAllow: false,
    autoStartAcp: true
  });

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [activeThreadId, setActiveThreadId] = useState("");
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);

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
      taskProgress: {},
      changeTree: [],
      contextUsage: null,
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

  async function toggleProjectInRail(projectId: string) {
    if (sessionsPanelOpen && projectId === activeProjectId) {
      setSessionsPanelOpen(false);
      return;
    }
    setSessionsPanelOpen(true);
    if (projectId !== activeProjectId) {
      await openProject(projectId);
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
      setSessionsPanelOpen(true);
      await openProject(created.projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setBusy(false);
    }
  }

  async function startNewThread() {
    const project = projects.find((t) => t.id === activeProjectId);
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      await cleanupUnusedPreWarmedThread("");
      await createThreadForProject(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start thread");
    } finally {
      setBusy(false);
    }
  }

  async function connectAndInitialize() {
    setError("");
    setBusy(true);
    setAcpStatus("starting");
    try {
      await api.start({ cwd: settings.cwd || "" });
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

  function stopPrompt() {
    if (activeThreadId) void api.cancel({ sessionId: activeThreadId });
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
        setSessionsPanelOpen(true);
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

  const activeProject = projects.find((t) => t.id === activeProjectId) || null;
  const breadcrumb = activeProject
    ? `project: ${activeProject.name.toLowerCase().replace(/\s+/g, "-")}`
    : "ready";

  return (
    <div className="t3-shell">
      <PrimaryRail
        projects={projects}
        activeProjectId={activeProjectId}
        panelOpen={sessionsPanelOpen}
        busy={busy}
        onToggleProject={(id) => void toggleProjectInRail(id)}
        onNewProject={() => void createProject()}
        onOpenSettings={() => setShowSettings(true)}
      />

      <SessionsPanel
        open={sessionsPanelOpen}
        project={activeProject}
        threads={threads}
        activeThreadId={activeThreadId}
        busy={busy}
        onSelectThread={async (threadId) => {
          if (!activeProject || busy || threadId === activeThreadId) return;
          setBusy(true);
          setError("");
          try {
            await loadThreadForProject(activeProject, threadId);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load thread");
          } finally {
            setBusy(false);
          }
        }}
        onNewThread={() => void startNewThread()}
      />

      <main className="t3-main">
        <Workspace
          project={activeProject}
          acpStatus={acpStatus}
          messages={state.messages}
          activeToolCalls={activeToolCalls}
          recentToolCalls={recentToolCalls}
          chatEndRef={chatEndRef}
          onConnect={() => void connectAndInitialize()}
          busy={busy}
          acpBreadcrumb={breadcrumb}
        />

        <Composer
          textareaRef={textareaRef}
          promptInput={promptInput}
          onPromptChange={handlePromptChange}
          onSend={() => void sendPrompt()}
          onStop={stopPrompt}
          canSend={canSend}
          isSending={isSending}
          disabled={isSending || !activeProjectId}
          placeholder={
            activeProjectId
              ? "Ask the agent to build, refactor, or test… (type / for commands)"
              : "Select a project to start…"
          }
          showSlashMenu={showSlashMenu}
          filteredSlashCommands={filteredSlashCommands}
          slashSelectedIdx={slashSelectedIdx}
          setSlashSelectedIdx={setSlashSelectedIdx}
          insertSlashCommand={insertSlashCommand}
          setShowSlashMenu={setShowSlashMenu}
          models={state.models}
          selectedModelId={selectedModelId || state.currentModelId}
          onChangeModel={(id) => void changeModel(id)}
          modes={state.modes}
          currentModeId={state.currentModeId}
          onChangeMode={(id) => void changeMode(id)}
          supervised={!settings.autoAllow}
          onToggleSupervised={() =>
            setSettings((prev) => ({ ...prev, autoAllow: !prev.autoAllow }))
          }
        />
      </main>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        state={state}
        settings={settings}
        setSettings={(updater) => setSettings((prev) => updater(prev))}
        busy={busy}
        acpStatus={acpStatus}
        onConnect={() => void connectAndInitialize()}
        onStop={() => void stopAcp()}
        onSaveSettings={async () => {
          const saved = await api.saveSettings(settings);
          setSettings(saved);
        }}
        theme={theme}
        setTheme={setTheme}
      />

      <PermissionModal
        request={state.permissionRequest}
        remember={rememberChoice}
        setRemember={setRememberChoice}
        onRespond={(opt, cancelled) => void respondPermission(opt, cancelled)}
      />

      {error && (
        <div className="error-toast" onClick={() => setError("")}>
          <span>{error}</span>
          <button className="error-dismiss" type="button">×</button>
        </div>
      )}
    </div>
  );
}
