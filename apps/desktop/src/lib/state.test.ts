import { describe, expect, it } from "vitest";
import { initialState, reduceEvent } from "./state";

describe("state reducer", () => {
  it("appends assistant chunks", () => {
    const next = reduceEvent(initialState, {
      type: "session_update",
      params: {
        sessionId: "sess",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" }
        }
      }
    });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].text).toBe("hello");
  });

  it("tracks tool status transitions", () => {
    const pending = reduceEvent(initialState, {
      type: "session_update",
      params: {
        sessionId: "sess",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call1",
          status: "pending",
          title: "Read file",
          kind: "read"
        }
      }
    });

    const completed = reduceEvent(pending, {
      type: "session_update",
      params: {
        sessionId: "sess",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call1",
          status: "completed"
        }
      }
    });

    expect(completed.toolCalls.call1.status).toBe("completed");
  });
});
