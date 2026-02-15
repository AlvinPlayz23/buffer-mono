import { Container, getEditorKeybindings, Spacer, Text } from "#buffer-tui";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";
import { keyHint, rawKeyHint } from "./keybinding-hints.js";

export interface BackgroundJobView {
	id: string;
	command: string;
	createdAt: string;
	status: string;
	pid?: number;
	exitCode: number | null;
}

export class BackgroundJobsComponent extends Container {
	private jobs: BackgroundJobView[] = [];
	private selectedIndex = 0;
	private listContainer: Container;
	private detailsText: Text;

	constructor(
		private readonly getJobs: () => BackgroundJobView[],
		private readonly getDetails: (id: string) => string,
		private readonly onClose: () => void,
		initialJobId?: string,
	) {
		super();

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", "Background Jobs"), 1, 0));
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.detailsText = new Text("", 1, 0);
		this.addChild(this.detailsText);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				rawKeyHint("↑↓", "select") +
					"  " +
					rawKeyHint("r", "refresh") +
					"  " +
					keyHint("selectCancel", "close"),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.refresh(initialJobId);
	}

	private refresh(initialJobId?: string): void {
		this.jobs = this.getJobs();
		if (this.jobs.length === 0) {
			this.selectedIndex = 0;
			this.updateView();
			return;
		}

		if (initialJobId) {
			const idx = this.jobs.findIndex((job) => job.id === initialJobId);
			if (idx >= 0) {
				this.selectedIndex = idx;
			}
		}

		if (this.selectedIndex < 0) this.selectedIndex = 0;
		if (this.selectedIndex >= this.jobs.length) this.selectedIndex = this.jobs.length - 1;
		this.updateView();
	}

	private updateView(): void {
		this.listContainer.clear();
		if (this.jobs.length === 0) {
			this.listContainer.addChild(new Text(theme.fg("dim", "No background jobs"), 1, 0));
			this.detailsText.setText(theme.fg("dim", "Run /bg <command> to start one."));
			return;
		}

		for (let i = 0; i < this.jobs.length; i++) {
			const job = this.jobs[i];
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? theme.fg("accent", "-> ") : "   ";
			const exit = job.exitCode === null ? "-" : String(job.exitCode);
			const line = `${prefix}${job.id}  ${job.status}  pid=${job.pid ?? "n/a"}  exit=${exit}  ${job.command}`;
			this.listContainer.addChild(new Text(line, 1, 0));
		}

		const selected = this.jobs[this.selectedIndex];
		this.detailsText.setText(this.getDetails(selected.id));
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		if (kb.matches(keyData, "selectUp") || keyData === "k") {
			if (this.jobs.length === 0) return;
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateView();
			return;
		}
		if (kb.matches(keyData, "selectDown") || keyData === "j") {
			if (this.jobs.length === 0) return;
			this.selectedIndex = Math.min(this.jobs.length - 1, this.selectedIndex + 1);
			this.updateView();
			return;
		}
		if (keyData.toLowerCase() === "r") {
			this.refresh();
			return;
		}
		if (kb.matches(keyData, "selectCancel")) {
			this.onClose();
		}
	}
}
