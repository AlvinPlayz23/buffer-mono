# ca-cli

Monorepo for Buffer CLI and supporting packages.

## Overview

`ca-cli` contains a terminal-first coding assistant stack:

- `packages/coding-agent`: main Buffer CLI (`buffer` command)
- `packages/tui`: terminal UI framework used by the agent
- `packages/ai`: model/provider integration layer
- `packages/agent`: agent runtime/core orchestration

## Requirements

- Node.js `>= 20`
- `pnpm`

## Install

```bash
pnpm install
```

## Build

```bash
pnpm build
```

## Dev

```bash
pnpm dev
```

## Test

```bash
pnpm test
```

## Useful workspace commands

From repo root:

```bash
pnpm --dir packages/coding-agent build
pnpm --dir packages/tui build
pnpm --dir packages/coding-agent test
pnpm --dir packages/tui test
```

## CLI quick start

Build and run Buffer CLI:

```bash
pnpm --dir packages/coding-agent build
node packages/coding-agent/dist/cli.js
```

## Recent changes in this session

### Terminal view mode

- Added configurable terminal view mode with persistence:
  - `alt-mode` (default)
  - `text-buffer`
- Added `/view` command selector for mode switching.
- Added `View mode` entry in `/settings`.
- Added TUI/terminal support for alternate screen switching.

### Help and startup UX

- Added `/help` command.
- `/help` now prints the shortcut list in a boxed panel with muted gray text.
- Startup header no longer prints the full shortcut list under the logo; it now points users to `/help`.

### Bash mode behavior

- Added `terminal.enableBashMode` setting (default `false`).
- Bash command input (`!command`) is now disabled unless explicitly enabled in `/settings`.
- Removed special `!!` interactive mode behavior.

### Visual style simplification

- Removed filled background boxes from core chat/tool surfaces.
- Moved visual status signaling to outline colors:
  - gray = neutral
  - blue = info/running/highlighted sections
  - yellow = warning
  - red = error
- Kept body text in muted gray for a flatter terminal look.

### Docs and tests updated

- Updated `packages/coding-agent/README.md` and relevant docs under `packages/coding-agent/docs`.
- Added/updated tests for slash commands, settings behavior, and view mode.

## Notes

- This repo may contain uncommitted local work while iterating. Check `git status` before packaging or publishing.
- For detailed Buffer CLI usage and command docs, see `packages/coding-agent/README.md`.
