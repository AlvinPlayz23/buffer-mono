import type { Component } from "#buffer-tui";

/**
 * A compact corner callout for error/abort messages.
 * Renders like:
 *   ╭─ error
 *   ╰─ File not found: ~/src/missing.ts
 */
export class ErrorCallout implements Component {
	private label: string;
	private message: string;
	private colorFn: (text: string) => string;

	constructor(label: string, message: string, colorFn: (text: string) => string) {
		this.label = label;
		this.message = message;
		this.colorFn = colorFn;
	}

	invalidate(): void {
		// No cached state
	}

	render(_width: number): string[] {
		return [
			this.colorFn("╭─ " + this.label),
			this.colorFn("╰─ " + this.message),
		];
	}
}
