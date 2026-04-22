export interface SubprocessToolEvent {
	toolName: string;
	toolCallId: string;
	args?: Record<string, unknown>;
	result?: {
		content: Array<{ type: string; text?: string }>;
		details?: unknown;
	};
	isError?: boolean;
}

export interface SubprocessToolHandler<TData = unknown> {
	extractData?: (event: SubprocessToolEvent) => TData | undefined;
	shouldTerminate?: (event: SubprocessToolEvent) => boolean;
}

class SubprocessToolRegistryImpl {
	#handlers = new Map<string, SubprocessToolHandler>();

	register<T>(toolName: string, handler: SubprocessToolHandler<T>): void {
		this.#handlers.set(toolName, handler as SubprocessToolHandler);
	}

	getHandler(toolName: string): SubprocessToolHandler | undefined {
		return this.#handlers.get(toolName);
	}
}

export const subprocessToolRegistry = new SubprocessToolRegistryImpl();
