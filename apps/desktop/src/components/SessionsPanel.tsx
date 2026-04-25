import type { ProjectItem, ThreadItem } from "../types/acp";
import { PlusIcon } from "./Icons";

interface Props {
  open: boolean;
  project: ProjectItem | null;
  threads: ThreadItem[];
  activeThreadId: string;
  busy: boolean;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function SessionsPanel({
  open,
  project,
  threads,
  activeThreadId,
  busy,
  onSelectThread,
  onNewThread
}: Props) {
  return (
    <div className={`sessions-panel ${open ? "open" : ""}`}>
      <div className="sessions-head">
        <h2>{project ? project.name : "Threads"}</h2>
        <button
          type="button"
          className="sessions-new"
          title="New thread"
          onClick={onNewThread}
          disabled={busy || !project}
        >
          <PlusIcon size={12} />
        </button>
      </div>

      {project && (
        <div className="sessions-path mono" title={project.path}>
          {project.path}
        </div>
      )}

      <div className="sessions-list">
        {threads.length === 0 && (
          <div className="sessions-empty">No threads yet.</div>
        )}
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <button
              key={thread.id}
              type="button"
              className={`thread-row ${isActive ? "active" : ""}`}
              disabled={busy}
              onClick={() => onSelectThread(thread.id)}
            >
              <div className="thread-title">{thread.title || "Untitled thread"}</div>
              <div className="thread-meta">
                <span className={`thread-dot ${isActive ? "active" : ""}`} />
                {timeAgo(thread.updatedAt || thread.lastOpenedAt || thread.createdAt)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
