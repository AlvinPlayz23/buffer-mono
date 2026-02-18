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

export interface ThreadItem {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface SessionItem {
  id: string;
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
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

  listThreads(): Promise<{ threads: ThreadItem[]; activeThreadId: string | null }>;
  createThread(params: { path: string; name?: string }): Promise<{ threadId: string }>;
  selectThread(threadId: string): Promise<{ thread: ThreadItem }>;
  removeThread(threadId: string): Promise<{ ok: true }>;

  listSessions(threadId: string): Promise<{ sessions: SessionItem[]; activeSessionId: string | null }>;
  renameSession(sessionId: string, title: string): Promise<{ ok: true }>;

  getThreadPrefs(threadId: string): Promise<{ preferredModelId?: string }>;
  setThreadModelPref(threadId: string, modelId: string): Promise<{ ok: true }>;

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
  newSession(params: { threadId: string; cwd: string; mcpServers: unknown[] }): Promise<any>;
  loadSession(params: { threadId: string; sessionId: string; cwd: string; mcpServers: unknown[] }): Promise<any>;
  prompt(params: { sessionId: string; prompt: ContentBlock[] }): Promise<{ stopReason: string }>;
  cancel(params: { sessionId: string }): Promise<{ ok: true }>;
  setMode(params: { sessionId: string; modeId: string }): Promise<any>;
  respondPermission(requestId: string, outcome: PermissionOutcome): Promise<{ ok: true }>;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}
