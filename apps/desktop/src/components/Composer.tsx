import { useEffect, useRef, useState } from "react";
import type { RefObject, KeyboardEvent } from "react";
import {
  ArrowUpRightIcon,
  BrainIcon,
  ChevronDownIcon,
  CpuIcon,
  EyeIcon,
  StopIcon
} from "./Icons";

interface Cmd {
  name: string;
  description?: string;
}

interface Model {
  modelId: string;
  name?: string;
  description?: string | null;
}

interface Mode {
  id: string;
  name: string;
  description?: string | null;
}

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>;
  promptInput: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  canSend: boolean;
  isSending: boolean;
  disabled: boolean;
  placeholder: string;

  showSlashMenu: boolean;
  filteredSlashCommands: Cmd[];
  slashSelectedIdx: number;
  setSlashSelectedIdx: (i: number) => void;
  insertSlashCommand: (name: string) => void;
  setShowSlashMenu: (show: boolean) => void;

  models: Model[];
  selectedModelId: string;
  onChangeModel: (id: string) => void;

  modes: Mode[];
  currentModeId: string;
  onChangeMode: (id: string) => void;

  supervised: boolean;
  onToggleSupervised: () => void;
}

export function Composer(props: Props) {
  const {
    textareaRef,
    promptInput,
    onPromptChange,
    onSend,
    onStop,
    canSend,
    isSending,
    disabled,
    placeholder,
    showSlashMenu,
    filteredSlashCommands,
    slashSelectedIdx,
    setSlashSelectedIdx,
    insertSlashCommand,
    setShowSlashMenu,
    models,
    selectedModelId,
    onChangeModel,
    modes,
    currentModeId,
    onChangeMode,
    supervised,
    onToggleSupervised
  } = props;

  const [openMenu, setOpenMenu] = useState<"" | "model" | "mode">("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenMenu("");
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashMenu && filteredSlashCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIdx((slashSelectedIdx + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIdx(
          (slashSelectedIdx - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertSlashCommand(filteredSlashCommands[slashSelectedIdx].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  const currentModel = models.find((m) => m.modelId === selectedModelId);
  const currentMode = modes.find((m) => m.id === currentModeId);

  return (
    <div className="composer-wrap">
      <div className="composer-card" ref={wrapRef}>
        {showSlashMenu && filteredSlashCommands.length > 0 && (
          <div className="slash-menu">
            {filteredSlashCommands.map((cmd, idx) => (
              <button
                key={cmd.name}
                className={`slash-item ${idx === slashSelectedIdx ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSlashCommand(cmd.name);
                }}
                onMouseEnter={() => setSlashSelectedIdx(idx)}
                type="button"
              >
                <strong>/{cmd.name}</strong>
                {cmd.description && <span>{cmd.description}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="composer-input">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={placeholder}
            value={promptInput}
            disabled={disabled}
            onChange={(e) => {
              onPromptChange(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKey}
            onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
          />
        </div>

        <div className="composer-toolbar">
          <div className="toolbar-left">
            <div className="dropdown">
              <button
                type="button"
                className="chip"
                onClick={() => setOpenMenu(openMenu === "model" ? "" : "model")}
              >
                <CpuIcon size={14} />
                <span>{currentModel?.name || currentModel?.modelId || "Model"}</span>
                <ChevronDownIcon size={12} />
              </button>
              {openMenu === "model" && (
                <div className="dropdown-menu">
                  {models.length === 0 && (
                    <div className="dropdown-empty">No models available</div>
                  )}
                  {models.map((m) => (
                    <button
                      key={m.modelId}
                      type="button"
                      className={`dropdown-item ${m.modelId === selectedModelId ? "active" : ""}`}
                      onClick={() => {
                        onChangeModel(m.modelId);
                        setOpenMenu("");
                      }}
                    >
                      <span>{m.name || m.modelId}</span>
                      {m.description && <span className="hint">{m.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="dropdown">
              <button
                type="button"
                className="chip"
                onClick={() => setOpenMenu(openMenu === "mode" ? "" : "mode")}
              >
                <BrainIcon size={14} />
                <span>Mode: {currentMode?.name || "—"}</span>
                <ChevronDownIcon size={12} />
              </button>
              {openMenu === "mode" && (
                <div className="dropdown-menu">
                  {modes.length === 0 && (
                    <div className="dropdown-empty">No modes available</div>
                  )}
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`dropdown-item ${m.id === currentModeId ? "active" : ""}`}
                      onClick={() => {
                        onChangeMode(m.id);
                        setOpenMenu("");
                      }}
                    >
                      <span>{m.name}</span>
                      {m.description && <span className="hint">{m.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="divider" />

            <button
              type="button"
              className={`chip toggle ${supervised ? "active" : ""}`}
              onClick={onToggleSupervised}
              title="Auto-allow tool permissions when off; supervised when on"
            >
              <EyeIcon size={14} />
              <span>Supervised</span>
            </button>
          </div>

          <div className="toolbar-right">
            <span className="hint mono hide-sm">⌘↵ to send</span>
            {isSending ? (
              <button type="button" className="send-btn stop" onClick={onStop} title="Stop">
                <StopIcon size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={onSend}
                disabled={!canSend}
                title="Send"
              >
                <ArrowUpRightIcon size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
