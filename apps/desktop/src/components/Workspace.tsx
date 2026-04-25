import type { RefObject } from "react";
import Markdown from "react-markdown";
import type { ProjectItem, SessionMessage, ToolCallEntry } from "../types/acp";
import { GitBranchIcon, TerminalIcon } from "./Icons";

interface Props {
  project: ProjectItem | null;
  acpStatus: "starting" | "connected" | "disconnected" | "error";
  messages: SessionMessage[];
  activeToolCalls: ToolCallEntry[];
  recentToolCalls: ToolCallEntry[];
  chatEndRef: RefObject<HTMLDivElement>;
  onConnect: () => void;
  busy: boolean;
  acpBreadcrumb: string;
}

export function Workspace({
  project,
  acpStatus,
  messages,
  activeToolCalls,
  recentToolCalls,
  chatEndRef,
  onConnect,
  busy,
  acpBreadcrumb
}: Props) {
  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="breadcrumb mono">
          <GitBranchIcon size={12} />
          <span>{acpBreadcrumb}</span>
        </div>
        <div className={`status-pill ${acpStatus}`}>
          <span className="pulse" />
          <span>
            {acpStatus === "connected"
              ? "Local Engine"
              : acpStatus === "starting"
                ? "Starting…"
                : acpStatus === "error"
                  ? "Error"
                  : "Disconnected"}
          </span>
        </div>
      </header>

      <div className="workspace-body">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <TerminalIcon size={28} />
            </div>
            <h3>{project ? project.name : "No Active Session Selected"}</h3>
            <p>
              {project
                ? "Type below to start a thread, or pick an existing one from the sidebar."
                : "Select a project from the sidebar or create one to start a new task."}
            </p>
            {acpStatus !== "connected" && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={onConnect}
              >
                {acpStatus === "starting" ? "Connecting…" : "Start ACP"}
              </button>
            )}
          </div>
        ) : (
          <div className="chat-stream">
            {activeToolCalls.length > 0 && (
              <div className="tool-strip">
                {activeToolCalls.map((tool) => (
                  <div
                    key={tool.toolCallId}
                    className={`tool-pill ${tool.status || "pending"}`}
                  >
                    <span className="tool-dot" />
                    <strong>{tool.title || tool.kind || "Tool call"}</strong>
                    <span className="hint">
                      {tool.status === "in_progress" ? "Running" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {messages.map((m, idx) => (
              <article key={`${m.role}-${idx}`} className={`msg ${m.role}`}>
                {m.role === "user" ? (
                  <div className="msg-user-bubble">
                    <pre>{m.text}</pre>
                  </div>
                ) : (
                  <div className={`msg-flat ${m.role}`}>
                    <div className="msg-role mono">{m.role}</div>
                    <div className="msg-body">
                      <Markdown>{m.text}</Markdown>
                    </div>
                  </div>
                )}
              </article>
            ))}

            {recentToolCalls.length > 0 && (
              <div className="tool-feed">
                {recentToolCalls.map((tool) => (
                  <div
                    key={`feed-${tool.toolCallId}`}
                    className={`tool-card ${tool.status || "pending"}`}
                  >
                    <header>
                      <strong>{tool.title || tool.toolCallId}</strong>
                      <span>{tool.status || "pending"}</span>
                    </header>
                    <p className="mono">{tool.kind || "other"}</p>
                  </div>
                ))}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
