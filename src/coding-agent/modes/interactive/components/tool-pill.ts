import type { Component } from "#buffer-tui";
import { truncateToWidth } from "#buffer-tui";
import { theme } from "../theme/theme.js";

/**
 * A compact pill/badge component for tool call indicators.
 * Renders as a small gray rectangle with optional suffix text, e.g.:  ▐ bash ▌ pnpm run dev
 */
export class ToolPill implements Component {
	private label: string;
	private suffix: string;
	private colorFn: (text: string) => string;

	constructor(label: string, colorFn: (text: string) => string = (s) => theme.fg("muted", s), suffix = "") {
		this.label = label;
		this.suffix = suffix;
		this.colorFn = colorFn;
	}

	setLabel(label: string): void {
		this.label = label;
	}

	setSuffix(suffix: string): void {
		this.suffix = suffix;
	}

	setColorFn(colorFn: (text: string) => string): void {
		this.colorFn = colorFn;
	}

	invalidate(): void {
		// No cached state
	}

	render(width: number): string[] {
		const inner = ` ${this.label} `;
		const pill = this.colorFn(`▐${inner}▌`);
		if (this.suffix) {
			const line = `${pill} ${this.suffix}`;
			return [truncateToWidth(line, width, "…")];
		}
		return [pill];
	}
}
