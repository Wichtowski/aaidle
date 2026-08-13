const agentCard = {
  name: "aAIdle Game Agent",
  description: "Retrieve and solve the current aAIdle Classic game through structured game and guess responses.",
  version: "1.0.0",
  supportedInterfaces: [
    {
      url: "https://aaidle.com/api/v1/agent/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "0.3",
    },
  ],
  capabilities: {
    streaming: false,
    pushNotifications: false,
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    {
      id: "get-daily-classic-game",
      name: "Get daily Classic game",
      description: "Returns the current challenge, candidate model index, expiry time, and comparison columns for a Classic category and difficulty.",
      tags: ["aaidle", "game", "daily", "ai-models"],
      examples: ["Retrieve today's normal LLM Classic game."],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "submit-classic-guess",
      name: "Submit Classic guess",
      description: "Evaluates a candidate model against the current challenge and returns comparison clues plus correctness.",
      tags: ["aaidle", "game", "guess", "ai-models"],
      examples: ["Submit a model guess for the current Classic challenge."],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  documentationUrl: "https://aaidle.com/llms.txt",
};

export function GET() {
  return Response.json(agentCard, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      ETag: '"aaidle-agent-card-v1"',
    },
  });
}
