import { z } from "zod";
import { classicCategories, classicDifficulties } from "../domain/models/model-types";

const gameCommandSchema = z
  .object({
    operation: z.literal("get_game"),
    category: z.enum(classicCategories),
    difficulty: z.enum(classicDifficulties),
  })
  .superRefine(({ category, difficulty }, context) => {
    if ((category === "hardcore") !== (difficulty === "hardcore")) {
      context.addIssue({
        code: "custom",
        message: "The hardcore category must use hardcore difficulty and vice versa.",
      });
    }
  });

const guessCommandSchema = z.object({
  operation: z.literal("submit_guess"),
  challengeId: z.string().uuid(),
  guessedModelId: z.string().min(1).max(120),
  attemptNumber: z.number().int().min(1).max(100),
});

const agentCommandSchema = z.discriminatedUnion("operation", [gameCommandSchema, guessCommandSchema]);

const agentRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.literal("SendMessage"),
  params: z.object({
    message: z.object({
      contextId: z.string().uuid().optional(),
      role: z.literal("ROLE_USER"),
      parts: z
        .array(
          z.object({
            data: z.unknown().optional(),
            mediaType: z.string().optional(),
          }),
        )
        .min(1),
    }),
  }),
});

export type AgentCommand = z.infer<typeof agentCommandSchema>;

export class AgentRequestError extends Error {}

export type AgentRequest = {
  command: AgentCommand;
  contextId: string;
  requestId: string | number;
};

export function parseAgentRequest(input: unknown): AgentRequest {
  const request = agentRequestSchema.parse(input);
  const commandPart = request.params.message.parts.find(
    (part) => part.mediaType === "application/json" && part.data !== undefined,
  );

  if (!commandPart) {
    throw new AgentRequestError("An application/json data part is required.");
  }

  return {
    command: agentCommandSchema.parse(commandPart.data),
    contextId: request.params.message.contextId ?? crypto.randomUUID(),
    requestId: request.id,
  };
}

export function agentTask(input: {
  contextId: string;
  data: unknown;
  name: string;
}) {
  return {
    id: crypto.randomUUID(),
    contextId: input.contextId,
    status: { state: "TASK_STATE_COMPLETED" },
    artifacts: [
      {
        artifactId: crypto.randomUUID(),
        name: input.name,
        parts: [{ data: input.data, mediaType: "application/json" }],
      },
    ],
  };
}
