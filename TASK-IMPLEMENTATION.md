# Task System Migration: oh-my-pi → buffer

Port the task/subagent system from `oh-my-pi/packages/coding-agent/src/task/` into buffer's `src/coding-agent/core/task/`. This is a migration, not a rewrite — adapt oh-my-pi's existing code to buffer's import aliases and patterns.

---

## Source → Destination File Map

### Direct ports (adapt imports only)

| oh-my-pi source | buffer destination | Migration notes |
|---|---|---|
| `src/task/types.ts` | `src/coding-agent/core/task/types.ts` | Replace `@oh-my-pi/pi-agent-core` → `#buffer-agent-core`, `@oh-my-pi/pi-ai` → `#buffer-ai`, `@oh-my-pi/pi-utils` → inline `process.env`. Remove `$env` helper. Remove `NestedRepoPatch`/worktree imports. Keep `@sinclair/typebox` (already in buffer's deps). |
| `src/task/parallel.ts` | `src/coding-agent/core/task/parallel.ts` | **Copy as-is.** Zero external dependencies. |
| `src/task/template.ts` | `src/coding-agent/core/task/template.ts` | Replace `@oh-my-pi/pi-utils` `prompt.render()` with a simple string replacement function or import buffer's equivalent. Replace `with { type: "text" }` Bun imports with `readFileSync`. |
| `src/task/agents.ts` | `src/coding-agent/core/task/agents.ts` | Replace `@oh-my-pi/pi-ai` `Effort` → buffer's equivalent. Replace `@oh-my-pi/pi-utils` `parseFrontmatter` → use buffer's existing `parseFrontmatter` from `src/coding-agent/utils/frontmatter.ts`. Replace `prompt` → port or inline. Replace Bun `with { type: "text" }` → Node `readFileSync(new URL(...))`. |
| `src/task/discovery.ts` | `src/coding-agent/core/task/discovery.ts` | Replace `~/.omp/agent/agents/` → `~/.buffer/agent/agents/`. Replace `.omp/agents/` → `.buffer/agents/`. Replace oh-my-pi config helpers with buffer's `getAgentDir()` equivalent. |
| `src/task/subprocess-tool-registry.ts` | `src/coding-agent/core/task/subprocess-tool-registry.ts` | Replace `@oh-my-pi/pi-agent-core` → `#buffer-agent-core`. Minimal changes. |
| `src/task/output-manager.ts` | `src/coding-agent/core/task/output-manager.ts` | Replace `Snowflake` ID gen with `crypto.randomUUID()`. Replace `Bun.write` → Node `fs.writeFile`. |
| `src/task/simple-mode.ts` | `src/coding-agent/core/task/simple-mode.ts` | Direct port, import path changes only. |
| `src/task/render.ts` | `src/coding-agent/core/task/render.ts` | Port directly, replace oh-my-pi prompt helpers. |
| `src/task/name-generator.ts` | `src/coding-agent/core/task/name-generator.ts` | **Copy as-is.** Pure utility. |

### Heavy adaptation required

| oh-my-pi source | buffer destination | Migration notes |
|---|---|---|
| `src/task/executor.ts` | `src/coding-agent/core/task/executor.ts` | **Heaviest port.** Replace: `createAgentSession` import path, `SessionManager` → buffer's, `ModelRegistry` → buffer's, `AuthStorage` → buffer's, `MCPManager` → buffer's MCP setup, `Settings`/`SETTINGS_SCHEMA` → buffer's `SettingsManager`, `EventBus` → buffer's, `callTool`/`CustomTool`/`Skill`/`PromptTemplate` → buffer equivalents. Core logic (progress tracking, abort handling, output finalization, retry loop) stays the same. |
| `src/task/index.ts` | `src/coding-agent/core/task/index.ts` | Replace: `AgentTool`/`AgentToolResult` → `#buffer-agent-core`, `ToolSession` → buffer's session type, `Snowflake` → `crypto.randomUUID()`, `$env`/`prompt` → inline or buffer utils, `Bun.file()`/`Bun.write()` → Node `fs`. Remove git worktree/isolation imports and code paths. Remove `resolveIsolationBackendForTaskExecution`. Keep: validation, concurrency dispatch, summary rendering, usage aggregation. |
| `src/tools/submit-result.ts` | `src/coding-agent/core/task/submit-result.ts` | Replace `AgentTool`/`AgentToolContext` → buffer's tool types. Replace `@oh-my-pi/pi-ai/utils/schema` → inline or port the schema helpers. Keep: AJV validation, retry on schema failure, subprocess tool registry integration. |

### Prompt files (copy + rename references)

| oh-my-pi source | buffer destination |
|---|---|
| `src/prompts/agents/task.md` | `src/coding-agent/core/prompts/agents/task.md` |
| `src/prompts/agents/explore.md` | `src/coding-agent/core/prompts/agents/explore.md` |
| `src/prompts/agents/plan.md` | `src/coding-agent/core/prompts/agents/plan.md` |
| `src/prompts/agents/reviewer.md` | `src/coding-agent/core/prompts/agents/reviewer.md` |
| `src/prompts/agents/designer.md` | `src/coding-agent/core/prompts/agents/designer.md` |
| `src/prompts/agents/librarian.md` | `src/coding-agent/core/prompts/agents/librarian.md` |
| `src/prompts/agents/frontmatter.md` | `src/coding-agent/core/prompts/agents/frontmatter.md` |
| `src/prompts/agents/init.md` | `src/coding-agent/core/prompts/agents/init.md` |
| `src/prompts/system/subagent-user-prompt.md` | `src/coding-agent/core/prompts/system/subagent-user-prompt.md` |
| `src/prompts/system/subagent-system-prompt.md` | `src/coding-agent/core/prompts/system/subagent-system-prompt.md` |
| `src/prompts/system/subagent-submit-reminder.md` | `src/coding-agent/core/prompts/system/subagent-submit-reminder.md` |
| `src/prompts/system/plan-mode-subagent.md` | `src/coding-agent/core/prompts/system/plan-mode-subagent.md` |
| `src/prompts/tools/task.md` | `src/coding-agent/core/prompts/tools/task.md` |
| `src/prompts/tools/task-summary.md` | `src/coding-agent/core/prompts/tools/task-summary.md` |

Replace any `omp` / `oh-my-pi` / `pi` references in prompt text with `buffer` equivalents.

### Skipped files (not porting)

| oh-my-pi source | Reason |
|---|---|
| `src/task/worktree.ts` | Git worktree isolation — skip for now |
| `src/task/isolation-backend.ts` | FUSE/ProjFS isolation backends — skip |
| `src/task/omp-command.ts` | oh-my-pi CLI-specific command — not applicable |
| `src/task/commands.ts` | oh-my-pi slash command handlers — rewrite for buffer |

---

## Import Translation Table

Every ported file needs these import swaps:

| oh-my-pi import | buffer equivalent |
|---|---|
| `@oh-my-pi/pi-agent-core` | `#buffer-agent-core` |
| `@oh-my-pi/pi-ai` | `#buffer-ai` |
| `@oh-my-pi/pi-utils` → `$env` | `process.env` |
| `@oh-my-pi/pi-utils` → `prompt.render()` | Port `prompt.render()` or use simple Mustache-like replacer |
| `@oh-my-pi/pi-utils` → `Snowflake` | `crypto.randomUUID()` |
| `@oh-my-pi/pi-utils` → `logger` | Buffer's logger or `console` |
| `@oh-my-pi/pi-utils` → `parseFrontmatter` | Use buffer's existing `parseFrontmatter` from `src/coding-agent/utils/frontmatter.ts` |
| `@oh-my-pi/pi-utils` → `untilAborted` | Port inline (small async helper) |
| `import ... with { type: "text" }` (Bun) | `fs.readFileSync(new URL('...', import.meta.url), 'utf-8')` |
| `Bun.file()` / `Bun.write()` | Node `fs.readFile()` / `fs.writeFile()` |
| `ToolSession` (oh-my-pi) | `AgentSession` (buffer) |
| `createAgentSession()` (oh-my-pi) | `createAgentSession()` (buffer's `sdk.ts`) |
| `Settings` / `SETTINGS_SCHEMA` | `SettingsManager` (buffer) |
| `MCPManager` | Buffer's MCP proxy setup |
| `AgentTool<TSchema>` | Same name in `#buffer-agent-core` (verify interface match) |

---

## Buffer Files to Modify

| File | Change |
|------|--------|
| `src/coding-agent/core/tools/index.ts` | Add `task` to `allTools`, `ToolName`, `createAllTools()` |
| `src/coding-agent/core/agent-session.ts` | Wire `createTaskTool()` in `_buildRuntime()`, add task EventBus, expose `listTaskAgents()`, add `task` to default build-mode tool names |
| `src/coding-agent/core/settings-manager.ts` | Add `tasks` block: `maxConcurrency` (3), `maxRecursionDepth` (2), `showProgress` (true), `maxOutputBytes` (500000), `maxOutputLines` (5000) |
| `src/coding-agent/core/slash-commands.ts` | Add `/agents` and `/tasks` entries |
| `src/coding-agent/modes/interactive/interactive-mode.ts` | Subscribe to task EventBus channels, show `TaskProgressComponent`, handle `/agents` and `/tasks` commands |
| `src/coding-agent/modes/interactive/components/tool-execution.ts` | Show inline task status when `toolName === "task"` |

---

## New Buffer-Only Files

| File | Purpose |
|------|---------|
| `src/coding-agent/modes/interactive/components/task-progress.ts` | TUI progress panel: `WaveLoader` header + per-subagent `ToolPill` rows with status/tool/elapsed |

---

## Migration Order

Work bottom-up through the dependency chain:

```
1. Copy prompt .md files (zero deps, just rename omp/pi references to buffer)
   - agents: task, explore, plan, reviewer, designer, librarian, frontmatter, init
   - system: subagent-user-prompt, subagent-system-prompt, subagent-submit-reminder, plan-mode-subagent
   - tools: task, task-summary
2. parallel.ts (copy as-is)
3. name-generator.ts (copy as-is)
4. simple-mode.ts (import fixes only)
5. types.ts (swap imports, remove worktree types)
6. subprocess-tool-registry.ts (swap imports)
7. output-manager.ts (Snowflake → crypto.randomUUID, Bun → Node fs)
8. template.ts (swap prompt.render, Bun text imports → readFileSync)
9. agents.ts (swap imports, Bun text imports → readFileSync)
10. discovery.ts (swap paths ~/.omp → ~/.buffer, config helpers)
11. render.ts (swap prompt helpers)
12. submit-result.ts (swap tool interface, keep AJV validation)
13. executor.ts (heaviest — swap session/model/settings/MCP/auth)
14. index.ts (swap tool interface, remove worktree/isolation code paths)
15. Wire into buffer: tools/index.ts, agent-session.ts, settings-manager.ts
16. Slash commands: /agents, /tasks
17. TUI: task-progress.ts + interactive-mode.ts wiring
```

---

## Key Differences to Handle During Port

### 1. Session creation
oh-my-pi's `createAgentSession()` and buffer's `createAgentSession()` have different option shapes. Map the fields:
- oh-my-pi `toolNames` → buffer's tool filtering in `_buildRuntime()`
- oh-my-pi `requireSubmitResultTool` → buffer's `customTools` array
- oh-my-pi `taskDepth` → pass through options or env
- oh-my-pi `spawns` → pass through options or env

### 2. Tool interface
Verify `AgentTool<TSchema>` in `#buffer-agent-core` matches oh-my-pi's shape:
- `name`, `description`, `parameters` (TypeBox schema)
- `execute(toolCallId, params, signal, onUpdate)` → `AgentToolResult`
- If different, create an adapter layer

### 3. Settings access
oh-my-pi uses `session.settings.get("task.maxConcurrency")` dot-path access. Buffer uses `settingsManager.getTaskMaxConcurrency()` typed getters. Add the getters to `SettingsManager`.

### 4. Bun → Node
All `Bun.file()`, `Bun.write()`, `import ... with { type: "text" }` must become Node equivalents. This is the most tedious but straightforward part of the port.

### 5. Worktree removal
Delete all code paths involving:
- `isolated` param handling
- `worktree.ts` imports
- `NestedRepoPatch` types
- `captureBaseline`, `createWorktree`, `applyPatches`, `mergeBranches`
- `resolveIsolationBackendForTaskExecution`

These code paths are in `index.ts` and `executor.ts` — strip them and simplify to always use parent CWD.

---

## Safety Rules (carried over from oh-my-pi)

- **Concurrency 1** for agents with mutating tools (edit/write/bash) — no worktree = no parallel writes
- **Max recursion depth 2** — strip `task` tool from children at limit
- **Missing submit_result** — inject reminder prompt up to 3x, then synthesize failure
- **Output caps** — 500KB / 5000 lines per child
- **No extension inheritance** — child sessions run headless

---

## TUI Integration (buffer-specific)

```
▁▂▃ Delegating to 3 subagents…

▐ explore ▌ auth-flow · grep /validateToken/ · 4s
▐ explore ▌ db-schema · read schema.prisma · 2s
▐ task ▌ refactor-api · edit routes.ts · 7s    ✓
```

Subscribe to ported EventBus channels in `interactive-mode.ts`, render via `TaskProgressComponent` using existing `WaveLoader` + `ToolPill` components.
