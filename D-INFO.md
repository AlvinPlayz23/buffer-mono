# D-INFO: Buffer Desktop App (Comprehensive)

## 1) Product Motto / Direction

The desktop app is the **multi-project orchestration layer** for Buffer CLI.

- CLI = deep work on one task/session in terminal.
- Desktop = parallel tasking across many project folders with a modern chat UX.
- ACP is the bridge between UI and Buffer runtime.

Core product idea:
- Organize work by **Thread** (project folder/workspace).
- Inside each thread, run or resume many **Sessions** (conversations).
- Keep desktop and CLI sessions aligned so `/resume` in CLI and desktop see the same work.

---

## 2) Core Concepts

## Thread

A thread is a workspace container:
- Maps to one folder path on disk.
- Represents one project/repo/app context.
- Holds many sessions.

Thread object fields:
- `id`, `name`, `path`, `createdAt`, `updatedAt`, `lastOpenedAt`.

## Session

A session is one conversation timeline:
- A chat history tied to a thread/workdir.
- Can be resumed, loaded, and continued.
- Matches the underlying Buffer session model (JSONL session files).

Session object fields:
- `id`, `threadId`, `title`, `createdAt`, `updatedAt`, `lastOpenedAt`.

## ACP

Agent Client Protocol is the transport contract:
- Desktop spawns `buffer --acp`.
- Uses JSON-RPC over stdio.
- Methods like initialize/new/load/prompt/mode/cancel.
- Receives streaming `session/update` notifications.

---

## 3) Tech Stack (Desktop)

Desktop app package: `apps/desktop`

- **Electron**: main process + native window/dialog + IPC bridge.
- **React 18 + TypeScript**: renderer UI.
- **Vite**: dev/build tooling for renderer.
- **Vitest**: tests.
- **concurrently + wait-on**: dev startup orchestration.

Key files:
- `apps/desktop/electron/main.cjs`: process management, ACP RPC client, storage, IPC handlers.
- `apps/desktop/electron/preload.cjs`: secure bridge (`window.acpDesktop` API).
- `apps/desktop/src/App.tsx`: thread/session/chat UI behavior.
- `apps/desktop/src/lib/state.ts`: ACP event reducer and stream state model.
- `apps/desktop/src/types/acp.ts`: typed desktop API + event contracts.
- `apps/desktop/src/styles.css`: desktop UI styling.

---

## 4) Runtime Architecture

## Main Process Responsibilities

1. Spawn/manage ACP subprocess:
- Launch command from settings (`acpLaunchCommand`, default `buffer --acp`).
- Maintain stdio JSON-RPC request/response state.
- Forward ACP events to renderer.

2. Persist desktop metadata:
- Settings file: Electron userData `desktop/settings.json`.
- App metadata file: Electron userData `desktop/data.json`.

3. Bridge to CLI session files:
- Reads real Buffer session files from:
  - `~/.buffer/agent/sessions/--<cwd-encoded>--/*.jsonl`
- Parses titles/metadata for desktop session list.
- Updates ACP session map (`~/.buffer/agent/acp-sessions.json`) before load when needed.

## Renderer Responsibilities

1. Present thread/session/chat UI.
2. Call IPC API (`window.acpDesktop.*`).
3. Reduce streaming ACP events into chat/tool state.
4. Manage UX states: send locks, spinner, settings drawer, permission prompt modal.

---

## 5) Storage Model

Desktop metadata (Electron userData):
- `desktop/settings.json`
  - `acpLaunchCommand`
  - `cwd`
  - `autoAllow`
  - `autoStartAcp`
- `desktop/data.json`
  - `threads[]`
  - `sessions[]` (desktop metadata/fallback)
  - `threadPrefs{}` (e.g., preferred model per thread)
  - `appState` (active thread/session, recents)

Buffer/CLI shared storage:
- Session files under `~/.buffer/agent/sessions/...`
- ACP session mapping at `~/.buffer/agent/acp-sessions.json`

Important behavior:
- Session list in desktop now prioritizes **real CLI session files** for the thread cwd.
- Desktop metadata remains as fallback.

