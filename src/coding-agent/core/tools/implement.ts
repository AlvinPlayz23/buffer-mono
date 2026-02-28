import type { AgentTool } from "#buffer-agent-core";
import { Type } from "@sinclair/typebox";

const implementSchema = Type.Object({});

export interface ImplementToolDetails {
	approved: boolean;
}

export interface ImplementOperations {
	confirmImplement: () => Promise<boolean>;
}

export interface ImplementToolOptions {
	operations: ImplementOperations;
}

export function createImplementTool(options: ImplementToolOptions): AgentTool<typeof implementSchema> {
	return {
		name: "implement",
		label: "implement",
		description:
			"Ask the user whether to switch to build mode and start implementation of the prepared plan right now.",
		parameters: implementSchema,
		execute: async () => {
			const approved = await options.operations.confirmImplement();
			return {
				content: [
					{
						type: "text",
						text: approved
							? "Implementation approved. Switched to build mode and queued: Implement this Plan"
							: "Implementation postponed. Staying in plan mode.",
					},
				],
				details: { approved },
			};
		},
	};
}
