import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentEvent, AgentToolResult, AgentToolUpdateCallback, ThinkingLevel } from "#buffer-agent-core";
import type { AgentTool, AgentToolUpdateCallback as CoreUpdateCallback } from "#buffer-agent-core";
import { createAgentSession } from "../sdk.js";
import { createExtensionRuntime } from "../extensions/loader.js";
import type { LoadExtensionsResult } from "../extensions/types.js";
import { SessionManager } from "../session-manager.js";
import type { ResourceLoader } from "../resource-loader.js";
import { MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES, TASK_SUBAGENT_EVENT_CHANNEL, TASK_SUBAGENT_LIFECYCLE_CHANNEL, type AgentDefinition, type AgentProgress, type ReviewFinding, type SingleResult } from "./types.js";
import { subprocessToolRegistry } from "./subprocess-tool-registry.js";

export interface SubmitResultItem {
	data?: unknown;
	status?: "success" | "aborted";
	error?: string;
}

export interface ExecutorOptions {
	cwd: string;
	agent: AgentDefinition;
	task: string;
	assignment?: string;
	description?: string;
	index: number;
	id: string;
	modelOverride?: string | string[];
	thinkingLevel?: ThinkingLevel;
	outputSchema?: unknown;
	taskDepth?: number;
	signal?: AbortSignal;
	onProgress?: (progress: AgentProgress) => void;
	artifactsDir?: string;
	contextFile?: string;
	eventBus?: { emit(channel: string, data: unknown): void };
	parentSession: {
		model: any;
		modelRegistry: any;
		settingsManager: any;
		resourceLoader: ResourceLoader;
	};
}

function truncateOutput(text: string): { content: string; truncated: boolean } {
	const lines = text.split("\n");
	let result = text;
	let truncated = false;
	if (lines.length > MAX_OUTPUT_LINES) {
		result = lines.slice(-MAX_OUTPUT_LINES).join("\n");
		truncated = true;
	}
	if (Buffer.byteLength(result, "utf-8") > MAX_OUTPUT_BYTES) {
		const buffer = Buffer.from(result, "utf-8");
		result = buffer.subarray(buffer.length - MAX_OUTPUT_BYTES).toString("utf-8");
		truncated = true;
	}
	return { content: result, truncated };
}

function aggregateUsage(messages: Array<{ role?: string; usage?: any }>): any | undefined {
	let hasUsage = false;
	const total = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	for (const message of messages) {
		if (message.role !== "assistant" || !message.usage) continue;
		hasUsage = true;
		total.input += message.usage.input ?? 0;
		total.output += message.usage.output ?? 0;
		total.cacheRead += message.usage.cacheRead ?? 0;
		total.cacheWrite += message.usage.cacheWrite ?? 0;
		total.cost.input += message.usage.cost?.input ?? 0;
		total.cost.output += message.usage.cost?.output ?? 0;
		total.cost.cacheRead += message.usage.cost?.cacheRead ?? 0;
		total.cost.cacheWrite += message.usage.cost?.cacheWrite ?? 0;
		total.cost.total += message.usage.cost?.total ?? 0;
	}
	if (!hasUsage) return undefined;
	return {
		...total,
		totalTokens: total.input + total.output + total.cacheRead + total.cacheWrite,
	};
}

function extractAssistantText(messages: Array<{ role?: string; content?: any }>): string {
	const parts: string[] = [];
	for (const message of messages) {
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const item of message.content) {
			if (item?.type === "text" && typeof item.text === "string") {
				parts.push(item.text);
			}
		}
	}
	return parts.join("");
}

function createSubmitResultTool(state: { items: SubmitResultItem[] }): AgentTool<any, { submitted: boolean }> {
	return {
		name: "submit_result",
		label: "Submit Result",
		description: "Finalize the delegated task and return the result payload.",
		parameters: {
			type: "object",
			properties: {
				result: {
					type: "object",
					properties: {
						data: {},
						error: { type: "string" },
						aborted: { type: "boolean" },
					},
				},
			},
			required: ["result"],
		} as any,
		execute: async (_toolCallId: string, params: any): Promise<AgentToolResult<{ submitted: boolean }>> => {
			const result = params?.result ?? {};
			state.items.push({
				data: result.data,
				error: typeof result.error === "string" ? result.error : undefined,
				status: result.aborted ? "aborted" : "success",
			});
			return {
				content: [{ type: "text", text: "Result submitted." }],
				details: { submitted: true },
			};
		},
	};
}

