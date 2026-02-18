# Think UI Notice

This note captures the work done for the temporary "thinking blocks" feature and how it related to ACP streaming.

## Goal

Display model reasoning segments separately in desktop chat UI, based on `<think> ... </think>` markers or ACP thought updates.

## Implemented Approach (Now Disabled)

### 1. UI layer

- Added dedicated "Thinking" message block rendering in chat (`<details>`-style collapsible section).
- Thought messages were shown in a separate visual style from assistant/user bubbles.

### 2. State/reducer layer

- Added parsing logic in the desktop reducer for `agent_message_chunk` text:
  - Detect `<think>` and `</think>` boundaries.
  - Route text inside the range to `thought` messages.
  - Route text outside to `assistant` messages.
  - Handle malformed streaming cases (for example receiving `</think>` before a visible `<think>` in current chunk).
- Added a small state flag to track whether streaming is currently inside a think segment across chunks.

### 3. Existing ACP update integration used

- `session/update` with:
  - `agent_message_chunk` (primary source for streamed text)
  - `thought_chunk` / `agent_thought_chunk` (already supported in reducer)

## ACP Relation

- ACP itself streams arbitrary text content via `agent_message_chunk`; think-tag interpretation is a **client-side policy**.
- Some models/providers include think tags in output text; others do not.
- Streaming chunk boundaries are not guaranteed to align with tag boundaries, so parsing must be incremental and chunk-safe.

## Known Issue Observed

- In some runs, `</think>` appeared without a preceding `<think>` in visible stream order.
- This caused inconsistent separation and occasional text corruption symptoms when mixed with chunk merge logic.

## Current Status

- Think-block feature is intentionally disabled in desktop UI for now.
- Desktop currently renders assistant output without special think-tag UI handling.
- This document preserves the architecture so it can be reintroduced later with stronger stream normalization and tests.

## Suggested Reintroduction Plan (Later)

1. Add dev-only raw chunk trace for `agent_message_chunk` sequence validation.
2. Normalize chunk stream before message merge (single pass parser).
3. Add unit tests for edge cases:
   - split `<think>` across chunks
   - split `</think>` across chunks
   - missing opening tag
   - nested or repeated think markers
4. Re-enable dedicated thinking UI rendering.
