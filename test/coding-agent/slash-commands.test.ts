import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../../src/coding-agent/core/slash-commands.js";

describe("BUILTIN_SLASH_COMMANDS", () => {
	it("includes /view", () => {
		const command = BUILTIN_SLASH_COMMANDS.find((entry) => entry.name === "view");
		expect(command).toBeDefined();
		expect(command?.description).toContain("view mode");
	});

	it("includes /help", () => {
		const command = BUILTIN_SLASH_COMMANDS.find((entry) => entry.name === "help");
		expect(command).toBeDefined();
		expect(command?.description).toContain("shortcuts");
	});
});