function createSubagentResourceLoader(parent: ResourceLoader): ResourceLoader {
	const emptyExtensions: LoadExtensionsResult = {
		extensions: [],
		errors: [],
		runtime: createExtensionRuntime(),
	};
	return {
		getExtensions: () => emptyExtensions,
		getSkills: () => parent.getSkills(),
		getPrompts: () => parent.getPrompts(),
		getThemes: () => parent.getThemes(),
		getAgentsFiles: () => parent.getAgentsFiles(),
		getSystemPrompt: () => parent.getSystemPrompt(),
		getAppendSystemPrompt: () => parent.getAppendSystemPrompt(),
		getPathMetadata: () => parent.getPathMetadata(),
		extendResources: (paths) => parent.extendResources(paths),
		reload: async () => undefined,
	};
}

function buildSubagentSystemPrompt(base: string, agent: AgentDefinition, contextFile?: string): string {
	const parts = [
		base,
		"",
		"## Delegated Subtask",
		agent.systemPrompt.trim(),
		"",
		"You are operating on a delegated subtask.",
		"No progress chatter. Execute the assignment and call `submit_result` exactly once when done.",
	];
	if (contextFile) {
		parts.push(`If needed, inspect parent context in \`${contextFile}\`.`);
	}
	return parts.join("\n");
}

