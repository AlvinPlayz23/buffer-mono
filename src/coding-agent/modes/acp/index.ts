import { AgentSideConnection, ndJsonStream } from "./sdk.js";
import { BufferAcpAgent } from "./acp/agent.js";

export async function runAcpMode(options?: { acpLog?: boolean }): Promise<never> {
	const acpLog = options?.acpLog === true;
	const log = (event: Record<string, unknown>) => {
		if (!acpLog) return;
		const payload = { ts: new Date().toISOString(), ...event };
		process.stderr.write(`[ACP_LOG] ${JSON.stringify(payload)}\n`);
	};

	const input = new WritableStream<Uint8Array>({
		write(chunk) {
			return new Promise<void>((resolve, reject) => {
				process.stdout.write(chunk, (err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		},
	});

	const output = new ReadableStream<Uint8Array>({
		start(controller) {
			process.stdin.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
			process.stdin.on("end", () => controller.close());
			process.stdin.on("error", (err) => controller.error(err));
		},
	});

	const stream = ndJsonStream(input, output);
	new AgentSideConnection((conn) => new BufferAcpAgent(conn), stream, {
		onLog: (event) => log(event),
	});
	log({ kind: "acp_server_start" });

	process.stdin.resume();
	process.on("SIGINT", () => {
		log({ kind: "signal", signal: "SIGINT" });
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		log({ kind: "signal", signal: "SIGTERM" });
		process.exit(0);
	});

	return new Promise<never>(() => {});
}
