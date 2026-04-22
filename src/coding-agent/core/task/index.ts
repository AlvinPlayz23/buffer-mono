import { mkdir } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentTool, AgentToolResult, AgentToolUpdateCallback } from "#buffer-agent-core";
import type { TSchema } from "@sinclair/typebox";
import { discoverAgents, getAgent } from "./discovery.js";
import { runSubprocess } from "./executor.js";
import { AgentOutputManager } from "./output-manager.js";
import { mapWithConcurrencyLimit } from "./parallel.js";
import type { TaskSimpleMode } from "./simple-mode.js";
import { renderTemplate } from "./template.js";
import type { AgentDefinition, AgentProgress, SingleResult, TaskParams, TaskToolDetails } from "./types.js";
import { getTaskSchema } from "./types.js";

export type { AgentDefinition, AgentProgress, SingleResult, TaskParams, TaskToolDetails } from "./types.js";
export { TASK_SUBAGENT_EVENT_CHANNEL, TASK_SUBAGENT_LIFECYCLE_CHANNEL, TASK_SUBAGENT_PROGRESS_CHANNEL } from "./types.js";

export interface TaskToolSession {
	cwd: string;
	model: unknown;
	modelRegistry: unknown;
	settingsManager: {
		getTaskMaxConcurrency(): number;
		getTaskMaxRecursionDepth(): number;
		getTaskShowProgress(): boolean;
		getTaskMaxOutputBytes(): number;
		getTaskMaxOutputLines(): number;
	};
	resourceLoader: any;
	taskEventBus?: { emit(channel: string, data: unknown): void };
	listTaskAgents?: () => Promise<AgentDefinition[]>;
}

function hasMutatingTools(agent: AgentDefinition): boolean {
	const tools = new Set(agent.tools ?? []);
	return tools.size === 0 || tools.has("edit") || tools.has("write") || tools.has("bash") || tools.has("task");
}

function buildDescription(agents: AgentDefinition[]): string {
	const lines = ["Launches subagents to parallelize bounded work.", "", "Available agents:"];
	for (const agent of agents) {
		lines.push(`- ${agent.name}: ${agent.description}`);
	}
	return lines.join("\n");
}

function summarizeResults(results: SingleResult[], durationMs: number): string {
	const successCount = results.filter((result) => result.exitCode === 0 && !result.aborted).length;
	const lines = [`${successCount}/${results.length} succeeded [${Math.ceil(durationMs / 1000)}s]`, ""];
	for (const result of results) {
		const status = result.aborted ? "aborted" : result.exitCode === 0 ? "completed" : "failed";
		const preview = (result.output || result.stderr || "(no output)").trim();
		lines.push(`${result.id} · ${result.agent} · ${status}`);
		lines.push(preview.slice(0, 1000));
		lines.push("");
	}
	return lines.join("\n").trim();
}

function aggregateUsage(results: SingleResult[]): any | undefined {
	let hasUsage = false;
	const total = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	for (const result of results) {
		if (!result.usage) continue;
		hasUsage = true;
		total.input += result.usage.input ?? 0;
		total.output += result.usage.output ?? 0;
		total.cacheRead += result.usage.cacheRead ?? 0;
		total.cacheWrite += result.usage.cacheWrite ?? 0;
		total.cost.input += result.usage.cost?.input ?? 0;
		total.cost.output += result.usage.cost?.output ?? 0;
		total.cost.cacheRead += result.usage.cost?.cacheRead ?? 0;
		total.cost.cacheWrite += result.usage.cost?.cacheWrite ?? 0;
		total.cost.total += result.usage.cost?.total ?? 0;
	}
	return hasUsage ? { ...total, totalTokens: total.input + total.output + total.cacheRead + total.cacheWrite } : undefined;
}

export class TaskTool implements AgentTool<TSchema, TaskToolDetails> {
	readonly name = "task";
	readonly label = "Task";
	readonly strict = true;

	#agents: AgentDefinition[];

	private constructor(private readonly session: TaskToolSession, agents: AgentDefinition[]) {
		this.#agents = agents;
	}

	static create(session: TaskToolSession): TaskTool {
		return new TaskTool(session, []);
	}

