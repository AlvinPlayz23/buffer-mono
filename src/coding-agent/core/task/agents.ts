import { readFileSync } from "node:fs";
import { parseFrontmatter } from "../../utils/frontmatter.js";
import type { AgentDefinition, AgentSource } from "./types.js";

type Frontmatter = Record<string, unknown>;

function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return undefined;
}

function parseArrayOrCsv(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		const items = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
		return items.length > 0 ? items : undefined;
	}
	if (typeof value === "string") {
		const items = value.split(",").map((item) => item.trim()).filter(Boolean);
		return items.length > 0 ? items : undefined;
	}
	return undefined;
}

function parseThinkingLevel(value: unknown): AgentDefinition["thinkingLevel"] {
	return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh"
		? value
		: undefined;
}

function parseAgentFields(frontmatter: Frontmatter): Omit<AgentDefinition, "systemPrompt" | "source" | "filePath"> | null {
	const name = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
	const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
	if (!name || !description) return null;

	let tools = parseArrayOrCsv(frontmatter.tools)?.map((tool) => tool.toLowerCase());
	if (tools && !tools.includes("submit_result")) {
		tools = [...tools, "submit_result"];
	}

	let spawns: string[] | "*" | undefined;
	if (frontmatter.spawns === "*") {
		spawns = "*";
	} else {
		spawns = parseArrayOrCsv(frontmatter.spawns);
	}
	if (spawns === undefined && tools?.includes("task")) {
		spawns = "*";
	}

	return {
		name,
		description,
		tools,
		spawns,
		model: parseArrayOrCsv(frontmatter.model),
		output: frontmatter.output,
		thinkingLevel: parseThinkingLevel(frontmatter["thinking-level"] ?? frontmatter.thinkingLevel),
		blocking: parseBoolean(frontmatter.blocking),
	};
}

export class AgentParsingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentParsingError";
	}
}

export function parseAgent(filePath: string, content: string, source: AgentSource): AgentDefinition {
	const { frontmatter, body } = parseFrontmatter<Frontmatter>(content);
	const parsed = parseAgentFields(frontmatter);
	if (!parsed) {
		throw new AgentParsingError(`Invalid agent definition in ${filePath}`);
	}
	return {
		...parsed,
		systemPrompt: body.trim(),
		source,
		filePath,
	};
}

function loadPrompt(name: string): string {
	return readFileSync(new URL(`../prompts/agents/${name}.md`, import.meta.url), "utf-8").trim();
}

let bundledAgentsCache: AgentDefinition[] | null = null;

export function loadBundledAgents(): AgentDefinition[] {
	if (bundledAgentsCache) return bundledAgentsCache;

	bundledAgentsCache = [
		{
			name: "explore",
			description: "Read-only explorer for bounded codebase investigation tasks.",
			systemPrompt: loadPrompt("explore"),
			source: "bundled",
			filePath: "embedded:explore.md",
			tools: ["read", "grep", "find", "ls", "submit_result"],
			thinkingLevel: "medium",
		},
		{
			name: "plan",
			description: "Planning-focused agent for decomposition and execution plans.",
			systemPrompt: loadPrompt("plan"),
			source: "bundled",
			filePath: "embedded:plan.md",
			tools: ["read", "grep", "find", "ls", "submit_result"],
			thinkingLevel: "medium",
		},
		{
			name: "reviewer",
			description: "Review-focused agent for bugs, regressions, and missing tests.",
			systemPrompt: loadPrompt("reviewer"),
			source: "bundled",
			filePath: "embedded:reviewer.md",
			tools: ["read", "grep", "find", "ls", "submit_result"],
			thinkingLevel: "high",
		},
		{
			name: "designer",
			description: "Frontend and UX-oriented agent for visual implementation work.",
			systemPrompt: loadPrompt("designer"),
			source: "bundled",
			filePath: "embedded:designer.md",
			tools: ["read", "grep", "find", "ls", "edit", "write", "submit_result"],
			thinkingLevel: "medium",
		},
		{
			name: "librarian",
			description: "Documentation and reference-oriented research agent.",
			systemPrompt: loadPrompt("librarian"),
			source: "bundled",
			filePath: "embedded:librarian.md",
			tools: ["read", "grep", "find", "ls", "submit_result"],
			thinkingLevel: "medium",
		},
		{
			name: "task",
			description: "General-purpose subagent for bounded implementation tasks.",
			systemPrompt: loadPrompt("task"),
			source: "bundled",
			filePath: "embedded:task.md",
			spawns: "*",
			thinkingLevel: "medium",
		},
	];

	return bundledAgentsCache;
}

export const BUNDLED_AGENTS = loadBundledAgents;
