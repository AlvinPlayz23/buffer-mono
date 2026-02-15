# buffer-agent

Buffer coding-agent CLI repository. This repo contains the CLI runtime, model/provider layer, agent core, TUI, docs, examples, and an Electron desktop ACP client.

## What is in this repo

- `src/coding-agent`: Buffer CLI, SDK surface, modes (`text`, `print`, `rpc`, `acp`)
- `src/buffer-ai`: model providers, auth integrations, streaming adapters
- `src/buffer-agent-core`: agent loop and tool orchestration runtime
- `src/buffer-tui`: terminal UI toolkit and components used by interactive mode
- `apps/desktop`: Electron desktop client that talks to Buffer over ACP (`buffer --acp`)
- `test/*`: consolidated tests across CLI, core, AI, and TUI
- `docs/`: end-user and developer documentation
- `examples/`: extension and SDK examples

## Requirements

- Node.js `>= 20`
- pnpm

## Setup and core commands

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run check
```

## Running Buffer CLI

Interactive mode:

```bash
pnpm run build
node dist/coding-agent/cli.js
```

Non-interactive/print mode:

```bash
node dist/coding-agent/cli.js --print "List all TypeScript files in src/"
```

ACP server mode (for clients/editors):

```bash
node dist/coding-agent/cli.js --acp
```

`--acp` starts a JSON-RPC ACP server over stdio, suitable for desktop/editor client integration.

## Desktop app (`apps/desktop`)

The repo includes an Electron desktop client that runs Buffer as an ACP subprocess (`buffer --acp`) and renders sessions in a GUI.

Current desktop capabilities:

- ACP lifecycle: `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/set_mode`
- Streaming `session/update` handling for message chunks, tool calls, plans, commands, and mode updates
- Session-level permission decisions with optional global auto-allow in settings

Run desktop app in development:

```bash
pnpm run desktop:dev
```

If Electron fails to install correctly, allow/rebuild blocked build scripts and retry:

```bash
pnpm run desktop:repair
pnpm run desktop:dev
```

Build desktop renderer package:

```bash
pnpm run desktop:build
```

Run desktop tests:

```bash
pnpm run desktop:test
```

## Notes

- npm package name: `buffer-agent`
- CLI binary: `buffer`
- ACP compatibility target in this repo is protocol version `1`
- Phase-1 desktop focus is local development flow (not signed installers/auto-update)
