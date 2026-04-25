import assert from "node:assert";
import { describe, it } from "node:test";
import { visibleWidth } from "#buffer-tui";
import { ErrorCallout } from "../../src/coding-agent/modes/interactive/components/error-callout.js";

describe("ErrorCallout", () => {
	it("truncates long messages to fit the requested width", () => {
		const callout = new ErrorCallout(
			"error",
			"This is a very long provider error message that should not overflow the terminal width",
			(text) => text,
		);

		const lines = callout.render(30);

		assert.equal(lines.length, 2);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= 30, `Expected visible width <= 30, got ${visibleWidth(line)}`);
		}
	});
});
