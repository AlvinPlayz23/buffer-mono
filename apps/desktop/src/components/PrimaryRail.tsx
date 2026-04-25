import type { ProjectItem } from "../types/acp";
import { FolderIcon, PlusIcon, SearchIcon, SettingsIcon } from "./Icons";

interface Props {
  projects: ProjectItem[];
  activeProjectId: string;
  panelOpen: boolean;
  busy: boolean;
  onToggleProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
}

export function PrimaryRail({
  projects,
  activeProjectId,
  panelOpen,
  busy,
  onToggleProject,
  onNewProject,
  onOpenSettings
}: Props) {
  return (
    <aside className="primary-rail">
      <div className="rail-brand" title="Buffer">
        B
      </div>

      <div className="rail-projects">
        {projects.map((project) => {
          const isActive = panelOpen && project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              className={`rail-folder-btn ${isActive ? "active" : ""}`}
              title={project.name}
              onClick={() => onToggleProject(project.id)}
            >
              <FolderIcon size={18} />
            </button>
          );
        })}

        <button
          type="button"
          className="rail-folder-btn rail-new"
          onClick={onNewProject}
          title="New project"
          disabled={busy}
        >
          <PlusIcon size={16} />
        </button>
      </div>

      <div className="rail-foot">
        <button type="button" className="rail-icon-btn" title="Search">
          <SearchIcon size={18} />
        </button>
        <button
          type="button"
          className="rail-icon-btn"
          title="Settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </aside>
  );
}
