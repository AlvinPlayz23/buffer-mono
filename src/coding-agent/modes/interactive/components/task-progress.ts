import { Container, Text } from "#buffer-tui";
import { theme } from "../theme/theme.js";

export interface TaskProgressRow {
	agent: string;
	label: string;
	status: "pending" | "running" | "completed" | "failed" | "aborted";
	tool?: string;
	elapsedSeconds?: number;
}

export class TaskProgressComponent extends Container {
	constructor(title: string, rows: TaskProgressRow[]) {
		super();
		this.addChild(new Text(theme.fg("accent", title), 0, 0));
		for (const row of rows) {
			const symbol =
				row.status === "completed"
					? theme.fg("success", "✓")
					: row.status === "failed"
						? theme.fg("error", "!")
						: row.status === "aborted"
							? theme.fg("warning", "×")
							: row.status === "running"
								? theme.fg("accent", "•")
								: theme.fg("dim", "·");
			const tool = row.tool ? ` · ${row.tool}` : "";
			const elapsed = row.elapsedSeconds ? ` · ${row.elapsedSeconds}s` : "";
			this.addChild(new Text(`${symbol} ${theme.fg("muted", row.agent)} ${row.label}${theme.fg("dim", `${tool}${elapsed}`)}`, 0, 0));
		}
	}
}
