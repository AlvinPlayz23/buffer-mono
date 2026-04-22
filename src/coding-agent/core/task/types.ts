import type { ThinkingLevel } from "#buffer-agent-core";
import type { Usage } from "#buffer-ai";
import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { getTaskSimpleModeCapabilities, type TaskSimpleMode } from "./simple-mode.js";

export type AgentSource = "bundled" | "user" | "project";

function parseNumber(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_OUTPUT_BYTES = parseNumber(process.env.BUFFER_TASK_MAX_OUTPUT_BYTES, 500_000);
export const MAX_OUTPUT_LINES = parseNumber(process.env.BUFFER_TASK_MAX_OUTPUT_LINES, 5000);

export const TASK_SUBAGENT_EVENT_CHANNEL = "task:subagent:event";
export const TASK_SUBAGENT_PROGRESS_CHANNEL = "task:subagent:progress";
export const TASK_SUBAGENT_LIFECYCLE_CHANNEL = "task:subagent:lifecycle";

export interface SubagentProgressPayload {
	index: number;
	agent: string;
	agentSource: AgentSource;
	task: string;
	assignment?: string;
	progress: AgentProgress;
	sessionFile?: string;
}

export interface SubagentLifecyclePayload {
	id: string;
	agent: string;
	agentSource: AgentSource;
	description?: string;
	status: "started" | "completed" | "failed" | "aborted";
	sessionFile?: string;
	index: number;
}

const assignmentDescription =
	"Self-contained natural-language assignment for one subagent. State the target files or area, the desired outcome, and any key constraints. Do not script every command unless an exact snippet or command is required.";

const createTaskItemSchema = () =>
	Type.Object({
		id: Type.String({ description: "CamelCase identifier, max 48 chars", maxLength: 48 }),
		description: Type.String({ description: "Short display label for UI only" }),
		assignment: Type.String({
			description: assignmentDescription,
		}),
	});

export const taskItemSchema = createTaskItemSchema();
export type TaskItem = Static<typeof taskItemSchema>;

const createTaskSchema = (options: { simpleMode: TaskSimpleMode }) => {
	const { customSchemaEnabled } = getTaskSimpleModeCapabilities(options.simpleMode);
	const properties: Record<string, TSchema> = {
		agent: Type.String({ description: "Agent type for all tasks in this batch" }),
		tasks: Type.Array(createTaskItemSchema(), {
			description: "Tasks to execute. Keep each task explicitly scoped and independently understandable.",
			minItems: 1,
		}),
	};

	if (customSchemaEnabled) {
		properties.schema = Type.Optional(
			Type.String({
				description: "JSON-encoded schema for expected output. Put output format here, not in assignments.",
			}),
		);
	}

	return Type.Object(properties);
};

export const taskSchema = createTaskSchema({ simpleMode: "default" });
const taskSchemaSchemaFree = createTaskSchema({ simpleMode: "schema-free" });
const taskSchemaIndependent = createTaskSchema({ simpleMode: "independent" });

type DynamicTaskSchema = typeof taskSchema | typeof taskSchemaSchemaFree | typeof taskSchemaIndependent;

export function getTaskSchema(options: { isolationEnabled: boolean; simpleMode: TaskSimpleMode }): DynamicTaskSchema {
	switch (options.simpleMode) {
		case "schema-free":
			return taskSchemaSchemaFree;
		case "independent":
			return taskSchemaIndependent;
		default:
			return taskSchema;
	}
}

export interface TaskParams {
	agent: string;
	schema?: string;
	tasks: TaskItem[];
}

export interface ReviewFinding {
	title: string;
	body: string;
	priority: number;
	confidence: number;
	file_path: string;
	line_start: number;
	line_end: number;
}

export interface AgentDefinition {
	name: string;
	description: string;
	systemPrompt: string;
	tools?: string[];
	spawns?: string[] | "*";
	model?: string[];
	output?: unknown;
	thinkingLevel?: ThinkingLevel;
	blocking?: boolean;
	source: AgentSource;
	filePath?: string;
}

export interface AgentProgress {
	index: number;
	id: string;
	agent: string;
	agentSource: AgentSource;
	status: "pending" | "running" | "completed" | "failed" | "aborted";
	task: string;
	assignment?: string;
	description?: string;
	lastIntent?: string;
	currentTool?: string;
	currentToolArgs?: string;
	currentToolStartMs?: number;
	recentTools: Array<{ tool: string; args: string; endMs: number }>;
	recentOutput: string[];
	toolCount: number;
	tokens: number;
	durationMs: number;
	modelOverride?: string | string[];
	extractedToolData?: Record<string, unknown[]>;
}

export interface SingleResult {
	index: number;
	id: string;
	agent: string;
	agentSource: AgentSource;
	task: string;
	assignment?: string;
	description?: string;
	lastIntent?: string;
	exitCode: number;
	output: string;
	stderr: string;
	truncated: boolean;
	durationMs: number;
	tokens: number;
	modelOverride?: string | string[];
	error?: string;
	aborted?: boolean;
	abortReason?: string;
	usage?: Usage;
	outputPath?: string;
	extractedToolData?: Record<string, unknown[]>;
	outputMeta?: { lineCount: number; charCount: number };
}

export interface TaskToolDetails {
	projectAgentsDir: string | null;
	results: SingleResult[];
	totalDurationMs: number;
	usage?: Usage;
	outputPaths?: string[];
	progress?: AgentProgress[];
}
