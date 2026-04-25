import type {
  ContextUsage,
  DesktopEvent,
  FileChangeEntry,
  PermissionOption,
  SessionMessage,
  TaskProgressEntry,
  ToolCallEntry
} from "../types/acp";

export interface PermissionRequestState {
  requestId: string;
  sessionId: string;
  toolKind?: string;
  title?: string;
  options: PermissionOption[];
}

export interface AppState {
  connection: "disconnected" | "connected";
  logs: string[];
  sessionId: string;
  messages: SessionMessage[];
  toolCalls: Record<string, ToolCallEntry>;
  plan: Array<{ content: string; priority?: string; status?: string }>;
  taskProgress: Record<string, TaskProgressEntry>;
  changeTree: FileChangeEntry[];
  contextUsage: ContextUsage | null;
  availableCommands: Array<{ name: string; description?: string }>;
  modes: Array<{ id: string; name: string; description?: string | null }>;
  currentModeId: string;
  models: Array<{ modelId: string; name: string; description?: string | null }>;
  currentModelId: string;
  permissionRequest: PermissionRequestState | null;
}

export const initialState: AppState = {
  connection: "disconnected",
  logs: [],
  sessionId: "",
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
};

function appendMessage(messages: SessionMessage[], role: SessionMessage["role"], text: string): SessionMessage[] {
  if (text.length === 0) return messages;
  const next = [...messages];
  const last = next[next.length - 1];
  if (last && last.role === role) {
    // Some ACP agents stream cumulative chunks (full text so far) rather than deltas.
    // Handle both safely to avoid duplicated output.
    if (text === last.text) return next;
    if (text.startsWith(last.text)) {
      last.text = text;
      return next;
    }
    if (last.text.startsWith(text)) {
      return next;
    }

    // Delta mode (or mixed): append only the non-overlapping suffix when possible.
    if (text.length > 1 && last.text.endsWith(text)) return next;
    let overlap = Math.min(last.text.length, text.length);
    while (overlap > 0) {
      if (last.text.slice(-overlap) === text.slice(0, overlap)) break;
      overlap--;
    }
    last.text += text.slice(overlap);
  } else {
    next.push({ role, text });
  }
  return next;
}

