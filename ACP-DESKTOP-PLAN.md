# ACP + Desktop Updates Plan

Update the ACP layer and desktop app types to surface all new CLI features (task system, change tree, new slash commands, new tools).

---

## What's Missing

### ACP slash commands (`src/coding-agent/modes/acp/acp/agent.ts`)

Currently has: `/compact`, `/autocompact`, `/export`, `/session`, `/steering`, `/follow-up`, `/changelog`, `/help`, `/plan`, `/view`

**Missing — add these builtin handlers:**

| Command | Behavior | Maps to |
|---------|----------|---------|
| `/agents` | List available task agents | RPC `get_state` or direct agent discovery |
| `/tasks` | Show active subagent runs / toggle progress | Task EventBus query |
| `/changes` | Toggle change tree display | Session setting |
| `/name <text>` | Rename session | RPC `set_session_name` |
| `/new` | New session | RPC `new_session` |
| `/resume` | Switch session | RPC `switch_session` |
| `/model <id>` | Set model (already exists as protocol method but not as slash command) | RPC `set_model` |

### ACP session events (`src/coding-agent/modes/acp/acp/session.ts`)

The `handlePiEvent` method in `BufferAcpSession` translates RPC events → ACP `session/update` notifications. Currently handles: `agent_message_chunk`, `user_message_chunk`, `tool_call`, `tool_call_update`, `session_info_update`, `available_commands_update`, `current_mode_update`.

**Missing event types to add:**

| New `sessionUpdate` type | Source | Payload |
|--------------------------|--------|---------|
| `task_progress` | Task EventBus `task:subagent:progress` | `{ taskId, agent, status, currentTool, elapsedSeconds }` |
| `task_lifecycle` | Task EventBus `task:subagent:lifecycle` | `{ taskId, agent, transition: "start"\|"completed"\|"failed"\|"aborted" }` |
| `change_tree` | Agent end event + change tracking | `{ changes: Array<{ path, type, additions?, deletions? }> }` |
| `context_usage` | After each assistant message | `{ percent, contextWindow, input, output, cost }` |

### RPC commands not bridged to ACP

These exist in `src/coding-agent/modes/rpc/rpc-types.ts` but ACP doesn't expose them:

| RPC Command | Priority | Notes |
|-------------|----------|-------|
| `set_session_name` | High | Needed for `/name` and thread renaming in desktop |
| `switch_session` | High | Needed for `/resume` and thread switching in desktop |
| `fork` | Medium | Conversation branching |
| `get_fork_messages` | Medium | List forkable messages |
| `steer` | Low | Queued steering messages |
| `follow_up` | Low | Queued follow-up messages |
| `get_commands` | Medium | Returns extension commands + skills (ACP builds its own list instead) |

---

## Files to Modify

### 1. ACP Layer (CLI side)

#### `src/coding-agent/modes/acp/acp/session.ts`

In `handlePiEvent()`, add handlers for new event types:

```typescript
// After existing tool_call_update handling:

case "task_progress": {
  this.conn.sendSessionUpdate(this.sessionId, {
    sessionUpdate: "task_progress",
    taskId: event.taskId,
    agent: event.agent,
    status: event.status,
    currentTool: event.currentTool,
    elapsedSeconds: event.elapsedSeconds,
  });
  break;
}

case "task_lifecycle": {
  this.conn.sendSessionUpdate(this.sessionId, {
    sessionUpdate: "task_lifecycle",
    taskId: event.taskId,
    agent: event.agent,
    transition: event.transition,
  });
  break;
}

case "change_tree": {
  this.conn.sendSessionUpdate(this.sessionId, {
    sessionUpdate: "change_tree",
    changes: event.changes,  // Array<{ path, type, additions?, deletions? }>
  });
  break;
}

case "context_usage": {
  this.conn.sendSessionUpdate(this.sessionId, {
    sessionUpdate: "context_usage",
    percent: event.percent,
    contextWindow: event.contextWindow,
    input: event.input,
    output: event.output,
    cost: event.cost,
  });
  break;
}
```

**Important**: The task progress/lifecycle events come from the **task EventBus**, not from the RPC process events. You need to subscribe to the EventBus channels in the session and forward them. Check how the EventBus is exposed — if the RPC process doesn't forward EventBus events, you'll need to either:
- Forward EventBus events through the RPC stdout stream as new event types
- Or subscribe directly in the ACP session if it has access to the `AgentSession`

For context_usage: emit this after each `agent_message_chunk` sequence ends, pulling from the session's `getContextUsage()`.

For change_tree: this needs the `currentTurnChanges` data that's currently tracked in `interactive-mode.ts`. You'll need to move that tracking into `agent-session.ts` or the RPC layer so ACP can access it.

#### `src/coding-agent/modes/acp/acp/agent.ts`

Add new builtin slash command handlers in the command handling section:

