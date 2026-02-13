import assert from "node:assert";
import { describe, it } from "node:test";
import { TUI } from "../src/tui.js";
import type { Terminal } from "../src/terminal.js";

class SpyTerminal implements Terminal {
	public altScreenTransitions: boolean[] = [];
	public started = false;

	start(_onInput: (data: string) => void, _onResize: () => void): void {
		this.started = true;
	}

	stop(): void {
		this.started = false;
	}

	async drainInput(_maxMs?: number, _idleMs?: number): Promise<void> {}

	write(_data: string): void {}

	get columns(): number {
		return 80;
	}

	get rows(): number {
		return 24;
	}

	get kittyProtocolActive(): boolean {
		return false;
	}

	moveBy(_lines: number): void {}

	hideCursor(): void {}

	showCursor(): void {}

	clearLine(): void {}

	clearFromCursor(): void {}

	clearScreen(): void {}

	setAltScreenEnabled(enabled: boolean): void {
		this.altScreenTransitions.push(enabled);
	}

	setTitle(_title: string): void {}
}

describe("TUI view mode", () => {
	it("uses text-buffer mode by default", () => {
		const terminal = new SpyTerminal();
		const tui = new TUI(terminal);
		tui.start();
		assert.deepStrictEqual(terminal.altScreenTransitions, [false]);
		tui.stop();
	});

	it("applies alt-mode on start when configured before start", () => {
		const terminal = new SpyTerminal();
		const tui = new TUI(terminal);
		tui.setViewMode("alt-mode");
		assert.deepStrictEqual(terminal.altScreenTransitions, []);
		tui.start();
		assert.deepStrictEqual(terminal.altScreenTransitions, [true]);
		tui.stop();
	});

	it("switches between modes at runtime without duplicate transitions", () => {
		const terminal = new SpyTerminal();
		const tui = new TUI(terminal);
		tui.start();
		tui.setViewMode("alt-mode");
		tui.setViewMode("alt-mode");
		tui.setViewMode("text-buffer");
		tui.setViewMode("text-buffer");
		assert.deepStrictEqual(terminal.altScreenTransitions, [false, true, false]);
		tui.stop();
	});
});
