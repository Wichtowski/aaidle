const openApiDocument = {
  openapi: "3.1.1",
  info: {
    title: "aAIdle Game API",
    version: "1.0.0",
    description:
      "A public, unauthenticated API for retrieving and playing the current aAIdle Classic game.",
  },
  servers: [{ url: "https://aaidle.com" }],
  paths: {
    "/api/v1/games/classic/{category}/{difficulty}": {
      get: {
        operationId: "getClassicGame",
        summary: "Get the current Classic game",
        parameters: [
          {
            name: "category",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["llm", "cv", "nlp", "object-detection", "classical-ml", "filters", "hardcore"],
            },
          },
          {
            name: "difficulty",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["normal", "challenge", "hardcore"] },
          },
        ],
        responses: {
          "200": {
            description: "The active game and its eligible model index.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ClassicGame" } },
            },
          },
          "404": { description: "Unsupported category and difficulty combination." },
          "503": { description: "The daily challenge is temporarily unavailable." },
        },
      },
    },
    "/api/v1/games/classic/challenges/{challengeId}/guesses": {
      post: {
        operationId: "submitClassicGuess",
        summary: "Evaluate a Classic game guess",
        parameters: [
          {
            name: "challengeId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/GuessRequest" } },
          },
        },
        responses: {
          "200": {
            description: "The evaluated guess and its comparison clues.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/GuessResult" } },
            },
          },
          "400": { description: "Invalid or unavailable model." },
          "404": { description: "Unknown challenge or model." },
          "413": { description: "Request body exceeds 16 KiB." },
        },
      },
    },
    "/api/v1/agent/a2a": {
      post: {
        operationId: "sendA2AClassicGameMessage",
        summary: "Use the aAIdle A2A JSON-RPC interface",
        description:
          "Use SendMessage with a structured application/json data part. Supported operations are get_game and submit_guess.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/A2ARequest" } } },
        },
        responses: {
          "200": {
            description: "A completed A2A task containing one application/json artifact.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/A2AResponse" } },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ClassicGame: {
        type: "object",
        required: ["challenge", "models"],
        properties: {
          challenge: {
            type: "object",
            required: ["id", "date", "mode", "expiresAt", "columns"],
            properties: {
              id: { type: "string", format: "uuid" },
              date: { type: "string", format: "date" },
              mode: {
                type: "object",
                required: ["category", "difficulty"],
                properties: {
                  category: { type: "string" },
                  difficulty: { type: "string" },
                },
              },
              expiresAt: { type: "string", format: "date-time" },
              columns: { type: "array", items: { type: "string" } },
            },
          },
          models: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "providerName", "familyName", "aliases"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                providerName: { type: "string" },
                familyName: { type: "string" },
                aliases: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      GuessRequest: {
        type: "object",
        required: ["guessedModelId", "attemptNumber"],
        properties: {
          guessedModelId: { type: "string", maxLength: 120 },
          attemptNumber: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
      GuessResult: {
        type: "object",
        required: ["guess", "playerStats"],
        properties: {
          guess: {
            type: "object",
            required: ["model", "comparison", "isCorrect", "attemptNumber"],
            properties: {
              model: { type: "object", additionalProperties: true },
              comparison: { type: "object", additionalProperties: { type: "string" } },
              isCorrect: { type: "boolean" },
              attemptNumber: { type: "integer" },
              matchingCategories: { type: "array", items: { type: "string" } },
              matchingInputModalities: { type: "array", items: { type: "string" } },
              matchingOutputModalities: { type: "array", items: { type: "string" } },
              matchingUseCases: { type: "array", items: { type: "string" } },
            },
          },
          playerStats: { type: ["object", "null"] },
        },
      },
      A2ARequest: {
        type: "object",
        required: ["jsonrpc", "id", "method", "params"],
        properties: {
          jsonrpc: { const: "2.0" },
          id: { type: ["string", "number"] },
          method: { const: "SendMessage" },
          params: {
            type: "object",
            required: ["message"],
            properties: {
              message: {
                type: "object",
                required: ["role", "parts"],
                properties: {
                  contextId: { type: "string", format: "uuid" },
                  role: { const: "ROLE_USER" },
                  parts: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["data", "mediaType"],
                      properties: {
                        data: { $ref: "#/components/schemas/AgentCommand" },
                        mediaType: { const: "application/json" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      AgentCommand: {
        oneOf: [
          {
            type: "object",
            required: ["operation", "category", "difficulty"],
            properties: {
              operation: { const: "get_game" },
              category: {
                type: "string",
                enum: [
                  "llm",
                  "cv",
                  "nlp",
                  "object-detection",
                  "classical-ml",
                  "filters",
                  "hardcore",
                ],
              },
              difficulty: { type: "string", enum: ["normal", "challenge", "hardcore"] },
            },
          },
          {
            type: "object",
            required: ["operation", "challengeId", "guessedModelId", "attemptNumber"],
            properties: {
              operation: { const: "submit_guess" },
              challengeId: { type: "string", format: "uuid" },
              guessedModelId: { type: "string", maxLength: 120 },
              attemptNumber: { type: "integer", minimum: 1, maximum: 100 },
            },
          },
        ],
      },
      A2AResponse: {
        type: "object",
        required: ["jsonrpc", "id", "result"],
        properties: {
          jsonrpc: { const: "2.0" },
          id: { type: ["string", "number"] },
          result: {
            type: "object",
            required: ["task"],
            properties: {
              task: {
                type: "object",
                required: ["id", "contextId", "status", "artifacts"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  contextId: { type: "string", format: "uuid" },
                  status: {
                    type: "object",
                    properties: { state: { const: "TASK_STATE_COMPLETED" } },
                  },
                  artifacts: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export function GET() {
  return Response.json(openApiDocument, {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