```typescript
// In the builtin command handling:

case "agents": {
  // List available task agents
  const agents = session.listTaskAgents(); // needs to be exposed
  const text = agents.map(a => `${a.name} — ${a.description}`).join("\n");
  // Return as assistant message or status update
  break;
}

case "tasks": {
  // Show active task runs or toggle
  break;
}

case "changes": {
  // Toggle change tree — send setting update
  break;
}

case "name": {
  // Rename session
  await rpcProcess.send("set_session_name", { name: args });
  break;
}
```

Also update the available commands list that's sent to the desktop — add the new commands to the builtin list so they show in autocomplete.

#### `src/coding-agent/modes/acp/acp/slash-commands.ts`

No structural changes needed — this file handles file-based prompt templates, not builtins. The builtins are handled in `agent.ts`.

#### `src/coding-agent/modes/rpc/rpc-types.ts`

Add new RPC event types if needed for forwarding task/change events:

```typescript
// Add to the RpcEvent union type:
| { type: "task_progress"; taskId: string; agent: string; status: string; currentTool?: string; elapsedSeconds?: number }
| { type: "task_lifecycle"; taskId: string; agent: string; transition: "start" | "completed" | "failed" | "aborted" }
| { type: "change_tree"; changes: Array<{ path: string; type: "write" | "edit"; additions?: number; deletions?: number }> }
| { type: "context_usage"; percent: number; contextWindow: number; input: number; output: number; cost: number }
```

#### `src/coding-agent/modes/rpc/rpc-mode.ts`

Subscribe to the task EventBus and emit the new event types through stdout so the ACP layer can receive them:

```typescript
// In the RPC mode event setup:
session.onTaskProgress((progress) => {
  sendEvent({ type: "task_progress", ...progress });
});

session.onTaskLifecycle((lifecycle) => {
  sendEvent({ type: "task_lifecycle", ...lifecycle });
});

// After agent_end, emit change_tree if there are changes
// After assistant message, emit context_usage
```

#### `src/coding-agent/core/agent-session.ts`

Move change tracking (currently in `interactive-mode.ts`) into `AgentSession` so both interactive mode AND RPC mode can access it:

- Add `private currentTurnChanges: FileChange[] = []`
- Track writes/edits in the tool execution event handlers
- Emit a `change_tree` event at `agent_end`
- Expose `getContextUsage()` data as an event after each turn

---

### 2. Desktop Types (`apps/desktop/src/types/acp.ts`)

Add new types:

```typescript
// Add to existing types:

export interface TaskProgressEntry {
  taskId: string;
  agent: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  currentTool?: string;
  elapsedSeconds?: number;
}

export interface TaskLifecycleEntry {
  taskId: string;
  agent: string;
  transition: "start" | "completed" | "failed" | "aborted";
}

export interface FileChangeEntry {
  path: string;
  type: "write" | "edit";
  additions?: number;
  deletions?: number;
}

export interface ContextUsage {
  percent: number;
  contextWindow: number;
  input: number;
  output: number;
  cost: number;
}
```

Update `ToolCallEntry` to support richer tool data:

```typescript
export interface ToolCallEntry {
  toolCallId: string;
  title?: string;
  kind?: string;
  status?: "pending" | "in_progress" | "completed" | "failed";
  content?: unknown;
  locations?: unknown;
  // New fields:
  diff?: string;           // For edit tools - the diff content
  rawInput?: string;       // Tool input (e.g., bash command)
  rawOutput?: string;      // Tool output text
}
```

---

### 3. Desktop State (`apps/desktop/src/lib/state.ts`)

Update `AppState`:

```typescript
export interface AppState {
  // ... existing fields ...

  // New fields:
  taskProgress: Record<string, TaskProgressEntry>;  // keyed by taskId
  changeTree: FileChangeEntry[];                     // last turn's changes
  contextUsage: ContextUsage | null;                 // live context meter
}
```

Update `initialState`:

```typescript
export const initialState: AppState = {
  // ... existing fields ...
  taskProgress: {},
  changeTree: [],
  contextUsage: null,
};
```

Add cases to `reduceEvent()`:

```typescript
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
        status: update.status as TaskProgressEntry["status"],
        currentTool: typeof update.currentTool === "string" ? update.currentTool : undefined,
        elapsedSeconds: typeof update.elapsedSeconds === "number" ? update.elapsedSeconds : undefined,
      },
    },
  };
}

case "task_lifecycle": {
  const taskId = String(update.taskId || "");
  const transition = String(update.transition || "");
  if (!taskId) return state;

  // If completed/failed/aborted, remove from active progress after a delay
  // For now, update status
  const existing = state.taskProgress[taskId];
  if (!existing) return state;

  const newStatus =
    transition === "completed" ? "completed" :
    transition === "failed" ? "failed" :
    transition === "aborted" ? "aborted" :
    existing.status;

  return {
    ...state,
    taskProgress: {
      ...state.taskProgress,
      [taskId]: { ...existing, status: newStatus },
    },
  };
}

case "change_tree": {
  const changes = Array.isArray(update.changes) ? update.changes : [];
  return {
    ...state,
    changeTree: changes.map((c: any) => ({
      path: String(c?.path || ""),
      type: c?.type === "edit" ? "edit" : "write",
      additions: typeof c?.additions === "number" ? c.additions : undefined,
      deletions: typeof c?.deletions === "number" ? c.deletions : undefined,
    })),
  };
}

case "context_usage": {
  return {
    ...state,
    contextUsage: {
      percent: Number(update.percent) || 0,
      contextWindow: Number(update.contextWindow) || 0,
      input: Number(update.input) || 0,
      output: Number(update.output) || 0,
      cost: Number(update.cost) || 0,
    },
  };
}
```

