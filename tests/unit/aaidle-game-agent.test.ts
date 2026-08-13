import { describe, expect, it } from "vitest";
import { agentTask, parseAgentRequest } from "../../lib/agent/aaidle-game-agent";

const getGameRequest = {
  jsonrpc: "2.0",
  id: "request-1",
  method: "SendMessage",
  params: {
    message: {
      contextId: "1f5f7a08-0dbe-447e-94ae-f401388243bb",
      role: "ROLE_USER",
      parts: [
        {
          mediaType: "application/json",
          data: { operation: "get_game", category: "llm", difficulty: "normal" },
        },
      ],
    },
  },
};

describe("aAIdle game agent protocol", () => {
  it("parses a structured request for a Classic game", () => {
    expect(parseAgentRequest(getGameRequest)).toMatchObject({
      requestId: "request-1",
      contextId: "1f5f7a08-0dbe-447e-94ae-f401388243bb",
      command: { operation: "get_game", category: "llm", difficulty: "normal" },
    });
  });

  it("rejects incompatible hardcore category and difficulty", () => {
    expect(() =>
      parseAgentRequest({
        ...getGameRequest,
        params: {
          message: {
            ...getGameRequest.params.message,
            parts: [{ mediaType: "application/json", data: { operation: "get_game", category: "hardcore", difficulty: "normal" } }],
          },
        },
      }),
    ).toThrow("hardcore");
  });

  it("returns a completed task with a structured artifact", () => {
    const task = agentTask({
      contextId: "1f5f7a08-0dbe-447e-94ae-f401388243bb",
      data: { kind: "aaidle.game.v1" },
      name: "daily-classic-game",
    });

    expect(task).toMatchObject({
      contextId: "1f5f7a08-0dbe-447e-94ae-f401388243bb",
      status: { state: "TASK_STATE_COMPLETED" },
      artifacts: [{ name: "daily-classic-game", parts: [{ mediaType: "application/json", data: { kind: "aaidle.game.v1" } }] }],
    });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(task.artifacts[0].artifactId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