---

## 6) ACP Protocol Usage (Implemented)

Methods sent from desktop:
- `initialize`
- `session/new`
- `session/load`
- `session/prompt`
- `session/cancel` (notify)
- `session/set_mode`
- permission response handling (`session/request_permission` reply path)

Events consumed:
- transport/lifecycle: connected/disconnected/stopped/stderr/protocol_log
- `session/update` variants:
  - `agent_message_chunk`
  - `user_message_chunk`
  - `thought_chunk` / `agent_thought_chunk`
  - `tool_call`
  - `tool_call_update`
  - `plan`
  - `available_commands_update`
  - `current_mode_update`
- permission request events.

---

## 7) Feature Set (Current Desktop)

## Threads
- Create thread via native folder picker.
- Select/open thread.
- Persistent thread list + recents.

## Sessions
- Auto-open most recent session for selected thread.
- Auto-create new session if none exists.
- Load session history via ACP.
- Rename session title (first prompt heuristic + explicit rename path).
- Show sessions tied to same cwd as CLI `/resume`.

## Chat UX
- User/assistant/thought message rendering.
- Send on Enter, newline on Shift+Enter.
- Send button loading spinner.
- Input disabled while send is in progress.
- Stop current run via cancel.

## Tooling UX
- Tool call status strip (pending/in-progress).
- Recent tool call feed cards.
- Detailed tool calls in settings drawer.

## Session Controls
- Mode selector + apply.
- Model selector + apply.
- Per-thread preferred model persistence.
- On session creation/load, model/mode metadata synced from ACP response.

## ACP Connection UX
- Start/stop ACP.
- ACP status pills (`starting/connected/disconnected/error`).
- Auto-start on app launch option.
- Launch command configurable in settings.

## Permissions
- Prompt modal for tool permission decisions.
- Auto-allow option.
- Per-session “remember option by tool kind” memory.

## Diagnostics
- Slash commands list pane.
- Plan pane.
- Raw logs pane.
- CLI-side `--acp-log` support exists for low-level ACP debugging.

---

## 8) UI Direction

The UI aims for a “chat webapp” style:
- Left rail for threads/sessions.
- Center chat canvas with modern composer.
- Settings drawer for advanced controls.
- Empty-state suggestion cards.
- Lightweight status chips/pills and tool activity visibility.

Reference assets:
- `mock-desktop-ui.html`
- provided screenshot mock used for visual direction.

---

## 9) Session Behavior Rules

1. Thread is the cwd/workspace anchor.
2. Session belongs to thread context.
3. When thread changes:
- desktop loads/recreates session context for that cwd.
4. Session history continuity follows Buffer’s session files.
5. Session listing and CLI `/resume` are intended to align by cwd.

---

## 10) What Was Tried and Deferred

Thinking block UI using `<think>...</think>` parsing was implemented then disabled due stream-edge issues and output corruption in some cases.

Documentation for that work:
- `think-ui-notice.md`

Current status:
- feature disabled intentionally.
- retained note includes architecture and safe reintroduction plan.

---

## 11) Commands You’ll Use

From repo root:

- Desktop dev:
  - `pnpm run desktop:dev`
- Desktop typecheck:
  - `pnpm --dir apps/desktop typecheck`
- Desktop build:
  - `pnpm run desktop:build`
- CLI ACP mode:
  - `pnpm run start -- --acp`
- CLI ACP with raw logs:
  - `pnpm run start -- --acp --acp-log`

---

## 12) Current Constraints / Known Gaps

- ACP runtime is currently single shared process per desktop app lifecycle (not yet per-session process isolation).
- Not all interactive CLI slash commands are represented as first-class desktop actions.
- Think-tag based reasoning UI is deferred pending stronger chunk-normalization.
- Desktop rendering still evolves toward final mock polish.

---

## 13) Vision Summary

The desktop app is meant to be:
- the **multi-thread mission control** for Buffer,
- backed by ACP for reliable runtime communication,
- session-compatible with CLI workflow,
- and optimized for parallel project execution with clean, modern UX.