---

### 4. Electron Main Process (`apps/desktop/electron/main.cjs`)

No changes needed for the new event types — the main process already forwards all `session/update` notifications generically:

```javascript
// Already exists — forwards everything:
connection.on("notification", (method, params) => {
  if (method === "session/update") {
    win.webContents.send("acp:event", { type: "session_update", params });
  }
});
```

New `sessionUpdate` types (task_progress, task_lifecycle, change_tree, context_usage) will flow through automatically.

**But** add IPC handlers for any new Electron-side methods if needed (e.g., if you add `/name` support, add a `renameThread` → `set_session_name` bridge).

---

## Checklist

### ACP Layer (CLI side)
- [x] Add `task_progress` event forwarding in `rpc-mode.ts`
- [x] Add `task_lifecycle` event forwarding in `rpc-mode.ts`
- [x] Add `change_tree` event emission at agent_end in `rpc-mode.ts`
- [x] Add `context_usage` event emission after assistant turns in `rpc-mode.ts`
- [x] Add new RPC event types to `rpc-types.ts`
- [x] Handle new events in `acp/session.ts` `handlePiEvent()`
- [x] Add `/agents`, `/tasks`, `/changes`, `/name` handlers in `acp/agent.ts`
- [x] Move change tracking from `interactive-mode.ts` to `agent-session.ts`
- [x] Update available commands list sent to desktop to include new commands

### Desktop Types
- [x] Add `TaskProgressEntry`, `TaskLifecycleEntry`, `FileChangeEntry`, `ContextUsage` to `types/acp.ts`
- [x] Update `ToolCallEntry` with `diff`, `rawInput`, `rawOutput` fields
- [x] Add `taskProgress`, `changeTree`, `contextUsage` to `AppState` in `state.ts`
- [x] Add `task_progress`, `task_lifecycle`, `change_tree`, `context_usage` cases to `reduceEvent()`
- [x] Update `initialState` with new default values

### Testing
- [ ] Start ACP, send a prompt that triggers tool calls — verify new events arrive
- [ ] Test `/agents` command through desktop
- [ ] Test `/changes` toggle through desktop
- [ ] Test task tool — verify progress events stream to desktop
- [ ] Verify context_usage updates in desktop state

---

## Implementation Notes

### Summary

Implemented the ACP/backend and desktop-state plumbing for:

- new ACP slash commands: `/agents`, `/tasks`, `/changes`, `/name`, `/new`, `/resume`, `/model`
- new session update events: `task_progress`, `task_lifecycle`, `change_tree`, `context_usage`
- desktop state/types support for task progress, change tree snapshots, context usage, and richer tool call payloads

### Changed Files

- `src/coding-agent/core/agent-session.ts`
- `src/coding-agent/modes/interactive/interactive-mode.ts`
- `src/coding-agent/modes/acp/acp/session.ts`
- `src/coding-agent/modes/acp/acp/agent.ts`
- `src/coding-agent/modes/acp/pi-rpc/process.ts`
- `src/coding-agent/modes/acp/sdk.ts`
- `src/coding-agent/modes/rpc/rpc-types.ts`
- `src/coding-agent/modes/rpc/rpc-client.ts`
- `apps/desktop/src/types/acp.ts`
- `apps/desktop/src/lib/state.ts`
- `apps/desktop/src/lib/state.test.ts`
- `apps/desktop/src/App.tsx`

### Notes On Approach

- `change_tree` tracking was moved into `AgentSession`, and interactive mode now consumes the session-level event instead of maintaining the source of truth itself.
- task progress/lifecycle now come from the existing task EventBus, are emitted as session events, and are then forwarded through RPC/ACP to desktop.
- ACP command advertising now includes RPC-reported commands instead of relying only on adapter-side prompt discovery.

### Unverified / Not Fully Verified

- end-to-end ACP runtime verification was not completed
- desktop runtime verification was not completed
- `/agents`, `/changes`, and task progress streaming were not manually exercised through the desktop UI
- `context_usage` was not manually observed in a live desktop session

### Validation Limits Encountered

- `pnpm check` is blocked by an existing repo-level Biome configuration issue involving nested root configs under `oh-my-pi`
- full `tsc --noEmit` still reports pre-existing unrelated test typing errors outside this work
- Vitest execution in this sandbox is blocked by `spawn EPERM`, so runtime tests could not be executed here
