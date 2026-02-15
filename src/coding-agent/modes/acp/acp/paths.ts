import { join } from "node:path";
import { getAgentDir } from "../../../config.js";

/**
 * Storage owned by the ACP adapter.
 *
 * We intentionally keep this separate from buffer's own ~/.buffer/agent/* directory.
 */
export function getBufferAcpDir(): string {
	return join(getAgentDir(), "..", "buffer-acp");
}

export function getBufferAcpSessionMapPath(): string {
	return join(getBufferAcpDir(), "session-map.json");
}
