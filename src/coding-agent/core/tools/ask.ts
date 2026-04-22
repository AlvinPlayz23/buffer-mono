import { readFileSync } from "node:fs";
import type { AgentTool, AgentToolResult, AgentToolUpdateCallback } from "#buffer-agent-core";
import {
	type Component,
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	truncateToWidth,
} from "#buffer-tui";
import { type Static, Type } from "@sinclair/typebox";
import type { ToolRenderResultOptions, ExtensionUIContext } from "../extensions/types.js";
import type { Theme } from "../../modes/interactive/theme/theme.js";

const askDescription = readFileSync(new URL("../prompts/tools/ask.md", import.meta.url), "utf-8");

const OptionItem = Type.Object({
	label: Type.String({ description: "Display label" }),
});

const QuestionItem = Type.Object({
	id: Type.String({ description: "Question ID, e.g. 'auth', 'cache'" }),
	question: Type.String({ description: "Question text" }),
	options: Type.Array(OptionItem, { description: "Available options" }),
	multi: Type.Optional(Type.Boolean({ description: "Allow multiple selections" })),
	recommended: Type.Optional(Type.Number({ description: "Index of recommended option (0-indexed)" })),
});

const askSchema = Type.Object({
	questions: Type.Array(QuestionItem, { description: "Questions to ask", minItems: 1 }),
});

export type AskToolInput = Static<typeof askSchema>;

export interface QuestionResult {
	id: string;
	question: string;
	options: string[];
	multi: boolean;
	selectedOptions: string[];
	customInput?: string;
}

export interface AskToolDetails {
	question?: string;
	options?: string[];
	multi?: boolean;
	selectedOptions?: string[];
	customInput?: string;
	results?: QuestionResult[];
	cancelled?: boolean;
	timedOut?: boolean;
}

export interface AskToolSession {
	hasUI: boolean;
	ui?: Pick<ExtensionUIContext, "custom" | "notify">;
	getPlanModeState?: () => { enabled: boolean } | undefined;
	timeoutMs?: number | null;
	getTimeoutMs?: () => number | null | undefined;
	abortTurn?: () => void;
}

interface AskRenderArgs {
	question?: string;
	options?: Array<{ label: string }>;
	multi?: boolean;
	questions?: Array<{
		id: string;
		question: string;
		options: Array<{ label: string }>;
		multi?: boolean;
		recommended?: number;
	}>;
}

interface AskUiResult {
	cancelled: boolean;
	timedOut: boolean;
	abortTurn: boolean;
	results: QuestionResult[];
}

type AskParams = AskToolInput;

const OTHER_OPTION = "Other (type your own)";
const DONE_LABEL = "Done selecting";
const RECOMMENDED_SUFFIX = " (Recommended)";

function addRecommendedSuffix(label: string, isRecommended: boolean): string {
	return isRecommended && !label.endsWith(RECOMMENDED_SUFFIX) ? `${label}${RECOMMENDED_SUFFIX}` : label;
}

function stripRecommendedSuffix(label: string): string {
	return label.endsWith(RECOMMENDED_SUFFIX) ? label.slice(0, -RECOMMENDED_SUFFIX.length) : label;
}

function getAutoSelection(question: AskParams["questions"][number]): string[] {
	const labels = question.options.map((option) => option.label);
	if (labels.length === 0) return [];
	if (
		typeof question.recommended === "number" &&
		question.recommended >= 0 &&
		question.recommended < labels.length
	) {
		return [labels[question.recommended]];
	}
	return [labels[0]];
}

function getSingleQuestionDetails(question: AskParams["questions"][number], result: QuestionResult): AskToolDetails {
	return {
		question: question.question,
		options: question.options.map((option) => option.label),
		multi: question.multi ?? false,
		selectedOptions: result.selectedOptions,
		customInput: result.customInput,
	};
}

