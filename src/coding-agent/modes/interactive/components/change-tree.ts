import type { Component } from "#buffer-tui";
import { theme } from "../theme/theme.js";

export interface FileChange {
	path: string;
	type: "write" | "edit";
	additions?: number;
	deletions?: number;
}

/**
 * Renders a tree of changed files after a task completes.
 * Example:
 *   changed
 *   ├─ src/tui/render.ts       +12 -3
 *   ├─ src/ui/footer.ts         +8 -0
 *   └─ test/render.test.ts     +21 -1
 */
export class ChangeTreeComponent implements Component {
	private changes: FileChange[];

	constructor(changes: FileChange[]) {
		this.changes = changes;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (this.changes.length === 0) return [];

		const lines: string[] = [];
		lines.push(""); // spacer
		lines.push(theme.fg("muted", "  changed"));

		for (let i = 0; i < this.changes.length; i++) {
			const change = this.changes[i];
			const isLast = i === this.changes.length - 1;
			const connector = isLast ? "└─" : "├─";

			// Shorten path: replace home dir with ~
			let displayPath = change.path;
			const home = process.env.HOME || process.env.USERPROFILE || "";
			if (home && displayPath.startsWith(home)) {
				displayPath = "~" + displayPath.slice(home.length);
			}
			// Also replace backslashes with forward slashes
			displayPath = displayPath.replace(/\\/g, "/");

			// Build the stats suffix
			let stats = "";
			if (change.additions !== undefined || change.deletions !== undefined) {
				const add = change.additions ?? 0;
				const del = change.deletions ?? 0;
				if (add > 0) stats += theme.fg("toolDiffAdded" as any, ` +${add}`);
				if (del > 0) stats += theme.fg("toolDiffRemoved" as any, ` -${del}`);
			}

			const line = `  ${theme.fg("muted", connector)} ${theme.fg("accent", displayPath)}${stats}`;
			lines.push(line);
		}

		return lines;
	}
}
