# Buffer Feature Matrix vs ACP

Legend:
- `ACP Applicable`: whether the feature concept can/should exist in ACP mode.
- `ACP-MERGE`: `true` means implemented in current ACP path; `false` means not implemented (or explicitly not supported).

## Core Modes and Runtime

| Feature | ACP Applicable | ACP-MERGE | Notes |
|---|---|---:|---|
| Interactive TUI mode (`text`) | No | false | TUI-only mode, not ACP transport. |
| Print mode (`--print`) | No | false | One-shot CLI output mode. |
| RPC mode (`--mode rpc`) | No | false | Separate protocol from ACP. |
| ACP server mode (`--acp`) | Yes | true | Runs JSON-RPC ACP over stdio. |
| ACP raw structured logging (`--acp-log`) | Yes | true | ACP traffic/events logged to stderr when ACP is enabled. |

## Session and Conversation

| Feature | ACP Applicable | ACP-MERGE | Notes |
|---|---|---:|---|
| Create session | Yes | true | `session/new` implemented. |
| Load/resume existing session | Yes | true | `session/load` implemented. |
| Multi-turn prompt conversation | Yes | true | `session/prompt` + streaming updates. |
| Cancel in-flight turn | Yes | true | `session/cancel` implemented. |
| Session persistence to same storage model | Yes | true | ACP adapter stores/reloads using session files/map. |
| Session tree navigation (`/tree`) | Yes | false | Interactive command, not ACP-exposed today. |
| Fork session (`/fork`) | Yes | false | Interactive command, not ACP-exposed today. |
| Session rename (`/name`) | Yes | false | Not exposed in ACP adapter command handling. |

## Models and Thinking

| Feature | ACP Applicable | ACP-MERGE | Notes |
|---|---|---:|---|
| Return available/current models at session start | Yes | true | Included in `session/new` and `session/load` responses. |
| Return available/current thinking mode | Yes | true | Included and updateable via `session/set_mode`. |
| Set thinking mode | Yes | true | `session/set_mode` implemented. |
| Direct ACP RPC set-model endpoint | Yes | false | `unstable_setSessionModel` exists internally but not exposed by ACP connection router. |
| Slash-command model switch (`/model`) in ACP adapter | Yes | false | Not handled by ACP adapter built-in command parser. |

## Tools, Streaming, Permissions

| Feature | ACP Applicable | ACP-MERGE | Notes |
|---|---|---:|---|
| Tool execution via agent tools (`read/bash/edit/write/grep/find/ls`) | Yes | true | ACP streams tool calls and updates. |
| Tool call lifecycle updates (`tool_call`, `tool_call_update`) | Yes | true | Emitted from ACP session bridge. |
| Assistant text streaming | Yes | true | `agent_message_chunk` streaming implemented. |
| User replay streaming on load | Yes | true | `user_message_chunk` emitted on `session/load`. |
| Thought streaming blocks | Yes | false | Adapter currently focuses on text/tool streams; thought variants are limited. |
| Permission request round-trip | Yes | true | `session/request_permission` + response handling implemented. |
| Plan updates (`plan`) | Yes | true | Supported by reducer/UI path in desktop and ACP stream format. |
| Available slash commands updates | Yes | true | `available_commands_update` emitted. |

## Slash Commands (CLI Built-ins) vs ACP

| Slash Command | ACP Applicable | ACP-MERGE | Notes |
|---|---|---:|---|
| `/compact` | Yes | true | Implemented in ACP adapter. |
| `/session` | Yes | true | Implemented in ACP adapter. |
| `/changelog` | Yes | true | Implemented in ACP adapter. |
| `/help` | Yes | true | Implemented in ACP adapter. |
| `/export` | Yes | true | Implemented in ACP adapter. |
| `/autocompact` | Yes | true | Implemented in ACP adapter. |
| `/steering` | Yes | true | Implemented in ACP adapter. |
| `/follow-up` | Yes | true | Implemented in ACP adapter. |
| `/view` | Yes | false | Explicitly marked unsupported in ACP. |
| `/model` | Yes | false | Not wired in ACP adapter command parser. |
| `/settings` | No | false | Interactive UI concern. |
| `/init-memory` | Yes | false | Not implemented in ACP adapter. |
| `/scoped-models` | Yes | false | Not implemented in ACP adapter. |
| `/bg` | Yes | false | Not implemented in ACP adapter. |
| `/jobs` | Yes | false | Not implemented in ACP adapter. |
| `/share` | Yes | false | Not implemented in ACP adapter. |
| `/copy` | No | false | Interactive clipboard UX concern. |
| `/name` | Yes | false | Not implemented in ACP adapter. |
| `/hotkeys` | No | false | Interactive UI concern. |
| `/fork` | Yes | false | Not implemented in ACP adapter. |
| `/tree` | Yes | false | Not implemented in ACP adapter. |
| `/login` | Yes | false | Not implemented in ACP adapter. |
| `/logout` | Yes | false | Not implemented in ACP adapter. |
| `/connect` | Yes | false | Not implemented in ACP adapter. |
| `/new` | Yes | false | Session creation is ACP method-level (`session/new`), not slash in adapter. |
| `/resume` | Yes | false | Session load is ACP method-level (`session/load`), not slash in adapter. |
| `/reload` | Yes | false | Not implemented in ACP adapter. |
| `/quit` | No | false | Client/UI process lifecycle concern. |

## Notes on Source of Truth

- CLI feature/flags source: `src/coding-agent/cli/args.ts`
- ACP adapter implementation source: `src/coding-agent/modes/acp/acp/agent.ts`
- ACP protocol routing source: `src/coding-agent/modes/acp/sdk.ts`
- Interactive slash command list source: `src/coding-agent/core/slash-commands.ts`