function formatSingleQuestionResponse(result: QuestionResult): string {
	if (result.customInput !== undefined) {
		return result.customInput.includes("\n")
			? `User provided custom input:\n${result.customInput
					.split("\n")
					.map((line) => `  ${line}`)
					.join("\n")}`
			: `User provided custom input: ${result.customInput}`;
	}

	if (result.selectedOptions.length === 0) {
		return "User cancelled the selection";
	}

	return result.multi
		? `User selected: ${result.selectedOptions.join(", ")}`
		: `User selected: ${result.selectedOptions[0]}`;
}

function formatQuestionResult(result: QuestionResult): string {
	if (result.customInput !== undefined) {
		return `${result.id}: "${result.customInput}"`;
	}
	if (result.selectedOptions.length > 0) {
		return result.multi
			? `${result.id}: [${result.selectedOptions.join(", ")}]`
			: `${result.id}: ${result.selectedOptions[0]}`;
	}
	return `${result.id}: (cancelled)`;
}

function buildQuestionResults(questions: AskParams["questions"], results: QuestionResult[]): QuestionResult[] {
	return questions.map((question, index) => {
		const existing = results[index];
		if (existing) return existing;
		return {
			id: question.id,
			question: question.question,
			options: question.options.map((option) => option.label),
			multi: question.multi ?? false,
			selectedOptions: [],
		};
	});
}