export function reduceEvent(state: AppState, event: DesktopEvent): AppState {
  if (event.type === "connected") {
    return { ...state, connection: "connected", logs: [...state.logs, `Connected: ${event.command}`] };
  }

  if (event.type === "disconnected" || event.type === "stopped") {
    return { ...state, connection: "disconnected" };
  }

  if (event.type === "stderr" || event.type === "protocol_log") {
    return { ...state, logs: [...state.logs, event.text] };
  }

  if (event.type === "permission_request") {
    return {
      ...state,
      permissionRequest: {
        requestId: event.requestId,
        sessionId: event.params.sessionId,
        toolKind: event.params.toolCall?.kind,
        title: event.params.toolCall?.title,
        options: event.params.options
      }
    };
  }

  if (event.type !== "session_update") return state;

  if (state.sessionId && event.params.sessionId !== state.sessionId) return state;

  const update = event.params.update;
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const content = update.content as { type?: string; text?: string };
      if (content?.type !== "text" || !content.text) return state;
      return {
        ...state,
        messages: appendMessage(state.messages, "assistant", content.text)
      };
    }
    case "user_message_chunk": {
      const content = update.content as { type?: string; text?: string };
      if (content?.type !== "text" || !content.text) return state;
      return {
        ...state,
        messages: appendMessage(state.messages, "user", content.text)
      };
    }
    case "thought_chunk":
    case "agent_thought_chunk": {
      const content = update.content as { type?: string; text?: string };
      if (content?.type !== "text" || !content.text) return state;
      return {
        ...state,
        messages: appendMessage(state.messages, "thought", content.text)
      };
    }
    case "tool_call": {
      const toolCallId = String(update.toolCallId || "");
      if (!toolCallId) return state;
      return {
        ...state,
        toolCalls: {
          ...state.toolCalls,
          [toolCallId]: {
            toolCallId,
            title: typeof update.title === "string" ? update.title : undefined,
            kind: typeof update.kind === "string" ? update.kind : undefined,
            status: update.status as ToolCallEntry["status"],
            content: update.content,
            locations: update.locations,
            diff: typeof update.diff === "string" ? update.diff : undefined,
            rawInput:
              typeof update.rawInput === "string" ? update.rawInput : update.rawInput !== undefined ? JSON.stringify(update.rawInput, null, 2) : undefined,
            rawOutput:
              typeof update.rawOutput === "string" ? update.rawOutput : update.rawOutput !== undefined ? JSON.stringify(update.rawOutput, null, 2) : undefined
          }
        }
      };
    }
    case "tool_call_update": {
      const toolCallId = String(update.toolCallId || "");
      if (!toolCallId) return state;
      const prior = state.toolCalls[toolCallId] || { toolCallId };
      return {
        ...state,
        toolCalls: {
          ...state.toolCalls,
          [toolCallId]: {
            ...prior,
            title: typeof update.title === "string" ? update.title : prior.title,
            kind: typeof update.kind === "string" ? update.kind : prior.kind,
            status: (update.status as ToolCallEntry["status"]) || prior.status,
            content: update.content ?? prior.content,
            locations: update.locations ?? prior.locations,
            diff: typeof update.diff === "string" ? update.diff : prior.diff,
            rawInput:
              typeof update.rawInput === "string"
                ? update.rawInput
                : update.rawInput !== undefined
                  ? JSON.stringify(update.rawInput, null, 2)
                  : prior.rawInput,
            rawOutput:
              typeof update.rawOutput === "string"
                ? update.rawOutput
                : update.rawOutput !== undefined
                  ? JSON.stringify(update.rawOutput, null, 2)
                  : prior.rawOutput
          }
        }
      };
    }
    case "plan": {
      const entries = Array.isArray(update.entries) ? update.entries : [];
      return {
        ...state,
        plan: entries.map((entry: any) => ({
          content: String(entry?.content || ""),
          priority: typeof entry?.priority === "string" ? entry.priority : undefined,
          status: typeof entry?.status === "string" ? entry.status : undefined
        }))
      };
    }
    case "task_progress": {
      const taskId = String(update.taskId || "");
      if (!taskId) return state;
      return {
        ...state,
        taskProgress: {
          ...state.taskProgress,
          [taskId]: {
            taskId,
            agent: String(update.agent || ""),
            status: (update.status as TaskProgressEntry["status"]) || "pending",
            currentTool: typeof update.currentTool === "string" ? update.currentTool : undefined,
            elapsedSeconds: typeof update.elapsedSeconds === "number" ? update.elapsedSeconds : undefined
          }
        }
      };
    }
    case "task_lifecycle": {
      const taskId = String(update.taskId || "");
      if (!taskId) return state;
      const existing = state.taskProgress[taskId];
      if (!existing) return state;
      const transition = String(update.transition || "");
      const status =
        transition === "completed" || transition === "failed" || transition === "aborted"
          ? (transition as TaskProgressEntry["status"])
          : existing.status;
      return {
        ...state,
        taskProgress: {
          ...state.taskProgress,
          [taskId]: { ...existing, status }
        }
      };
    }
    case "change_tree": {
      const changes = Array.isArray(update.changes) ? update.changes : [];
      return {
        ...state,
        changeTree: changes.map((change: any) => ({
          path: String(change?.path || ""),
          type: change?.type === "edit" ? "edit" : "write",
          additions: typeof change?.additions === "number" ? change.additions : undefined,
          deletions: typeof change?.deletions === "number" ? change.deletions : undefined
        }))
      };
    }
    case "context_usage": {
      return {
        ...state,
        contextUsage: {
          percent: typeof update.percent === "number" ? update.percent : null,
          contextWindow: Number(update.contextWindow) || 0,
          input: Number(update.input) || 0,
          output: Number(update.output) || 0,
          cost: Number(update.cost) || 0
        }
      };
    }
    case "available_commands_update": {
      const availableCommands = Array.isArray(update.availableCommands) ? update.availableCommands : [];
      return {
        ...state,
        availableCommands: availableCommands.map((command: any) => ({
          name: String(command?.name || ""),
          description: typeof command?.description === "string" ? command.description : undefined
        }))
      };
    }
    case "current_mode_update": {
      return {
        ...state,
        currentModeId: String(update.currentModeId || "")
      };
    }
    default:
      return state;
  }
}
