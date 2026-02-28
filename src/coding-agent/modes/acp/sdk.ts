export type ToolKind = "read" | "write" | "edit" | "bash" | "grep" | "find" | "ls" | string;

export interface ToolCallContent {
	type?: string;
	toolCallId?: string;
	title?: string;
	kind?: ToolKind;
	status?: "pending" | "in_progress" | "completed" | "failed";
	content?: unknown;
	[key: string]: unknown;
}

export type ContentBlock =
	| { type: "text"; text: string }
	| { type: "resource_link"; uri: string; name?: string; mimeType?: string; title?: string }
	| { type: "image"; uri?: string; data: string; mimeType: string }
	| { type: "audio"; data: string; mimeType: string }
	| { type: "resource"; resource: unknown };

export interface AvailableCommand {
	name: string;
	description?: string;
	input?: { hint?: string };
}

export interface McpServer {
	name?: string;
	[key: string]: unknown;
}

export interface SessionUpdate {
	sessionUpdate: string;
	content?: ContentBlock | ToolCallContent | unknown;
	toolCallId?: string;
	status?: "pending" | "in_progress" | "completed" | "failed";
	availableCommands?: AvailableCommand[];
	_meta?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface InitializeRequest {
	protocolVersion: number;
}

export interface InitializeResponse {
	protocolVersion: number;
	agentInfo: { name: string; title: string; version: string };
	authMethods: unknown[];
	agentCapabilities: Record<string, unknown>;
}

export interface AuthenticateRequest {
	[key: string]: unknown;
}

export interface NewSessionRequest {
	cwd: string;
	mcpServers: McpServer[];
}

export interface PromptRequest {
	sessionId: string;
	prompt: ContentBlock[];
}

export interface PromptResponse {
	stopReason: StopReason;
}

export interface CancelNotification {
	sessionId: string;
}

export interface LoadSessionRequest {
	sessionId: string;
	cwd: string;
	mcpServers: McpServer[];
}

export interface LoadSessionResponse {
	sessionId?: string;
	models?: unknown;
	modes?: unknown;
	[key: string]: unknown;
}

export interface SetSessionModeRequest {
	sessionId: string;
	modeId: string;
}

export interface SetSessionModeResponse {
	modes?: Array<{ id: string; label: string }>;
	[key: string]: unknown;
}

export interface SetSessionModelRequest {
	sessionId: string;
	modelId: string;
}

export interface ModelInfo {
	id?: string;
	modelId?: string;
	name?: string;
	provider?: string;
	description?: string | null;
	[key: string]: unknown;
}

export type StopReason = "end_turn" | "cancelled";

export interface Agent {
	initialize(params: InitializeRequest): Promise<InitializeResponse>;
	authenticate(params: AuthenticateRequest): Promise<void>;
	newSession(params: NewSessionRequest): Promise<unknown>;
	prompt(params: PromptRequest): Promise<PromptResponse>;
	cancel(params: CancelNotification): Promise<void>;
	loadSession?(params: LoadSessionRequest): Promise<LoadSessionResponse>;
	setSessionMode?(params: SetSessionModeRequest): Promise<SetSessionModeResponse>;
	setSessionModel?(params: SetSessionModelRequest): Promise<void>;
}

export class RequestError extends Error {
	constructor(
		public readonly code: number,
		message: string,
	) {
		super(message);
	}

	static invalidParams(message: string): RequestError {
		return new RequestError(-32602, message);
	}
}

type NdjsonStream = {
	input: WritableStream<Uint8Array>;
	output: ReadableStream<Uint8Array>;
};

type AcpLogEvent = Record<string, unknown>;

interface AgentSideConnectionOptions {
	onLog?: (event: AcpLogEvent) => void;
}

export function ndJsonStream(input: WritableStream<Uint8Array>, output: ReadableStream<Uint8Array>): NdjsonStream {
	return { input, output };
}

export class AgentSideConnection {
	private readonly agent: Agent;
	private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
	private readonly onLog?: (event: AcpLogEvent) => void;

	constructor(
		factory: (conn: AgentSideConnection) => Agent,
		private readonly stream: NdjsonStream,
		options?: AgentSideConnectionOptions,
	) {
		this.agent = factory(this);
		this.writer = this.stream.input.getWriter();
		this.onLog = options?.onLog;
		void this.readLoop();
	}

	private log(event: AcpLogEvent): void {
		this.onLog?.(event);
	}

	async sessionUpdate(params: { sessionId: string; update: SessionUpdate }): Promise<void> {
		await this.send({
			jsonrpc: "2.0",
			method: "session/update",
			params,
		});
	}

	private async readLoop(): Promise<void> {
		const reader = this.stream.output.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let index = buffer.indexOf("\n");
			while (index >= 0) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (line.length > 0) {
					this.log({ kind: "rpc_in_raw", line });
					await this.handleLine(line);
				}
				index = buffer.indexOf("\n");
			}
		}
	}

	private async handleLine(line: string): Promise<void> {
		let msg: any;
		try {
			msg = JSON.parse(line);
		} catch {
			this.log({ kind: "rpc_in_parse_error", line });
			return;
		}
		this.log({ kind: "rpc_in", payload: msg });

		if (typeof msg?.method !== "string") return;
		const id = msg.id;
		const params = msg.params ?? {};

		try {
			let result: unknown;
			switch (msg.method) {
				case "initialize":
					result = await this.agent.initialize(params as InitializeRequest);
					break;
				case "authenticate":
					result = await this.agent.authenticate(params as AuthenticateRequest);
					break;
				case "session/new":
					result = await this.agent.newSession(params as NewSessionRequest);
					break;
				case "session/prompt":
					result = await this.agent.prompt(params as PromptRequest);
					break;
				case "session/cancel":
					result = await this.agent.cancel(params as CancelNotification);
					break;
				case "session/load":
					result = this.agent.loadSession ? await this.agent.loadSession(params as LoadSessionRequest) : {};
					break;
				case "session/set_mode":
					result = this.agent.setSessionMode
						? await this.agent.setSessionMode(params as SetSessionModeRequest)
						: { modes: [] };
					break;
				case "session/set_model":
					if (this.agent.setSessionModel) {
						result = await this.agent.setSessionModel(params as SetSessionModelRequest);
					}
					break;
				default:
					throw new RequestError(-32601, `Method not found: ${msg.method}`);
			}

			if (id !== undefined) {
				await this.send({ jsonrpc: "2.0", id, result });
			}
		} catch (error) {
			if (id === undefined) return;
			const code = error instanceof RequestError ? error.code : -32603;
			const message = error instanceof Error ? error.message : "Internal error";
			await this.send({
				jsonrpc: "2.0",
				id,
				error: { code, message },
			});
		}
	}

	private async send(payload: unknown): Promise<void> {
		const line = `${JSON.stringify(payload)}\n`;
		this.log({ kind: "rpc_out", payload });
		await this.writer.write(new TextEncoder().encode(line));
	}
}
