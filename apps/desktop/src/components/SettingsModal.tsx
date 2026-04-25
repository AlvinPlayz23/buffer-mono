import type { AppState } from "../lib/state";
import type { AppSettings } from "../types/acp";
import { XIcon } from "./Icons";

const THEMES = [
  { id: "midnight", name: "Midnight", icon: "🌙" },
  { id: "dawn", name: "Dawn", icon: "🌅" },
  { id: "forest", name: "Forest", icon: "🌲" },
  { id: "arctic", name: "Arctic", icon: "❄" }
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  state: AppState;
  settings: AppSettings;
  setSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  busy: boolean;
  acpStatus: "starting" | "connected" | "disconnected" | "error";
  onConnect: () => void;
  onStop: () => void;
  onSaveSettings: () => void;
  theme: string;
  setTheme: (id: string) => void;
}

export function SettingsModal({
  open,
  onClose,
  state,
  settings,
  setSettings,
  busy,
  acpStatus,
  onConnect,
  onStop,
  onSaveSettings,
  theme,
  setTheme
}: Props) {
  if (!open) return null;
  const toolCalls = Object.values(state.toolCalls);
  const tasks = Object.values(state.taskProgress);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            <XIcon size={14} />
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Theme</h3>
            <div className="theme-row">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-chip ${theme === t.id ? "active" : ""}`}
                  onClick={() => setTheme(t.id)}
                >
                  <span>{t.icon}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="modal-section">
            <div className="section-head">
              <h3>ACP Connection</h3>
              <span className={`status-pill ${acpStatus}`}>
                <span className="pulse" />
                <span>{acpStatus}</span>
              </span>
            </div>
            <label className="field">
              <span>Working directory</span>
              <input
                value={settings.cwd}
                onChange={(e) => setSettings((p) => ({ ...p, cwd: e.target.value }))}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.autoAllow}
                onChange={(e) => setSettings((p) => ({ ...p, autoAllow: e.target.checked }))}
              />
              <span>Auto-allow tool permissions</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.autoStartAcp}
                onChange={(e) => setSettings((p) => ({ ...p, autoStartAcp: e.target.checked }))}
              />
              <span>Auto-start ACP on launch</span>
            </label>
            <div className="row-actions">
              <button className="btn btn-primary" disabled={busy} onClick={onConnect}>
                {acpStatus === "connected" ? "Reconnect" : "Start ACP"}
              </button>
              <button
                className="btn"
                onClick={onStop}
                disabled={busy || acpStatus === "disconnected"}
              >
                Stop
              </button>
              <button className="btn" onClick={onSaveSettings}>
                Save
              </button>
            </div>
          </section>

          <details className="modal-section">
            <summary>Slash Commands ({state.availableCommands.length})</summary>
            <ul className="cmd-list">
              {state.availableCommands.map((cmd) => (
                <li key={cmd.name}>
                  <strong className="mono">/{cmd.name}</strong>
                  {cmd.description && <span>{cmd.description}</span>}
                </li>
              ))}
            </ul>
          </details>

          <details className="modal-section">
            <summary>Tool Calls ({toolCalls.length})</summary>
            <div className="card-list">
              {toolCalls.map((tool) => (
                <article key={tool.toolCallId} className="info-card">
                  <header>
                    <strong>{tool.title || tool.toolCallId}</strong>
                    <span className={`badge ${tool.status || "pending"}`}>
                      {tool.status || "pending"}
                    </span>
                  </header>
                  <p className="mono">{tool.kind || "other"}</p>
                </article>
              ))}
            </div>
          </details>

          <details className="modal-section">
            <summary>Tasks ({tasks.length})</summary>
            <div className="card-list">
              {tasks.map((task) => (
                <article key={task.taskId} className="info-card">
                  <header>
                    <strong>{task.agent || task.taskId}</strong>
                    <span className={`badge ${task.status}`}>{task.status}</span>
                  </header>
                  <p className="mono">{task.taskId}</p>
                  {task.currentTool && <p>Tool: {task.currentTool}</p>}
                  {typeof task.elapsedSeconds === "number" && (
                    <p>Elapsed: {task.elapsedSeconds}s</p>
                  )}
                </article>
              ))}
            </div>
          </details>

          <details className="modal-section">
            <summary>Plan ({state.plan.length})</summary>
            <ol className="plan-list">
              {state.plan.map((entry, idx) => (
                <li
                  key={`${entry.content}-${idx}`}
                  className={`plan-item ${entry.status || "pending"}`}
                >
                  {entry.content}
                </li>
              ))}
            </ol>
          </details>

          <details className="modal-section">
            <summary>Changes ({state.changeTree.length})</summary>
            <div className="card-list">
              {state.changeTree.map((change, idx) => (
                <article key={`${change.path}-${idx}`} className="info-card">
                  <header>
                    <strong className="mono">{change.path}</strong>
                    <span className={`badge ${change.type}`}>{change.type}</span>
                  </header>
                  <p>
                    +{change.additions ?? 0} / -{change.deletions ?? 0}
                  </p>
                </article>
              ))}
            </div>
          </details>

          <details className="modal-section">
            <summary>Context</summary>
            {state.contextUsage ? (
              <article className="info-card">
                <p>Percent: {state.contextUsage.percent ?? "unknown"}</p>
                <p>Window: {state.contextUsage.contextWindow}</p>
                <p>Input: {state.contextUsage.input}</p>
                <p>Output: {state.contextUsage.output}</p>
                <p>Cost: {state.contextUsage.cost}</p>
              </article>
            ) : (
              <p className="hint">No context usage reported yet.</p>
            )}
          </details>

          <details className="modal-section">
            <summary>Logs</summary>
            <div className="logs">
              {state.logs.map((line, idx) => (
                <pre key={`${line}-${idx}`}>{line}</pre>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
