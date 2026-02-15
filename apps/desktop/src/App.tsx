import { useEffect, useMemo, useState } from "react";
import { getDesktopApi } from "./lib/api";
import { initialState, reduceEvent, type AppState } from "./lib/state";
import type { AppSettings, DesktopEvent, PermissionOption, PermissionOutcome } from "./types/acp";

const api = getDesktopApi();

type RememberMap = Record<string, string>;

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [settings, setSettings] = useState<AppSettings>({
    acpLaunchCommand: "buffer --acp",
    cwd: "",
    autoAllow: false
  });
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [loadSessionId, setLoadSessionId] = useState("");
  const [cwdInput, setCwdInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [rememberChoice, setRememberChoice] = useState(false);
  const [sessionRemember, setSessionRemember] = useState<RememberMap>({});
  const [selectedModelId, setSelectedModelId] = useState("");
  const [initInfo, setInitInfo] = useState<{ agentName?: string; protocolVersion?: number }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      const loaded = await api.getSettings();
      setSettings(loaded);
      setCwdInput(loaded.cwd);
      unlisten = api.onEvent((event: DesktopEvent) => {
        if (event.type === "permission_request") {
          const kind = event.params.toolCall?.kind || "other";
          const rememberedOption = sessionRemember[kind];
          const available = event.params.options.find((option) => option.optionId === rememberedOption);
          if (settings.autoAllow) {
            const firstAllow = event.params.options.find((option) => option.kind.startsWith("allow"));
            if (firstAllow) {
              void api.respondPermission(event.requestId, {
                outcome: "selected",
                optionId: firstAllow.optionId
              });
              return;
            }
          }
          if (available) {
            void api.respondPermission(event.requestId, {
              outcome: "selected",
              optionId: available.optionId
            });
            return;
          }
        }
        setState((prev) => reduceEvent(prev, event));
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [sessionRemember, settings.autoAllow]);

  const toolCalls = useMemo(() => Object.values(state.toolCalls), [state.toolCalls]);

  async function connectAndInitialize() {
    setError("");
    setBusy(true);
    try {
      await api.start({
        launchCommand: settings.acpLaunchCommand,
        cwd: cwdInput || settings.cwd
      });

      const initialized = await api.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false
        },
        clientInfo: {
          name: "buffer-desktop",
          title: "Buffer Desktop",
          version: "0.1.0"
        }
      });

      setInitInfo({
        agentName: initialized?.agentInfo?.name,
        protocolVersion: initialized?.protocolVersion
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize ACP");
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    if (!cwdInput) {
      setError("cwd is required and must be absolute.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api.newSession({ cwd: cwdInput, mcpServers: [] });
      const sessionId = String(result?.sessionId || "");
      setCurrentSessionId(sessionId);
      setState((prev) => ({ ...prev, sessionId }));
      const modes = Array.isArray(result?.modes?.availableModes) ? result.modes.availableModes : [];
      const currentModeId = String(result?.modes?.currentModeId || "");
      const models = Array.isArray(result?.models?.availableModels) ? result.models.availableModels : [];
      const currentModelId = String(result?.models?.currentModelId || "");
      setSelectedModelId(currentModelId);
      setState((prev) => ({ ...prev, modes, currentModeId, models, currentModelId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  async function loadSession() {
    if (!loadSessionId || !cwdInput) {
      setError("load requires both session id and absolute cwd.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api.loadSession({ sessionId: loadSessionId, cwd: cwdInput, mcpServers: [] });
      setCurrentSessionId(loadSessionId);
      setState((prev) => ({ ...prev, sessionId: loadSessionId }));
      const modes = Array.isArray(result?.modes?.availableModes) ? result.modes.availableModes : [];
      const currentModeId = String(result?.modes?.currentModeId || "");
      const models = Array.isArray(result?.models?.availableModels) ? result.models.availableModels : [];
      const currentModelId = String(result?.models?.currentModelId || "");
      setSelectedModelId(currentModelId);
      setState((prev) => ({ ...prev, modes, currentModeId, models, currentModelId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setBusy(false);
    }
  }

  async function sendPrompt() {
    if (!currentSessionId || !promptInput.trim()) return;
    setError("");
    setBusy(true);
    try {
      await api.prompt({
        sessionId: currentSessionId,
        prompt: [{ type: "text", text: promptInput }]
      });
      setPromptInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPrompt() {
    if (!currentSessionId) return;
    await api.cancel({ sessionId: currentSessionId });
  }

  async function changeMode(modeId: string) {
    if (!currentSessionId || !modeId) return;
    setError("");
    try {
      await api.setMode({ sessionId: currentSessionId, modeId });
      setState((prev) => ({ ...prev, currentModeId: modeId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set mode");
    }
  }

  async function changeModel(modelId: string) {
    if (!currentSessionId || !modelId) return;
    setError("");
    try {
      // Current ACP adapter exposes model changes through slash command.
      await api.prompt({
        sessionId: currentSessionId,
        prompt: [{ type: "text", text: `/model ${modelId}` }]
      });
      setSelectedModelId(modelId);
      setState((prev) => ({ ...prev, currentModelId: modelId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set model");
    }
  }

  async function saveClientSettings(next: AppSettings) {
    const saved = await api.saveSettings(next);
    setSettings(saved);
  }

  async function respondPermission(option: PermissionOption | null, forceCancelled = false) {
    const permissionRequest = state.permissionRequest;
    if (!permissionRequest) return;
    let outcome: PermissionOutcome;
    if (forceCancelled || !option) {
      outcome = { outcome: "cancelled" };
    } else {
      outcome = { outcome: "selected", optionId: option.optionId };
      const rememberKey = permissionRequest.toolKind;
      if (rememberChoice && typeof rememberKey === "string" && rememberKey.length > 0) {
        setSessionRemember((prev) => ({ ...prev, [rememberKey]: option.optionId }));
      }
    }
    await api.respondPermission(permissionRequest.requestId, outcome);
    setRememberChoice(false);
    setState((prev) => ({ ...prev, permissionRequest: null }));
  }

  return (
    <div className="layout">
      <header className="topbar">
        <h1>Buffer Desktop ACP Client</h1>
        <div className="status">
          <span>{state.connection}</span>
          {initInfo.agentName && <span>{initInfo.agentName} (v{initInfo.protocolVersion})</span>}
        </div>
      </header>

      <section className="panel settings">
        <h2>Connection</h2>
        <label>
          ACP launch command
          <input
            value={settings.acpLaunchCommand}
            onChange={(e) => setSettings((prev) => ({ ...prev, acpLaunchCommand: e.target.value }))}
          />
        </label>
        <label>
          Working directory
          <input value={cwdInput} onChange={(e) => setCwdInput(e.target.value)} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.autoAllow}
            onChange={(e) => setSettings((prev) => ({ ...prev, autoAllow: e.target.checked }))}
          />
          Auto allow permissions
        </label>
        <div className="row">
          <button disabled={busy} onClick={connectAndInitialize}>
            Start + Initialize
          </button>
          <button
            onClick={async () => {
              await api.stop();
            }}
          >
            Stop
          </button>
          <button
            onClick={async () =>
              saveClientSettings({
                ...settings,
                cwd: cwdInput
              })
            }
          >
            Save Settings
          </button>
        </div>
      </section>

      <section className="panel session">
        <h2>Session</h2>
        <div className="row">
          <button disabled={busy} onClick={createSession}>
            New Session
          </button>
          <input
            placeholder="session id to load"
            value={loadSessionId}
            onChange={(e) => setLoadSessionId(e.target.value)}
          />
          <button disabled={busy} onClick={loadSession}>
            Load Session
          </button>
        </div>
        <p>Active session: {currentSessionId || "-"}</p>
        <div className="row">
          <select value={state.currentModeId} onChange={(e) => changeMode(e.target.value)}>
            <option value="">Select mode</option>
            {state.modes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ))}
          </select>
          <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)}>
            <option value="">Select model</option>
            {state.models.map((model) => (
              <option key={model.modelId} value={model.modelId}>
                {model.name || model.modelId}
              </option>
            ))}
          </select>
          <button onClick={() => changeModel(selectedModelId)}>Apply Model</button>
          <button onClick={cancelPrompt}>Cancel Turn</button>
        </div>
      </section>

      <section className="panel prompt">
        <h2>Prompt</h2>
        <textarea value={promptInput} onChange={(e) => setPromptInput(e.target.value)} />
        <div className="row">
          <button disabled={busy || !currentSessionId} onClick={sendPrompt}>
            Send Prompt
          </button>
        </div>
      </section>

      <section className="panel stream">
        <h2>Messages</h2>
        <div className="scroll">
          {state.messages.map((message, idx) => (
            <article key={`${message.role}-${idx}`} className={`msg ${message.role}`}>
              <strong>{message.role}</strong>
              <pre>{message.text}</pre>
            </article>
          ))}
        </div>
      </section>

      <section className="panel tools">
        <h2>Tool Calls</h2>
        <div className="scroll">
          {toolCalls.map((tool) => (
            <article key={tool.toolCallId} className="tool">
              <header>
                <strong>{tool.title || tool.toolCallId}</strong>
                <span>{tool.status || "pending"}</span>
              </header>
              <p>{tool.kind || "other"}</p>
              {tool.content !== undefined && tool.content !== null && <pre>{JSON.stringify(tool.content, null, 2)}</pre>}
            </article>
          ))}
        </div>
      </section>

      <section className="panel plan">
        <h2>Plan</h2>
        <ol>
          {state.plan.map((entry, idx) => (
            <li key={`${entry.content}-${idx}`}>
              {entry.content} ({entry.status || "pending"})
            </li>
          ))}
        </ol>
      </section>

      <section className="panel commands">
        <h2>Slash Commands</h2>
        <ul>
          {state.availableCommands.map((cmd) => (
            <li key={cmd.name}>
              /{cmd.name} {cmd.description ? `- ${cmd.description}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel logs">
        <h2>Logs</h2>
        <div className="scroll">
          {state.logs.map((line, idx) => (
            <pre key={`${line}-${idx}`}>{line}</pre>
          ))}
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      {state.permissionRequest && (
        <div className="modal">
          <div className="modal-card">
            <h3>Permission Request</h3>
            <p>{state.permissionRequest.title || "Tool execution request"}</p>
            <p>Kind: {state.permissionRequest.toolKind || "other"}</p>
            <div className="row">
              {state.permissionRequest.options.map((option) => (
                <button key={option.optionId} onClick={() => respondPermission(option)}>
                  {option.name}
                </button>
              ))}
              <button onClick={() => respondPermission(null, true)}>Cancel</button>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={rememberChoice} onChange={(e) => setRememberChoice(e.target.checked)} />
              Remember this choice for this tool kind (session only)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
