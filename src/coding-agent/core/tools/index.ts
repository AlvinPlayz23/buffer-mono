export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	bashTool,
	createBashTool,
} from "./bash.js";
export {
	createEditTool,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	editTool,
} from "./edit.js";
export {
	createFindTool,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	findTool,
} from "./find.js";
export {
	createGrepTool,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	grepTool,
} from "./grep.js";
export {
	createImplementTool,
	type ImplementOperations,
	type ImplementToolDetails,
	type ImplementToolOptions,
} from "./implement.js";
export {
	createLsTool,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	lsTool,
} from "./ls.js";
export {
	createReadTool,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	readTool,
} from "./read.js";
export {
	AskTool,
	createAskTool,
	type AskToolDetails,
	type AskToolInput,
	type AskToolSession,
	askToolRenderer,
} from "./ask.js";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.js";
export {
	createPlanCreateTool,
	type PlanCreateOperations,
	type PlanCreateToolInput,
	type PlanCreateToolOptions,
} from "./plan-create.js";
export {
	createWriteTool,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
	writeTool,
} from "./write.js";
export { createTaskTool, type TaskToolSession } from "../task/index.js";

import type { AgentTool } from "#buffer-agent-core";
import { createTaskTool, type TaskToolSession } from "../task/index.js";
import { type BashToolOptions, bashTool, createBashTool } from "./bash.js";
import { createEditTool, editTool } from "./edit.js";
import { createFindTool, findTool } from "./find.js";
import { createGrepTool, grepTool } from "./grep.js";
import { createImplementTool, type ImplementToolOptions } from "./implement.js";
import { createLsTool, lsTool } from "./ls.js";
import { createPlanCreateTool } from "./plan-create.js";
import { createAskTool, type AskToolSession } from "./ask.js";
import { createReadTool, type ReadToolOptions, readTool } from "./read.js";
import { createWriteTool, writeTool } from "./write.js";

/** Tool type (AgentTool from pi-ai) */
export type Tool = AgentTool<any>;

// Default tools for full access mode (using process.cwd())
export const codingTools: Tool[] = [readTool, bashTool, editTool, writeTool];

// Read-only tools for exploration without modification (using process.cwd())
export const readOnlyTools: Tool[] = [readTool, grepTool, findTool, lsTool];

// All available tools (using process.cwd())
export const allTools = {
	read: readTool,
	bash: bashTool,
	edit: editTool,
	write: writeTool,
	grep: grepTool,
	find: findTool,
	ls: lsTool,
	implement: createImplementTool({
		operations: {
			confirmImplement: async () => {
				throw new Error("Implement tool is not available in this runtime.");
			},
		},
	}),
	ask: createAskTool({ hasUI: false }),
	plan_create: createPlanCreateTool({ cwd: process.cwd() }),
	task: createTaskTool({
		cwd: process.cwd(),
		model: undefined,
		modelRegistry: undefined,
		settingsManager: {
			getTaskMaxConcurrency: () => 3,
			getTaskMaxRecursionDepth: () => 2,
			getTaskShowProgress: () => true,
			getTaskMaxOutputBytes: () => 500000,
			getTaskMaxOutputLines: () => 5000,
		},
		resourceLoader: {
			getExtensions: () => ({ extensions: [], errors: [], runtime: {} as any }),
			getSkills: () => ({ skills: [], diagnostics: [] }),
			getPrompts: () => ({ prompts: [], diagnostics: [] }),
			getThemes: () => ({ themes: [], diagnostics: [] }),
			getAgentsFiles: () => ({ agentsFiles: [] }),
			getSystemPrompt: () => undefined,
			getAppendSystemPrompt: () => [],
			getPathMetadata: () => new Map(),
			extendResources: () => undefined,
			reload: async () => undefined,
		},
	}),
};

export type ToolName = keyof typeof allTools;

export interface ToolsOptions {
	/** Options for the read tool */
	read?: ReadToolOptions;
	/** Options for the bash tool */
	bash?: BashToolOptions;
	/** Options for the ask tool */
	ask?: AskToolSession;
	/** Options for the implement tool */
	implement?: ImplementToolOptions;
	/** Task tool session */
	task?: TaskToolSession;
}

/**
 * Create coding tools configured for a specific working directory.
 */
export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd),
		createWriteTool(cwd),
	];
}

/**
 * Create read-only tools configured for a specific working directory.
 */
export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [createReadTool(cwd, options?.read), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd)];
}

/**
 * Create all tools configured for a specific working directory.
 */
export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
		implement: createImplementTool(
			options?.implement ?? {
				operations: {
					confirmImplement: async () => {
						throw new Error("Implement tool is not available in this runtime.");
					},
				},
			},
		),
		ask: createAskTool(options?.ask ?? { hasUI: false }) as AgentTool,
		plan_create: createPlanCreateTool({ cwd }),
		task: createTaskTool(
			options?.task ?? {
				cwd,
				model: undefined,
				modelRegistry: undefined,
				settingsManager: {
					getTaskMaxConcurrency: () => 3,
					getTaskMaxRecursionDepth: () => 2,
					getTaskShowProgress: () => true,
					getTaskMaxOutputBytes: () => 500000,
					getTaskMaxOutputLines: () => 5000,
				},
				resourceLoader: {
					getExtensions: () => ({ extensions: [], errors: [], runtime: {} as any }),
					getSkills: () => ({ skills: [], diagnostics: [] }),
					getPrompts: () => ({ prompts: [], diagnostics: [] }),
					getThemes: () => ({ themes: [], diagnostics: [] }),
					getAgentsFiles: () => ({ agentsFiles: [] }),
					getSystemPrompt: () => undefined,
					getAppendSystemPrompt: () => [],
					getPathMetadata: () => new Map(),
					extendResources: () => undefined,
					reload: async () => undefined,
				},
			},
		),
	};
}
