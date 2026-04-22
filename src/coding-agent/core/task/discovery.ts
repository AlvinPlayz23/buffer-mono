import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "../../config.js";
import { loadBundledAgents, parseAgent } from "./agents.js";
import type { AgentDefinition, AgentSource } from "./types.js";

export interface DiscoveryResult {
	agents: AgentDefinition[];
	projectAgentsDir: string | null;
}

async function loadAgentsFromDir(dir: string, source: AgentSource): Promise<AgentDefinition[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name));
		const loaded = await Promise.all(
			files.map(async (entry) => {
				const filePath = join(dir, entry.name);
				try {
					const content = await readFile(filePath, "utf-8");
					return parseAgent(filePath, content, source);
				} catch {
					return null;
				}
			}),
		);
		return loaded.filter((agent): agent is AgentDefinition => agent !== null);
	} catch {
		return [];
	}
}

export async function discoverAgents(cwd: string): Promise<DiscoveryResult> {
	const globalAgentsDir = join(getAgentDir(), "agents");
	const projectAgentsDir = join(cwd, CONFIG_DIR_NAME, "agents");

	const [projectAgents, userAgents] = await Promise.all([
		loadAgentsFromDir(projectAgentsDir, "project"),
		loadAgentsFromDir(globalAgentsDir, "user"),
	]);

	const seen = new Set<string>();
	const merged: AgentDefinition[] = [];
	for (const agent of [...projectAgents, ...userAgents, ...loadBundledAgents()]) {
		if (seen.has(agent.name)) continue;
		seen.add(agent.name);
		merged.push(agent);
	}

	return {
		agents: merged,
		projectAgentsDir: projectAgents.length > 0 ? projectAgentsDir : null,
	};
}

export function getAgent(agents: AgentDefinition[], name: string): AgentDefinition | undefined {
	return agents.find((agent) => agent.name === name);
}
