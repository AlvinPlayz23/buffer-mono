# Plan: README Refresh + ACP-Driven Electron Desktop App for Buffer CLI

## Summary
Build two deliverables in this order:
1. Rewrite root `README.md` so the repo is clearly presented as the Buffer coding-agent CLI, with accurate package/module layout and ACP mode usage.
2. Add a new Electron desktop app at `apps/desktop` that acts as an ACP client over stdio to `buffer --acp`, with near-full ACP session UX (new/load, streaming chat, tool calls, slash commands, model/mode controls).

The first implementation target is local/dev usage (`pnpm desktop:dev`) with optional local unsigned packaging, not production installers/signing.

## Scope and Non-Goals
In scope:
- CLI-first repo documentation update in root README.
- Desktop app with React + Vite + TypeScript renderer.
- ACP JSON-RPC client transport over newline-delimited stdio.
- Session lifecycle: initialize, session/new, session/load, session/prompt, session/cancel, session/set_mode.
- Live rendering of `session/update` variants: message chunks, tool calls, plan, command updates, mode updates.
- Permission handling for `session/request_permission` with session-level remember rules and optional global auto-allow setting.
- Settings UI for agent command/path and ACP client behavior.

Out of scope (phase 1):
- Cross-platform signed installers and auto-update.
- Full `session/set_config_option` implementation.
- Remote ACP transports (HTTP streaming).
- Full terminal embedding (`terminal/*`) since current agent advertises terminal capability as unsupported.

## Deliverable 1: Root README Rewrite
Target file:
- `README.md`

Planned structure:
1. Project identity: Buffer coding-agent CLI, what this repo contains.
2. Repository layout: explain `src/coding-agent`, `src/buffer-ai`, `src/buffer-agent-core`, `src/buffer-tui`, tests, docs, examples.
3. Requirements and setup: Node/pnpm, install/build/test/check.
4. Running modes:
- Interactive CLI.
- Non-interactive print mode.
- ACP server mode (`node dist/coding-agent/cli.js --acp`) and what it is for.
5. Desktop app section:
- State this repo now includes an ACP desktop client in `apps/desktop`.
- Dev run instructions.
- Current feature set and limitations.
6. Development notes:
- Package name/binary.
- High-level note on ACP compatibility boundaries.

Acceptance criteria:
- README no longer reads like a generic package stub.
- ACP usage and desktop app intent are explicit and accurate.
- All commands shown are runnable with this repo layout.

## Deliverable 2: `apps/desktop` Electron App
New top-level path:
- `apps/desktop`

### Architecture
Process split:
1. Electron Main Process:
- Owns ACP subprocess lifecycle.
- Spawns Buffer agent command with `--acp`.
- Implements JSON-RPC request/response correlation and notification forwarding.
- Handles permission requests (`session/request_permission`) by asking renderer and returning selected outcome.
- Exposes typed IPC API to renderer.

2. Electron Preload:
- Secure bridge via `contextBridge`.
- Narrow typed API only, no direct Node access from renderer.

3. Renderer (React + Vite):
- Chat UI, tool timeline, plan panel, commands panel, session controls, settings.
- Subscribes to streamed ACP updates and permission prompts.
- Sends user intents to main via IPC.

### ACP Transport and Protocol Handling
Transport:
- newline-delimited JSON-RPC messages on stdio.
- strict stdout parsing; stderr captured as logs only.

Client startup flow:
1. Spawn agent process (`buffer --acp` by default, configurable path).
2. Send `initialize` with protocol version 1 and client capabilities.
3. Store `agentInfo`, `agentCapabilities`, `authMethods`.
4. If auth methods provided, show auth workflow placeholder or execute selected method.
5. Enable session controls once initialized.

Session flow:
- New session: `session/new` with absolute cwd and configured MCP servers (default empty).
- Load session: `session/load` if `loadSession` capability is true.
- Prompt: `session/prompt` with `ContentBlock[]` text first.
- Cancel: `session/cancel` notification.
- Mode switch: `session/set_mode` when modes are available.

Updates handled:
- `agent_message_chunk`, `user_message_chunk`, `thought_chunk` (if present).
- `tool_call`, `tool_call_update`.
- `plan`.
- `available_commands_update`.
- `current_mode_update`.
- Unknown updates are logged and surfaced in debug pane without crashing.

