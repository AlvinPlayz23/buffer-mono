import type { PermissionOption } from "../types/acp";

interface PermissionRequestView {
  requestId: string;
  title?: string;
  toolKind?: string;
  options: PermissionOption[];
}

interface Props {
  request: PermissionRequestView | null;
  remember: boolean;
  setRemember: (v: boolean) => void;
  onRespond: (option: PermissionOption | null, cancelled?: boolean) => void;
}

export function PermissionModal({ request, remember, setRemember, onRespond }: Props) {
  if (!request) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-card permission-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Permission Request</h2>
        </header>
        <div className="modal-body">
          <p className="perm-title">{request.title || "Tool execution request"}</p>
          <p className="hint mono">{request.toolKind || "other"}</p>
          <div className="row-actions">
            {request.options.map((option) => (
              <button
                key={option.optionId}
                className="btn"
                onClick={() => onRespond(option)}
              >
                {option.name}
              </button>
            ))}
            <button className="btn" onClick={() => onRespond(null, true)}>
              Cancel
            </button>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember for this tool kind (thread)</span>
          </label>
        </div>
      </div>
    </div>
  );
}
