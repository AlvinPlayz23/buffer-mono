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

  it("tracks task progress and context usage updates", () => {
    const withTask = reduceEvent(initialState, {
      type: "session_update",
      params: {
        sessionId: "sess",
        update: {
          sessionUpdate: "task_progress",
          taskId: "task-1",
          agent: "reviewer",
          status: "running",
          currentTool: "read",
          elapsedSeconds: 4
        }
      }
    });

    const withUsage = reduceEvent(withTask, {
      type: "session_update",
      params: {
        sessionId: "sess",
        update: {
          sessionUpdate: "context_usage",
          percent: 42,
          contextWindow: 200000,
          input: 1000,
          output: 200,
          cost: 0.12
        }
      }
    });

    expect(withUsage.taskProgress["task-1"].currentTool).toBe("read");
    expect(withUsage.contextUsage?.percent).toBe(42);
  });

  it("replaces the latest change tree snapshot", () => {
    const next = reduceEvent(initialState, {
      type: "session_update",
      params: {
        sessionId: "sess",
        update: {
          sessionUpdate: "change_tree",
          changes: [{ path: "src/app.ts", type: "edit", additions: 10, deletions: 2 }]
        }
      }
    });

    expect(next.changeTree).toEqual([{ path: "src/app.ts", type: "edit", additions: 10, deletions: 2 }]);
  });
});
