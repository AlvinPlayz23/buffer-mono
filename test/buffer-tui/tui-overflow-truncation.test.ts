import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { visibleWidth } from "../../src/buffer-tui/utils.js";
import { type Component, TUI } from "../../src/buffer-tui/tui.js";
import { VirtualTerminal } from "./virtual-terminal.js";

class OverflowComponent implements Component {
	render(_width: number): string[] {
		return ["X".repeat(200)];
	}

	invalidate(): void {}
}

const crashLogPath = "C:\\Users\\bijim\\.pi\\agent\\pi-crash.log";

describe("TUI overflow handling", () => {
	afterEach(async () => {
		const fs = await import("node:fs");
		if (fs.existsSync(crashLogPath)) {
			fs.unlinkSync(crashLogPath);
		}
	});

	it("truncates overflowing component output instead of crashing", async () => {
		const terminal = new VirtualTerminal(40, 6);
		const tui = new TUI(terminal);
		tui.addChild(new OverflowComponent());

		assert.doesNotThrow(() => tui.start());
		await terminal.flush();

		const [firstLine = ""] = terminal.getViewport();
		assert.equal(visibleWidth(firstLine), 40);

		const fs = await import("node:fs");
		assert.ok(fs.existsSync(crashLogPath), "Expected overflow log to be written");

		tui.stop();
	});
});