export async function runSubprocess(options: ExecutorOptions): Promise<SingleResult> {
	const startTime = Date.now();
	const progress: AgentProgress = {
		index: options.index,
		id: options.id,
		agent: options.agent.name,
		agentSource: options.agent.source,
		status: "running",
		task: options.task,
		assignment: options.assignment,
		description: options.description,
		recentTools: [],
		recentOutput: [],
		toolCount: 0,
		tokens: 0,
		durationMs: 0,
		modelOverride: options.modelOverride,
	};
	const emitProgress = () => {
		progress.durationMs = Date.now() - startTime;
		options.onProgress?.({ ...progress, recentTools: [...progress.recentTools], recentOutput: [...progress.recentOutput] });
	};

	if (options.signal?.aborted) {
		return {
			index: options.index,
			id: options.id,
			agent: options.agent.name,
			agentSource: options.agent.source,
			task: options.task,
			assignment: options.assignment,
			description: options.description,
			exitCode: 1,
			output: "",
			stderr: "Cancelled before start",
			truncated: false,
			durationMs: 0,
			tokens: 0,
			modelOverride: options.modelOverride,
			aborted: true,
			abortReason: "Cancelled before start",
		};
	}

	const submitState = { items: [] as SubmitResultItem[] };
	const sessionManager = SessionManager.inMemory(options.cwd);
	const resourceLoader = createSubagentResourceLoader(options.parentSession.resourceLoader);
	const child = await createAgentSession({
		cwd: options.cwd,
		model: options.parentSession.model,
		thinkingLevel: options.thinkingLevel,
		modelRegistry: options.parentSession.modelRegistry,
		settingsManager: options.parentSession.settingsManager,
		sessionManager,
		resourceLoader,
		customTools: [
			{
				name: "submit_result",
				label: "Submit Result",
				description: "Finalize the delegated task and return the result payload.",
				parameters: {
					type: "object",
					properties: {
						result: {
							type: "object",
							properties: {
								data: {},
								error: { type: "string" },
								aborted: { type: "boolean" },
							},
							required: [],
						},
					},
					required: ["result"],
				} as any,
				execute: async (_toolCallId, params) =>
					createSubmitResultTool(submitState).execute(_toolCallId, params, undefined, undefined as CoreUpdateCallback<{ submitted: boolean }> | undefined),
			},
		],
	});
	const session = child.session;

	const toolNames = options.agent.tools?.length ? [...options.agent.tools] : ["read", "bash", "edit", "write", "grep", "find", "ls", "ask"];
	if ((options.taskDepth ?? 0) >= 2) {
		session.setActiveToolsByName(toolNames.filter((name) => name !== "task"));
	} else {
		session.setActiveToolsByName(toolNames);
	}
	session.agent.setSystemPrompt(buildSubagentSystemPrompt(session.systemPrompt, options.agent, options.contextFile));

	options.eventBus?.emit(TASK_SUBAGENT_LIFECYCLE_CHANNEL, {
		id: options.id,
		agent: options.agent.name,
		agentSource: options.agent.source,
		description: options.description,
		status: "started",
		index: options.index,
	});

	const unsubscribe = session.subscribe((event) => {
		options.eventBus?.emit(TASK_SUBAGENT_EVENT_CHANNEL, {
			index: options.index,
			agent: options.agent.name,
			agentSource: options.agent.source,
			task: options.task,
			assignment: options.assignment,
			event,
		});
		switch (event.type) {
			case "tool_execution_start":
				progress.toolCount += 1;
				progress.currentTool = event.toolName;
				progress.currentToolArgs = JSON.stringify(event.args ?? {}).slice(0, 120);
				progress.currentToolStartMs = Date.now();
				emitProgress();
				break;
			case "tool_execution_end": {
				if (progress.currentTool) {
					progress.recentTools.unshift({
						tool: progress.currentTool,
						args: progress.currentToolArgs ?? "",
						endMs: Date.now(),
					});
					progress.recentTools = progress.recentTools.slice(0, 5);
				}
				progress.currentTool = undefined;
				progress.currentToolArgs = undefined;
				progress.currentToolStartMs = undefined;
				const handler = subprocessToolRegistry.getHandler(event.toolName);
				const extracted = handler?.extractData?.({
					toolName: event.toolName,
					toolCallId: event.toolCallId,
					args: undefined,
					result: event.result,
					isError: event.isError,
				});
				if (extracted !== undefined) {
					progress.extractedToolData ??= {};
					progress.extractedToolData[event.toolName] ??= [];
					progress.extractedToolData[event.toolName].push(extracted);
				}
				emitProgress();
				break;
			}
			case "message_update":
				if (event.message.role === "assistant" && Array.isArray(event.message.content)) {
					const text = extractAssistantText([event.message as any]);
					progress.recentOutput = text.split("\n").filter(Boolean).slice(-8).reverse();
					emitProgress();
				}
				break;
			case "message_end":
				if (event.message.role === "assistant") {
					progress.tokens += (event.message as any).usage?.total ?? 0;
					const text = extractAssistantText([event.message as any]);
					progress.recentOutput = text.split("\n").filter(Boolean).slice(-8).reverse();
					emitProgress();
				}
				break;
		}
	});

	let exitCode = 0;
	let stderr = "";
	let aborted = false;
	try {
		await session.prompt(options.task, { source: "extension", expandPromptTemplates: false });
		await session.agent.waitForIdle();

		for (let retry = 0; retry < 3 && submitState.items.length === 0 && !options.signal?.aborted; retry++) {
			await session.prompt(
				`You stopped without calling submit_result. This is reminder ${retry + 1} of 3. Call submit_result exactly once now with result.data, result.error, or result.aborted.`,
				{ source: "extension", expandPromptTemplates: false },
			);
			await session.agent.waitForIdle();
		}

		if (submitState.items.length === 0) {
			exitCode = 1;
			stderr = "Subagent exited without calling submit_result.";
		}
	} catch (error) {
		exitCode = 1;
		stderr = error instanceof Error ? error.message : String(error);
		aborted = options.signal?.aborted ?? false;
	} finally {
		unsubscribe();
	}

	const lastSubmit = submitState.items[submitState.items.length - 1];
	if (lastSubmit?.status === "aborted") {
		aborted = true;
		exitCode = 1;
		stderr = lastSubmit.error ?? "Subagent aborted";
	}
	if (lastSubmit?.error) {
		exitCode = 1;
		stderr = lastSubmit.error;
	}

	let rawOutput =
		lastSubmit?.data !== undefined ? JSON.stringify(lastSubmit.data, null, 2) : extractAssistantText(session.messages as any[]);
	if (!rawOutput && stderr) {
		rawOutput = stderr;
	}
	const output = truncateOutput(rawOutput);

	let outputPath: string | undefined;
	if (options.artifactsDir) {
		await mkdir(options.artifactsDir, { recursive: true });
		outputPath = path.join(options.artifactsDir, `${options.id}.md`);
		await writeFile(outputPath, rawOutput, "utf-8");
	}

	progress.status = aborted ? "aborted" : exitCode === 0 ? "completed" : "failed";
	emitProgress();
	options.eventBus?.emit(TASK_SUBAGENT_LIFECYCLE_CHANNEL, {
		id: options.id,
		agent: options.agent.name,
		agentSource: options.agent.source,
		description: options.description,
		status: progress.status,
		index: options.index,
	});

	return {
		index: options.index,
		id: options.id,
		agent: options.agent.name,
		agentSource: options.agent.source,
		task: options.task,
		assignment: options.assignment,
		description: options.description,
		lastIntent: progress.lastIntent,
		exitCode,
		output: output.content,
		stderr,
		truncated: output.truncated,
		durationMs: Date.now() - startTime,
		tokens: progress.tokens,
		modelOverride: options.modelOverride,
		error: exitCode !== 0 ? stderr : undefined,
		aborted,
		abortReason: aborted ? stderr || "Subagent aborted" : undefined,
		usage: aggregateUsage(session.messages as any[]),
		outputPath,
		extractedToolData: progress.extractedToolData,
		outputMeta: { lineCount: rawOutput.split("\n").length, charCount: rawOutput.length },
	};
}
