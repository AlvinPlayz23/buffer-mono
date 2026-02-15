import type { DesktopEvent, PermissionOption, SessionMessage, ToolCallEntry } from "../types/acp";

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
    last.text += text;
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
    case "thought_chunk": {
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
            locations: update.locations
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
            locations: update.locations ?? prior.locations
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
