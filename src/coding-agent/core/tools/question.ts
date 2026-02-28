import type { AgentTool } from "#buffer-agent-core";
import { type Static, Type } from "@sinclair/typebox";

const questionSchema = Type.Object({
	question: Type.String({ description: "Question to ask the user" }),
	options: Type.Array(Type.String(), {
		description: "Answer choices (2-3 options)",
		minItems: 2,
		maxItems: 3,
	}),
	allowCustom: Type.Optional(Type.Boolean({ description: "Allow user to type a custom answer (default: true)" })),
});

export type QuestionToolInput = Static<typeof questionSchema>;

export interface QuestionToolDetails {
	selectedIndex: number | undefined;
	isCustom: boolean;
}

export interface QuestionOperations {
	askQuestion: (question: string, options: string[], allowCustom: boolean) => Promise<{
		answer: string;
		selectedIndex?: number;
		isCustom: boolean;
	}>;
}

export interface QuestionToolOptions {
	operations: QuestionOperations;
}

export function createQuestionTool(options: QuestionToolOptions): AgentTool<typeof questionSchema> {
	return {
		name: "question",
		label: "question",
		description:
			"Ask the user a structured clarification question. Provide 2-3 options and optionally allow a custom answer.",
		parameters: questionSchema,
		execute: async (_toolCallId, input) => {
			const allowCustom = input.allowCustom ?? true;
			if (input.options.length < 2 || input.options.length > 3) {
				throw new Error("question tool requires 2-3 options");
			}

			const result = await options.operations.askQuestion(input.question, input.options, allowCustom);
			const selection = result.selectedIndex !== undefined ? `option ${result.selectedIndex + 1}` : "custom";
			return {
				content: [{ type: "text", text: `User answer (${selection}): ${result.answer}` }],
				details: {
					selectedIndex: result.selectedIndex,
					isCustom: result.isCustom,
				},
			};
		},
	};
}
