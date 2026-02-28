export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "resource_link"; uri: string; name?: string; mimeType?: string; title?: string }
  | { type: string; [key: string]: unknown };

export type PermissionOutcome =
  | { outcome: "cancelled" }
  | { outcome: "selected"; optionId: string };

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

export interface SessionUpdateEnvelope {
  sessionId: string;
  update: {
    sessionUpdate: string;
    [key: string]: unknown;
  };
}

export interface SessionMessage {
  role: "user" | "assistant" | "thought";
  text: string;
}

export interface ToolCallEntry {
  toolCallId: string;
  title?: string;
  kind?: string;
  status?: "pending" | "in_progress" | "completed" | "failed";
  content?: unknown;
  locations?: unknown;
}

export interface AppSettings {
  acpLaunchCommand: string;
  cwd: string;
  autoAllow: boolean;
  autoStartAcp: boolean;
}

export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface ThreadItem {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface ProjectMeta {
  availableCommands: Array<{ name: string; description?: string }>;
  modes: Array<{ id: string; name: string; description?: string | null }>;
  currentModeId: string;
  models: Array<{ modelId: string; name: string; description?: string | null }>;
  currentModelId: string;
}

export type DesktopEvent =
  | { type: "connected"; command: string; args: string[]; cwd: string }
  | { type: "disconnected"; reason: string }
  | { type: "stopped" }
  | { type: "stderr"; text: string }
  | { type: "protocol_log"; text: string }
  | { type: "notification"; payload: unknown }
  | { type: "acp_status_update"; status: "starting" | "connected" | "disconnected" | "error"; reason?: string }
  | { type: "session_update"; params: SessionUpdateEnvelope }
  | {
      type: "permission_request";
      requestId: string;
      params: {
        sessionId: string;
        toolCall?: { toolCallId?: string; title?: string; kind?: string };
        options: PermissionOption[];
      };
    };

export interface DesktopApi {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  pickFolder(): Promise<{ path: string | null }>;

  listProjects(): Promise<{ projects: ProjectItem[]; activeProjectId: string | null }>;
  createProject(params: { path: string; name?: string }): Promise<{ projectId: string }>;
  selectProject(projectId: string): Promise<{ project: ProjectItem }>;
  removeProject(projectId: string): Promise<{ ok: true }>;

  listThreads(projectId: string): Promise<{ threads: ThreadItem[]; activeThreadId: string | null }>;
  renameThread(threadId: string, title: string): Promise<{ ok: true }>;

  getProjectPrefs(projectId: string): Promise<{ preferredModelId?: string }>;
  setProjectModelPref(projectId: string, modelId: string): Promise<{ ok: true }>;
  getProjectMeta(projectId: string): Promise<ProjectMeta | null>;
  setProjectMeta(projectId: string, meta: Partial<ProjectMeta>): Promise<{ ok: true }>;

  getAcpStatus(): Promise<{ status: "connected" | "starting" | "disconnected" }>;
  start(config: { launchCommand: string; cwd: string }): Promise<{ ok: true }>;
  stop(): Promise<{ ok: true }>;
  initialize(params: {
    protocolVersion: number;
    clientCapabilities: {
      fs: { readTextFile: boolean; writeTextFile: boolean };
      terminal: boolean;
    };
    clientInfo: { name: string; title: string; version: string };
  }): Promise<{
    protocolVersion: number;
    agentInfo?: { name: string; title: string; version: string };
    agentCapabilities?: Record<string, unknown>;
    authMethods?: Array<{ id?: string; name?: string }>;
  }>;
  newSession(params: { projectId: string; cwd: string; mcpServers: unknown[] }): Promise<any>;
  loadSession(params: { projectId: string; sessionId: string; cwd: string; mcpServers: unknown[] }): Promise<any>;
  prompt(params: { sessionId: string; prompt: ContentBlock[] }): Promise<{ stopReason: string }>;
  cancel(params: { sessionId: string }): Promise<{ ok: true }>;
  deleteSession(params: { sessionId: string }): Promise<{ ok: true }>;
  setMode(params: { sessionId: string; modeId: string }): Promise<any>;
  setModel(params: { sessionId: string; modelId: string }): Promise<any>;
  respondPermission(requestId: string, outcome: PermissionOutcome): Promise<{ ok: true }>;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}
