# PLAN MODE Implementation Notes

## Overview

This document summarizes the implemented Plan Mode feature in `src/coding-agent`, including:
- runtime behavior,
- interactive wiring,
- RPC support,
- ACP wiring,
- and current limitations/TODOs.

## Core Behavior

Two work modes exist:
- `build` (default on startup)
- `plan` (toggle via `/plan` or `Ctrl+Tab`)

Plan mode is intentionally **non-persistent**:
- every fresh CLI run starts in `build`.

## Session Runtime Wiring

Implemented in:
- `src/coding-agent/core/agent-session.ts`

Additions:
- `type WorkMode = "build" | "plan"`
- `session.workMode` getter
- `session.setWorkMode(mode)`
- `session.toggleWorkMode()`

Behavior:
- entering `plan` snapshots current build tool set and switches to plan tool set
- leaving `plan` restores prior build snapshot (or defaults if no snapshot)

Plan tool set:
- `read`, `grep`, `find`, `ls`, `question`, `plan_create`, `implement`

## System Prompt Behavior

Implemented in:
- `src/coding-agent/core/system-prompt.ts`

`buildSystemPrompt()` now takes `workMode` and injects mode-specific guidance:
- build: execution-oriented guidance
- plan: planning/research-only guidance

## Interactive Mode Wiring

Implemented in:
- `src/coding-agent/modes/interactive/interactive-mode.ts`
- `src/coding-agent/core/keybindings.ts`
- `src/coding-agent/core/slash-commands.ts`

Added:
- `/plan` slash command (toggle)
- `Ctrl+Tab` keybinding (`toggleWorkMode` action)
- `PLAN MODE` indicator rendered below the editor only in plan mode

Kept unchanged:
- `Shift+Tab` continues to cycle thinking levels

Help output updates:
- keyboard/help text now includes plan toggle

## New Tools

## `question` tool

File:
- `src/coding-agent/core/tools/question.ts`

Purpose:
- ask structured clarifying questions with 2-3 options
- optional custom answer path

Current execution path:
- interactive mode uses UI context (`select` then optional `input`)
- if no UI context is available, tool returns an availability error

## `plan_create` tool

File:
- `src/coding-agent/core/tools/plan-create.ts`

Purpose:
- create plan markdown files in `.buffer/` under workspace root

Constraints enforced:
- file must end with `.md`
- path must remain within `.buffer`
- path traversal blocked

Workspace root:
- nearest git root if present
- else current working directory

## `implement` tool

File:
- `src/coding-agent/core/tools/implement.ts`

Purpose:
- ask a fixed 2-choice confirmation:
  - `Implement this plan now`
  - `Keep planning for now`

Behavior:
- if user selects implement:
  - stops current stream
  - switches to `build` mode
  - automatically sends: `Implement this Plan`
- if user selects keep planning:
  - stays in `plan` mode

## Tool Registry / Exports

Updated in:
- `src/coding-agent/core/tools/index.ts`
- `src/coding-agent/core/index.ts`

Added exports and runtime registration for:
- `question`
- `plan_create`

## RPC Support (What it is and what was added)

## What RPC support means

RPC mode is the headless JSON command interface (`--mode rpc`) used by external clients/integrations.  
Instead of typing in the interactive TUI, clients send commands like `get_state`, `prompt`, `set_model`, etc. and receive structured responses/events.

## What was added for plan mode

Files:
- `src/coding-agent/modes/rpc/rpc-types.ts`
- `src/coding-agent/modes/rpc/rpc-mode.ts`
- `src/coding-agent/modes/rpc/rpc-client.ts`

Changes:
- new RPC command:
  - `set_work_mode` with `{ mode: "build" | "plan" }`
- `get_state` now includes:
  - `workMode`
- RPC client helper method:
  - `setWorkMode(mode)`

This lets non-interactive callers toggle/read plan mode programmatically.

## ACP Wiring

ACP adapter files:
- `src/coding-agent/modes/acp/acp/agent.ts`
- `src/coding-agent/modes/acp/pi-rpc/process.ts`

Added:
- ACP `/plan` command
- ACP help includes `/plan`
- ACP bridge can call RPC `set_work_mode`

Behavior:
- ACP `/plan` checks current mode from RPC state
- toggles to the other mode
- emits confirmation message to client

## ACP Question Tool TODO

Current question-tool UI is interactive-first.  
A dedicated ACP desktop-native implementation is documented in:
- `TODO-QUESTION-TOOL.md`

That TODO outlines:
- proposed request/response protocol shape
- adapter handling strategy
- desktop UI integration plan

## Test/Validation Notes

Added tests:
- `test/coding-agent/tools.test.ts` includes `question` and `plan_create` coverage

Validation done:
- `pnpm exec tsc -p tsconfig.build.json --noEmit` passed

Known environment limitations in this run:
- full `tsc --noEmit` has pre-existing unrelated test typing failures in `test/buffer-ai`
- vitest worker spawn blocked by sandbox (`EPERM`)
