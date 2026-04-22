import type { Component } from "#buffer-tui";

/**
 * Wraps child components and prepends a colored vertical bar to every line.
 * Renders like:
 *   │ first line of content
 *   │ second line of content
 */
export class LeftBar implements Component {
	private children: Component[] = [];
	private barFn: (text: string) => string;

	constructor(barFn: (text: string) => string) {
		this.barFn = barFn;
	}

	addChild(component: Component): void {
		this.children.push(component);
	}

	invalidate(): void {
		for (const child of this.children) {
			child.invalidate();
		}
	}

	render(width: number): string[] {
		const prefix = this.barFn("│") + " ";
		const prefixWidth = 2; // "│" + " "
		const contentWidth = Math.max(1, width - prefixWidth);

		const lines: string[] = [];
		for (const child of this.children) {
			for (const line of child.render(contentWidth)) {
				lines.push(prefix + line);
			}
		}
		return lines;
	}
}
