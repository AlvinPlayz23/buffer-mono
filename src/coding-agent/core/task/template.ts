import { getTaskSimpleModeCapabilities, type TaskSimpleMode } from "./simple-mode.js";
import type { TaskItem } from "./types.js";

interface RenderResult {
	task: string;
	assignment: string;
	id: string;
	description: string;
}

export function renderTemplate(
	context: string | undefined,
	task: TaskItem,
	simpleMode: TaskSimpleMode = "default",
): RenderResult {
	const assignment = task.assignment.trim();
	const { contextEnabled } = getTaskSimpleModeCapabilities(simpleMode);
	const trimmedContext = contextEnabled ? context?.trim() : undefined;

	if (!trimmedContext) {
		return {
			task: assignment,
			assignment,
			id: task.id,
			description: task.description,
		};
	}

	return {
		task: `<shared_context>\n${trimmedContext}\n</shared_context>\n\n<task_assignment>\n${assignment}\n</task_assignment>`,
		assignment,
		id: task.id,
		description: task.description,
	};
}