	get description(): string {
		return this.#agents.length > 0
			? `${buildDescription(this.#agents)}\n\nUse normal natural-language assignments. Describe the outcome, target files, and constraints. Do not micromanage shell commands unless an exact command or snippet is required.`
			: "Launches subagents to parallelize bounded work. Use normal natural-language assignments; avoid scripting each command unless exact commands are required.";
	}

	get parameters(): TSchema {
		return getTaskSchema({ isolationEnabled: false, simpleMode: "default" as TaskSimpleMode });
	}

	async execute(
		_toolCallId: string,
		rawParams: unknown,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TaskToolDetails>,
	): Promise<AgentToolResult<TaskToolDetails>> {
		const params = rawParams as TaskParams;
		const startTime = Date.now();
		const { agents, projectAgentsDir } = await discoverAgents(this.session.cwd);
		this.#agents = agents;
		const selectedAgent = getAgent(agents, params.agent);
		if (!selectedAgent) {
			return {
				content: [{ type: "text", text: `Unknown agent "${params.agent}".` }],
				details: { projectAgentsDir, results: [], totalDurationMs: 0 },
			};
		}

		const renderedTasks = params.tasks.map((task) => renderTemplate(task));
		const progress = new Map<number, AgentProgress>();
		for (let index = 0; index < renderedTasks.length; index++) {
			const task = renderedTasks[index]!;
			progress.set(index, {
				index,
				id: task.id,
				agent: selectedAgent.name,
				agentSource: selectedAgent.source,
				status: "pending",
				task: task.task,
				assignment: task.assignment,
				description: task.description,
				recentTools: [],
				recentOutput: [],
				toolCount: 0,
				tokens: 0,
				durationMs: 0,
			});
		}

		const tempArtifactsDir = path.join(os.tmpdir(), `buffer-task-${randomUUID()}`);
		await mkdir(tempArtifactsDir, { recursive: true });

		const outputManager = new AgentOutputManager(() => tempArtifactsDir);
		const uniqueIds = await outputManager.allocateBatch(renderedTasks.map((task) => task.id));
		const effectiveConcurrency = hasMutatingTools(selectedAgent)
			? 1
			: Math.max(1, this.session.settingsManager.getTaskMaxConcurrency());

		const emitUpdate = () => {
			onUpdate?.({
				content: [{ type: "text", text: `Running ${renderedTasks.length} subagents...` }],
				details: {
					projectAgentsDir,
					results: [],
					totalDurationMs: Date.now() - startTime,
					progress: Array.from(progress.values()).sort((a, b) => a.index - b.index),
				},
			});
		};
		emitUpdate();

		const { results: partialResults } = await mapWithConcurrencyLimit(
			renderedTasks.map((task, index) => ({ ...task, uniqueId: uniqueIds[index]!, index })),
			effectiveConcurrency,
			async (task) => {
				progress.get(task.index)!.status = "running";
				emitUpdate();
				const result = await runSubprocess({
					cwd: this.session.cwd,
					agent: selectedAgent,
					task: task.task,
					assignment: task.assignment,
					description: task.description,
					index: task.index,
					id: task.uniqueId,
					outputSchema: params.schema ? JSON.parse(params.schema) : selectedAgent.output,
					taskDepth: 0,
					signal,
					artifactsDir: tempArtifactsDir,
					eventBus: this.session.taskEventBus,
					parentSession: this.session,
					onProgress: (next) => {
						progress.set(task.index, next);
						emitUpdate();
					},
				});
				progress.get(task.index)!.status = result.aborted ? "aborted" : result.exitCode === 0 ? "completed" : "failed";
				emitUpdate();
				return result;
			},
			signal,
		);

		const results = partialResults.filter((result): result is SingleResult => result !== undefined);
		const outputPaths = results.map((result) => result.outputPath).filter((value): value is string => Boolean(value));
		const totalDurationMs = Date.now() - startTime;

		return {
			content: [{ type: "text", text: summarizeResults(results, totalDurationMs) }],
			details: {
				projectAgentsDir,
				results,
				totalDurationMs,
				usage: aggregateUsage(results),
				outputPaths,
				progress: Array.from(progress.values()).sort((a, b) => a.index - b.index),
			},
		};
	}
}

export function createTaskTool(session: TaskToolSession): TaskTool {
	return TaskTool.create(session);
}
