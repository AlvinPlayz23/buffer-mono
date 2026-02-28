# New Session Issue: Empty Model/Mode/Slash Commands on Thread Open

## Problem

When opening a thread or landing on the homepage ("Let's build" page), the **model selector**, **mode (thinking) selector**, and **slash command autocomplete** are all empty. They only populate after the first prompt is sent, because that's when `createSessionForThread()` or `loadSessionForThread()` is called — and those are the functions that call the ACP `session/new` or `session/load` RPC, which returns the available models, modes, and commands.

**User expectation:** All three should be usable immediately upon opening a thread, before any prompt is sent.

## Root Cause

1. `openThread()` calls `resetConversationView("")` which **clears** `models`, `modes`, `availableCommands` to empty arrays.
2. `resetConversationView` also sets `activeSessionId = ""`, keeping the UI on the "Let's build" empty state.
3. Models/modes/commands only come back from the ACP backend as part of `session/new` or `session/load` RPC responses.
4. Those RPCs are only called in `createSessionForThread()` / `loadSessionForThread()`, which are deferred until `sendPrompt()`.

### Flow diagram

```
openThread(threadId)
  → resetConversationView("")     ← clears models/modes/commands
  → refreshSessions(threadId)    ← just lists sessions, no metadata
  → (no session created)         ← selectors are empty

sendPrompt()  (first message)
  → createSessionForThread()
    → api.newSession()           ← returns models/modes/commands
    → setState({ models, modes }) ← NOW selectors populate
```

## Attempted Fix #1: Eager `createSessionForThread` in `openThread`

**What we did:** Called `createSessionForThread(selected)` at the end of `openThread()`.

**Result:** Models/modes populated, BUT the UI navigated away from "Let's build" into the session view because `createSessionForThread` calls `resetConversationView(sid)` which sets `activeSessionId`.

**Why it failed:** `createSessionForThread` is designed to fully activate a session, not just fetch metadata.

## Attempted Fix #2: Pre-warm session via ref (current state)

**What we did:**
- Added `preWarmedSessionRef` to hold a background session ID without activating it in the UI.
- In `openThread`, called `api.newSession()` directly, stored the session ID in the ref, and populated models/modes/commands in state — but did NOT set `activeSessionId`.
- In `sendPrompt`, if `preWarmedSessionRef.current` exists, reuse it instead of creating a new session.

**Code added:**
```tsx
// In openThread, after refreshSessions:
if (acpStatusRef.current === "connected") {
  const result = await api.newSession({ threadId, cwd, mcpServers: [] });
  preWarmedSessionRef.current = String(result?.sessionId || "");
  // populate models/modes from result...
  setState((prev) => ({ ...prev, modes, currentModeId, models, currentModelId }));
}

// In sendPrompt:
if (!sessionId && preWarmedSessionRef.current) {
  sessionId = preWarmedSessionRef.current;
  preWarmedSessionRef.current = "";
  setActiveSessionId(sessionId);
  // ...reuse it
}
```

**Result:** Still not working as expected. Possible reasons:
- The `api.newSession()` call may not return models/modes when called this way (Buffer's ACP implementation may stream them as `session_update` events rather than in the RPC response).
- The `session_update` events carrying `available_commands_update` / model/mode data are filtered out by the event reducer because `state.sessionId` is empty (line in `reduceEvent`: `if (state.sessionId && event.params.sessionId !== state.sessionId) return state;`).
- Timing: `acpStatusRef.current` may not be `"connected"` yet when `openThread` runs during startup.

## Key Blocker: Session Update Event Filtering

In `state.ts`, line 99:
```ts
if (state.sessionId && event.params.sessionId !== state.sessionId) return state;
```

This means if the pre-warmed session sends `session_update` events with models/modes/commands, they'll be **dropped** because `state.sessionId` is `""` (we intentionally didn't set it to stay on "Let's build").

Wait — actually this line says: if `state.sessionId` is empty, it WON'T filter (the condition is falsy). So events should flow through. But the issue might be that models/modes come in the **RPC response** for `session/new`, not as streamed events.

## Possible Next Steps

1. **Debug what `api.newSession()` actually returns** — log the full response to see if `models` and `modes` are present, or if Buffer sends them separately as session updates.

2. **Set `state.sessionId` without `activeSessionId`** — Decouple the event filtering ID from the UI-active session:
   - Set `state.sessionId = preWarmedSid` so the reducer accepts session_update events
   - Keep `activeSessionId = ""` so the UI stays on "Let's build"
   - This requires separating `sessionId` (for event routing) from `activeSessionId` (for UI)

3. **Listen for session_update events with models/modes regardless of sessionId** — Modify the reducer to always accept model/mode/command updates even when sessionId doesn't match.

4. **Query models/modes via a separate ACP RPC** — Check if Buffer exposes a way to get available models/modes without creating a session (unlikely given ACP protocol design).

5. **Cache models/modes from the last session** — Store them in electron's persistent data and load them as defaults so selectors are never empty.

## Files Involved

- `apps/desktop/src/App.tsx` — UI logic, `openThread`, `sendPrompt`, `resetConversationView`
- `apps/desktop/src/lib/state.ts` — `reduceEvent` with sessionId filtering (line 99)
- `apps/desktop/electron/main.cjs` — IPC handlers for `acp:new-session`, `acp:load-session`
- `apps/desktop/src/types/acp.ts` — Type definitions
- `apps/desktop/src/lib/api.ts` — API wrapper

## Current State

Pre-warm code is in place but not producing the desired result. The most promising next step is **#2** (decouple `state.sessionId` from `activeSessionId`) or **#5** (cache from last session) as a reliable fallback.
