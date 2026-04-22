import type { TaskItem } from "./types.js";

interface RenderResult {
	task: string;
	assignment: string;
	id: string;
	description: string;
}

export function renderTemplate(task: TaskItem): RenderResult {
	const assignment = task.assignment.trim();
	return {
		task: assignment,
		assignment,
		id: task.id,
		description: task.description,
	};
}