### Permission UX Policy
Default:
- Ask per request with dialog showing tool title/kind and options.
- Session-level “remember this choice for matching option kind” supported.
- Settings include optional global auto-allow toggle.
- On prompt cancellation, pending permission requests return `cancelled` outcome.

### Data Model and State
Renderer state slices:
- Connection state: disconnected, starting, initialized, failed.
- Session state: active sessionId, cwd, capabilities snapshot, modes/models.
- Conversation stream: ordered chunks and assembled messages.
- Tool state: map by toolCallId with status/content/locations.
- Plan state: current full plan entries.
- Slash commands: currently available command list.
- Permission queue: outstanding requests awaiting decision.
- Settings: agent command/path, cwd defaults, auto-allow, remember rules.

Persistence:
- Local app config persisted in Electron userData.
- Recent sessions list persisted in client store.
- No protocol-level mutation of repo files.

## Public Interfaces and Type Additions
New typed IPC contract (desktop internal public boundary):
- `acp.start(config)`
- `acp.stop()`
- `acp.initialize(payload)`
- `acp.newSession(payload)`
- `acp.loadSession(payload)`
- `acp.prompt(payload)`
- `acp.cancel(payload)`
- `acp.setMode(payload)`
- `acp.onEvent(callback)` for normalized ACP notifications and lifecycle events.
- `acp.respondPermission(requestId, outcome)`

New desktop ACP types:
- JSON-RPC envelope types.
- ACP request/response types used by this client.
- Normalized event union for renderer consumption.
- Permission decision model including remember scopes.

Repo-level scripts and config additions:
- Root scripts to run desktop app and build it.
- Workspace configuration for `apps/desktop` package inclusion.
- TypeScript and lint/test configs for desktop package aligned with root standards.

## Implementation Steps
1. Documentation-first:
- Rewrite `README.md` with finalized CLI-first structure and desktop section.
2. Scaffolding:
- Create `apps/desktop` package with Electron main, preload, React renderer, Vite config.
3. ACP core:
- Implement stdio JSON-RPC transport and request manager in main process.
- Implement lifecycle and session methods.
4. IPC bridge:
- Add secure, typed preload bridge and renderer hooks/services.
5. UI:
- Build session setup view.
- Build chat + stream pane.
- Build tool call timeline.
- Build slash commands and mode/model controls.
- Build permission dialog and settings panel.
6. Error handling:
- Connection retries, malformed message handling, capability guards.
7. Testing:
- Unit tests for transport/parser, request correlation, reducers/state.
- Integration tests with a mock ACP subprocess.
- Smoke test against real `buffer --acp` when available in environment.
8. Developer experience:
- Root scripts and docs for running desktop app.
- Basic troubleshooting section in README.

## Test Cases and Scenarios
Protocol correctness:
1. Initialize success with protocol negotiation.
2. Initialize failure (unsupported version path handling).
3. New session with absolute cwd succeeds.
4. New session with non-absolute cwd yields handled error.
5. Prompt streams chunk updates and returns stop reason.
6. Cancel mid-turn returns cancelled handling path.
7. Load session only when `loadSession` capability is true.

Update rendering:
1. Tool call appears on `tool_call`, progresses via `tool_call_update`.
2. Diff tool content renders file path + before/after preview.
3. Plan updates replace prior plan state.
4. Available command updates refresh slash command palette.
5. Current mode updates synchronize selector state.

Permission handling:
1. User selects allow once.
2. User selects reject once.
3. Session-level remember auto-applies on subsequent matching request.
4. Global auto-allow bypasses prompt.
5. Cancelled prompt resolves outstanding permission with cancelled outcome.

Reliability:
1. Agent process exits unexpectedly; UI transitions to disconnected with retry action.
2. Stderr noise does not break stdout protocol stream.
3. Unknown update type is logged, surfaced in debug, and ignored safely.

## Assumptions and Defaults
- Agent command default is local `buffer --acp` and is configurable in settings.
- ACP protocol version target is `1`.
- Client capabilities default to no fs/terminal delegation in phase 1.
- Session config options API is deferred; mode/model controls rely on current fields available from this agent today.
- Desktop packaging/signing is intentionally deferred; phase 1 prioritizes functional local development workflow.
- README remains CLI-first; desktop is documented as an ACP client companion, not the primary product surface.
