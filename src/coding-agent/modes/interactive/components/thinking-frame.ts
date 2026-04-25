import { truncateToWidth, type Component } from "#buffer-tui";

/**
 * Wraps child components in a soft open frame for thinking blocks.
 * Renders like:
 *   ╭─ thinking
 *     content line 1…
 *     content line 2…
 *   ╰─
 */
export class ThinkingFrame implements Component {
	private children: Component[] = [];
	private colorFn: (text: string) => string;

	constructor(colorFn: (text: string) => string) {
		this.colorFn = colorFn;
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
		const contentWidth = Math.max(1, width - 2);
		const lines: string[] = [];

		lines.push(truncateToWidth(this.colorFn("╭─ thinking"), width, ""));

		for (const child of this.children) {
			for (const line of child.render(contentWidth)) {
				lines.push(truncateToWidth(`  ${line}`, width, ""));
			}
		}

		lines.push(truncateToWidth(this.colorFn("╰─"), width, ""));

		return lines;
	}
}
