# TODO: Question Tool ACP UI Architecture

## Goal
Add first-class ACP desktop support for the `question` tool so users can answer structured questions with:
- 2-3 choices
- one "Own answer" path for free text

Current implementation is interactive-first and uses extension UI context (`select` + `input`) in the coding agent runtime.

## Current Behavior
- `question` tool is available in plan mode.
- Interactive mode: fully supported through in-terminal selector/input UI.
- RPC mode: works if the host supports `extension_ui_request`/`extension_ui_response`.
- ACP desktop: not yet implemented as a native flow.

## Proposed ACP Protocol Shape
1. Add new ACP session update type (adapter-level), for example:
   - `sessionUpdate: "question_request"`
   - payload:
     - `id: string`
     - `title: string` (question text)
     - `options: string[]` (2-3)
     - `allowCustom: boolean`

2. Add response message from client:
   - `question_response`
   - payload:
     - `id: string`
     - either `selectedIndex: number`
     - or `customText: string`
     - or `cancelled: true`

3. Adapter maps response back to pending `question` tool promise.

## ACP Adapter Changes
- `src/coding-agent/modes/acp/acp/session.ts`
  - Track pending question requests by id.
  - Emit `question_request` updates.
  - Resolve/reject pending requests on client responses.
- `src/coding-agent/modes/acp/acp/agent.ts`
  - Handle a new client request/notification carrying `question_response`.
- `src/coding-agent/modes/acp/pi-rpc/process.ts`
  - Optionally forward generic UI requests if reused instead of ACP-specific question messages.

## Desktop Client Changes (Later)
- Add UI modal for `question_request`:
  - keyboard-selectable options
  - explicit "Own answer" branch opening text input
  - cancel action
- Return `question_response` to ACP adapter.

## Validation
- Interactive mode still passes existing behavior.
- ACP path can complete a question round-trip without fallback errors.
- Cancel path returns a deterministic tool error message ("Question was cancelled by user.").