async function askQuestionsWithCustomUi(
	ui: Pick<ExtensionUIContext, "custom" | "notify">,
	questions: AskParams["questions"],
	timeoutMs: number | null | undefined,
	signal?: AbortSignal,
): Promise<AskUiResult> {
	return await ui.custom<AskUiResult>((tui, theme, _kb, done) => {
		let currentQuestionIndex = 0;
		let optionIndex = 0;
		let inputMode = false;
		let cachedLines: string[] | undefined;
		let timedOut = false;
		let timeoutHandle: NodeJS.Timeout | undefined;
		const results = new Map<number, QuestionResult>();

		const editorTheme: EditorTheme = {
			borderColor: (text) => theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		const editor = new Editor(tui, editorTheme);

		const cleanup = () => {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
				timeoutHandle = undefined;
			}
			if (signal) {
				signal.removeEventListener("abort", onAbort);
			}
		};

		const finish = (cancelled: boolean, abortTurn = false) => {
			cleanup();
			done({
				cancelled,
				timedOut,
				abortTurn,
				results: buildQuestionResults(
					questions,
					Array.from({ length: questions.length }, (_, index) => results.get(index)).filter(
						(result): result is QuestionResult => result !== undefined,
					),
				),
			});
		};

		const onAbort = () => finish(true, false);

		const getStoredResult = (index: number): QuestionResult | undefined => results.get(index);

		const getDisplayOptions = (index: number): Array<{ label: string; value: string; type: "option" | "other" | "done" }> => {
			const question = questions[index]!;
			const options: Array<{ label: string; value: string; type: "option" | "other" | "done" }> = question.options.map((option, optionIndex) => ({
				label: addRecommendedSuffix(option.label, optionIndex === question.recommended),
				value: option.label,
				type: "option" as const,
			}));
			if (question.multi) {
				options.push({ label: DONE_LABEL, value: DONE_LABEL, type: "done" });
			}
			options.push({ label: OTHER_OPTION, value: OTHER_OPTION, type: "other" });
			return options;
		};

		const getInitialOptionIndex = (index: number): number => {
			const question = questions[index]!;
			const stored = getStoredResult(index);
			const displayOptions = getDisplayOptions(index);
			if (stored?.customInput !== undefined) {
				return displayOptions.findIndex((option) => option.type === "other");
			}
			const selected = stored?.selectedOptions[0];
			if (selected) {
				const selectedIndex = question.options.findIndex((option) => option.label === selected);
				if (selectedIndex >= 0) {
					return selectedIndex;
				}
			}
			if (
				typeof question.recommended === "number" &&
				question.recommended >= 0 &&
				question.recommended < question.options.length
			) {
				return question.recommended;
			}
			return 0;
		};

		const refresh = () => {
			cachedLines = undefined;
			tui.requestRender();
		};

		const restartTimeout = () => {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
				timeoutHandle = undefined;
			}
			if (inputMode || !timeoutMs || timeoutMs <= 0) {
				return;
			}
			timeoutHandle = setTimeout(() => {
				const question = questions[currentQuestionIndex]!;
				const existing = getStoredResult(currentQuestionIndex);
				results.set(currentQuestionIndex, {
					id: question.id,
					question: question.question,
					options: question.options.map((option) => option.label),
					multi: question.multi ?? false,
					selectedOptions:
						existing && (existing.selectedOptions.length > 0 || existing.customInput !== undefined)
							? existing.selectedOptions
							: getAutoSelection(question),
					customInput: existing?.customInput,
				});
				timedOut = true;
				if (currentQuestionIndex >= questions.length - 1) {
					finish(false);
					return;
				}
				currentQuestionIndex += 1;
				optionIndex = getInitialOptionIndex(currentQuestionIndex);
				refresh();
				restartTimeout();
			}, timeoutMs);
		};

		const moveToQuestion = (nextIndex: number) => {
			currentQuestionIndex = Math.max(0, Math.min(nextIndex, questions.length - 1));
			optionIndex = getInitialOptionIndex(currentQuestionIndex);
			refresh();
			restartTimeout();
		};

		const commitSelectionAndAdvance = () => {
			if (currentQuestionIndex >= questions.length - 1) {
				finish(false);
				return;
			}
			moveToQuestion(currentQuestionIndex + 1);
		};

		editor.onSubmit = (value) => {
			const question = questions[currentQuestionIndex]!;
			results.set(currentQuestionIndex, {
				id: question.id,
				question: question.question,
				options: question.options.map((option) => option.label),
				multi: question.multi ?? false,
				selectedOptions: [],
				customInput: value,
			});
			inputMode = false;
			editor.setText("");
			commitSelectionAndAdvance();
		};

		const toggleMultiSelection = (label: string) => {
			const question = questions[currentQuestionIndex]!;
			const existing = getStoredResult(currentQuestionIndex);
			const selected = new Set(existing?.selectedOptions ?? []);
			if (selected.has(label)) {
				selected.delete(label);
			} else {
				selected.add(label);
			}
			results.set(currentQuestionIndex, {
				id: question.id,
				question: question.question,
				options: question.options.map((option) => option.label),
				multi: true,
				selectedOptions: Array.from(selected),
				customInput: undefined,
			});
			refresh();
		};

		const confirmCurrentOption = () => {
			const question = questions[currentQuestionIndex]!;
			const displayOptions = getDisplayOptions(currentQuestionIndex);
			const selected = displayOptions[Math.max(0, Math.min(optionIndex, displayOptions.length - 1))];
			if (!selected) return;

			if (selected.type === "other") {
				inputMode = true;
				editor.setText(getStoredResult(currentQuestionIndex)?.customInput ?? "");
				refresh();
				restartTimeout();
				return;
			}

			if (question.multi) {
				if (selected.type === "done") {
					const existing = getStoredResult(currentQuestionIndex);
					results.set(currentQuestionIndex, {
						id: question.id,
						question: question.question,
						options: question.options.map((option) => option.label),
						multi: true,
						selectedOptions: existing?.selectedOptions ?? [],
						customInput: existing?.customInput,
					});
					commitSelectionAndAdvance();
					return;
				}
				toggleMultiSelection(selected.value);
				return;
			}

			results.set(currentQuestionIndex, {
				id: question.id,
				question: question.question,
				options: question.options.map((option) => option.label),
				multi: false,
				selectedOptions: [stripRecommendedSuffix(selected.value)],
				customInput: undefined,
			});
			commitSelectionAndAdvance();
		};

		const moveCursor = (delta: number) => {
			const displayOptions = getDisplayOptions(currentQuestionIndex);
			if (displayOptions.length === 0) return;
			optionIndex = Math.max(0, Math.min(displayOptions.length - 1, optionIndex + delta));
			refresh();
		};

		const renderOptions = (width: number, lines: string[]) => {
			const question = questions[currentQuestionIndex]!;
			const displayOptions = getDisplayOptions(currentQuestionIndex);
			const result = getStoredResult(currentQuestionIndex);
			const selected = new Set(result?.selectedOptions ?? []);
			for (let index = 0; index < displayOptions.length; index++) {
				const option = displayOptions[index]!;
				const isSelectedRow = index === optionIndex;
				const prefix = isSelectedRow ? theme.fg("accent", "> ") : "  ";
				let label = option.label;
				if (option.type === "option" && question.multi) {
					const checkbox = selected.has(option.value) ? "[x]" : "[ ]";
					label = `${checkbox} ${label}`;
				}
				lines.push(truncateToWidth(`${prefix}${label}`, width));
			}
		};

		const render = (width: number): string[] => {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const question = questions[currentQuestionIndex]!;
			const stored = getStoredResult(currentQuestionIndex);
			lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
			lines.push(
				truncateToWidth(
					theme.fg(
						"toolTitle",
						theme.bold(` Ask ${currentQuestionIndex + 1}/${questions.length}${question.multi ? " · multi" : ""}`),
					),
					width,
				),
			);
			lines.push(truncateToWidth(` ${question.question}`, width));
			lines.push("");

			renderOptions(width, lines);

			if (stored?.customInput !== undefined) {
				lines.push("");
				lines.push(truncateToWidth(theme.fg("muted", " Current custom input:"), width));
				for (const line of stored.customInput.split("\n")) {
					lines.push(truncateToWidth(` ${line}`, width));
				}
			}

			if (inputMode) {
				lines.push("");
				lines.push(truncateToWidth(theme.fg("muted", " Your answer:"), width));
				for (const line of editor.render(Math.max(10, width - 2))) {
					lines.push(truncateToWidth(` ${line}`, width));
				}
			}

			lines.push("");
			lines.push(
				truncateToWidth(
					theme.fg(
						"dim",
						inputMode
							? " Enter to submit • Esc to return"
							: questions.length > 1
								? " ↑↓ navigate • Enter select • ←/→ question • Esc cancel"
								: " ↑↓ navigate • Enter select • Esc cancel",
					),
					width,
				),
			);
			lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
			cachedLines = lines;
			return lines;
		};

		const handleInput = (data: string) => {
			if (inputMode) {
				if (matchesKey(data, Key.escape)) {
					if (questions.length === 1) {
						finish(true, true);
						return;
					}
					inputMode = false;
					editor.setText("");
					refresh();
					restartTimeout();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			restartTimeout();

			if (matchesKey(data, Key.left) && currentQuestionIndex > 0) {
				moveToQuestion(currentQuestionIndex - 1);
				return;
			}
			if (matchesKey(data, Key.right)) {
				if (currentQuestionIndex >= questions.length - 1) {
					finish(false);
					return;
				}
				moveToQuestion(currentQuestionIndex + 1);
				return;
			}
			if (matchesKey(data, Key.up)) {
				moveCursor(-1);
				return;
			}
			if (matchesKey(data, Key.down)) {
				moveCursor(1);
				return;
			}
			if (matchesKey(data, Key.enter)) {
				confirmCurrentOption();
				return;
			}
			if (matchesKey(data, Key.escape)) {
				finish(true, true);
			}
		};

		if (signal) {
			if (signal.aborted) {
				finish(true);
			} else {
				signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		optionIndex = getInitialOptionIndex(0);
		restartTimeout();

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
			dispose: cleanup,
		};
	});
}

export class AskTool implements AgentTool<typeof askSchema, AskToolDetails> {
	readonly name = "ask";
	readonly label = "Ask";
	readonly description = askDescription;
	readonly parameters = askSchema;
	readonly strict = true;

	constructor(private readonly session: AskToolSession) {}

	static create(session: AskToolSession): AskTool {
		return new AskTool(session);
	}

	async execute(
		_toolCallId: string,
		params: AskParams,
		signal?: AbortSignal,
		_onUpdate?: AgentToolUpdateCallback<AskToolDetails>,
	): Promise<AgentToolResult<AskToolDetails>> {
		if (!this.session.ui) {
			return {
				content: [{ type: "text" as const, text: "Error: User prompt requires interactive mode" }],
				details: {},
			};
		}

		if (params.questions.length === 0) {
			return {
				content: [{ type: "text" as const, text: "Error: questions must not be empty" }],
				details: {},
			};
		}

		for (const question of params.questions) {
			if (question.options.length < 2 || question.options.length > 5) {
				throw new Error(`Ask tool requires 2-5 options per question (${question.id})`);
			}
			if (
				question.recommended !== undefined &&
				(question.recommended < 0 || question.recommended >= question.options.length)
			) {
				throw new Error(`Ask tool recommended index out of range for question '${question.id}'`);
			}
		}

		this.session.ui.notify?.("Waiting for input", "info");

		const timeoutMs = this.session.getPlanModeState?.()?.enabled
			? null
			: (this.session.getTimeoutMs?.() ?? this.session.timeoutMs);
		const uiResult = await askQuestionsWithCustomUi(this.session.ui, params.questions, timeoutMs, signal);
		if (uiResult.cancelled && uiResult.abortTurn) {
			this.session.abortTurn?.();
		}

		if (params.questions.length === 1) {
			const result = uiResult.results[0]!;
			const details = {
				...getSingleQuestionDetails(params.questions[0]!, result),
				cancelled: uiResult.cancelled,
				timedOut: uiResult.timedOut,
			};
			return {
				content: [{ type: "text" as const, text: formatSingleQuestionResponse(result) }],
				details,
			};
		}

		const details: AskToolDetails = {
			results: uiResult.results,
			cancelled: uiResult.cancelled,
			timedOut: uiResult.timedOut,
		};

		return {
			content: [{ type: "text" as const, text: `User answers:\n${uiResult.results.map(formatQuestionResult).join("\n")}` }],
			details,
		};
	}
}

export function createAskTool(session: AskToolSession): AskTool {
	return AskTool.create(session);
}

export const askToolRenderer = {
	renderCall(args: AskRenderArgs, theme: Theme): Component {
		if (args.questions && args.questions.length > 0) {
			const summary = args.questions.map((question) => question.id).join(", ");
			return new Text(
				`${theme.fg("toolTitle", theme.bold("ask "))}${theme.fg("muted", `${args.questions.length} questions`)}${summary ? theme.fg("dim", ` (${summary})`) : ""}`,
				0,
				0,
			);
		}

		if (args.question) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("ask "))}${theme.fg("muted", args.question)}`,
				0,
				0,
			);
		}

		return new Text(theme.fg("warning", "ask"), 0, 0);
	},

	renderResult(
		result: { content: Array<{ type: string; text?: string }>; details?: AskToolDetails },
		_options: ToolRenderResultOptions,
		theme: Theme,
	): Component {
		const details = result.details;
		if (!details) {
			const fallback = result.content[0];
			return new Text(fallback?.type === "text" ? (fallback.text ?? "") : "", 0, 0);
		}

		if (details.results && details.results.length > 0) {
			const lines = details.results.map((entry) => {
				if (entry.customInput !== undefined) {
					return `${theme.fg("success", "✓ ")}${theme.fg("accent", entry.id)}: ${entry.customInput}`;
				}
				if (entry.selectedOptions.length > 0) {
					return `${theme.fg("success", "✓ ")}${theme.fg("accent", entry.id)}: ${entry.selectedOptions.join(", ")}`;
				}
				return `${theme.fg("warning", "! ")}${theme.fg("accent", entry.id)}: Cancelled`;
			});
			return new Text(lines.join("\n"), 0, 0);
		}

		if (details.customInput !== undefined) {
			return new Text(`${theme.fg("success", "✓ ")}${details.customInput}`, 0, 0);
		}
		if (details.selectedOptions && details.selectedOptions.length > 0) {
			return new Text(`${theme.fg("success", "✓ ")}${details.selectedOptions.join(", ")}`, 0, 0);
		}
		if (details.cancelled) {
			return new Text(theme.fg("warning", "Cancelled"), 0, 0);
		}

		const fallback = result.content[0];
		return new Text(fallback?.type === "text" ? (fallback.text ?? "") : "", 0, 0);
	},
};
