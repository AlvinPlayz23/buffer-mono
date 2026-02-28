import type { AgentTool } from "#buffer-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { access as fsAccess, mkdir as fsMkdir, writeFile as fsWriteFile } from "fs/promises";
import { basename, dirname, join, resolve, sep } from "path";
import { CONFIG_DIR_NAME } from "../../config.js";

const planCreateSchema = Type.Object({
	path: Type.String({
		description: "Markdown filename/path under .buffer (for example: plans/refactor-plan.md or refactor-plan.md)",
	}),
	content: Type.String({ description: "Markdown content for the plan file" }),
});

export type PlanCreateToolInput = Static<typeof planCreateSchema>;

export interface PlanCreateOperations {
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	mkdir: (dir: string) => Promise<void>;
	fileExists: (absolutePath: string) => Promise<boolean>;
}

const defaultOperations: PlanCreateOperations = {
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
	fileExists: async (path) => {
		try {
			await fsAccess(path);
			return true;
		} catch {
			return false;
		}
	},
};

export interface PlanCreateToolOptions {
	cwd: string;
	operations?: PlanCreateOperations;
}

async function findWorkspaceRoot(cwd: string, ops: PlanCreateOperations): Promise<string> {
	let current = resolve(cwd);
	while (true) {
		const gitPath = join(current, ".git");
		if (await ops.fileExists(gitPath)) return current;
		const parent = dirname(current);
		if (parent === current) return resolve(cwd);
		current = parent;
	}
}

function sanitizeRelativePlanPath(inputPath: string): string {
	let normalized = inputPath.trim().replace(/\\/g, "/");
	if (!normalized) throw new Error("Path is required");
	if (!normalized.toLowerCase().endsWith(".md")) {
		throw new Error("plan_create only supports .md files");
	}
	if (normalized.startsWith("/")) {
		throw new Error("Path must be relative to .buffer");
	}
	if (normalized.toLowerCase().startsWith(`${CONFIG_DIR_NAME.toLowerCase()}/`)) {
		normalized = normalized.slice(CONFIG_DIR_NAME.length + 1);
	}
	return normalized;
}

export function createPlanCreateTool(options: PlanCreateToolOptions): AgentTool<typeof planCreateSchema> {
	const ops = options.operations ?? defaultOperations;

	return {
		name: "plan_create",
		label: "plan_create",
		description: `Create a Markdown plan file under ${CONFIG_DIR_NAME} in the workspace root.`,
		parameters: planCreateSchema,
		execute: async (_toolCallId, { path, content }) => {
			const relativePlanPath = sanitizeRelativePlanPath(path);
			const workspaceRoot = await findWorkspaceRoot(options.cwd, ops);
			const bufferDir = resolve(workspaceRoot, CONFIG_DIR_NAME);
			const targetPath = resolve(bufferDir, relativePlanPath);
			const normalizedBufferDir = bufferDir.endsWith(sep) ? bufferDir : `${bufferDir}${sep}`;
			if (targetPath !== bufferDir && !targetPath.startsWith(normalizedBufferDir)) {
				throw new Error(`Path must stay within ${CONFIG_DIR_NAME}`);
			}

			await ops.mkdir(dirname(targetPath));
			await ops.writeFile(targetPath, content);

			return {
				content: [
					{
						type: "text",
						text: `Plan saved to ${join(CONFIG_DIR_NAME, relativePlanPath).replace(/\\/g, "/")} (${basename(targetPath)})`,
					},
				],
				details: undefined,
			};
		},
	};
}
