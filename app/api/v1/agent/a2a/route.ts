import { ZodError } from "zod";
import { AgentRequestError, agentTask, parseAgentRequest } from "@/lib/agent/aaidle-game-agent";
import { classicGameData } from "@/lib/domain/games/classic/classic-game-api";
import { submitClassicGuess } from "@/lib/domain/games/classic/guess-service";
import { readRequestText } from "@/lib/validation/request-body";

const maxRequestSize = 16_384;
const supportedA2AVersion = "0.3";

const publicRequestErrors: Record<string, string> = {
  CHALLENGE_NOT_FOUND: "Challenge not found.",
  MODEL_NOT_FOUND: "Model not found.",
  MODEL_NOT_AVAILABLE: "This model is not available in this difficulty.",
};

const jsonRpcError = (id: string | number | null, code: number, message: string) =>
  Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { headers: { "Cache-Control": "no-store" } },
  );

const requestIdFrom = (value: unknown): string | number | null => {
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  const { id } = value as { id?: unknown };
  return typeof id === "string" || typeof id === "number" ? id : null;
};

export async function POST(request: Request) {
  let requestId: string | number | null = null;

  try {
    const requestedVersion = request.headers.get("A2A-Version");
    if (requestedVersion && requestedVersion !== supportedA2AVersion) {
      return jsonRpcError(null, -32600, `A2A version ${requestedVersion} is not supported.`);
    }

    const body = await readRequestText(request, maxRequestSize);

    const rawRequest = JSON.parse(body) as unknown;
    requestId = requestIdFrom(rawRequest);
    const parsed = parseAgentRequest(rawRequest);
    requestId = parsed.requestId;

    const data =
      parsed.command.operation === "get_game"
        ? {
            kind: "aaidle.game.v1",
            ...(await classicGameData(parsed.command.category, parsed.command.difficulty)),
          }
        : {
            kind: "aaidle.guess-result.v1",
            ...(await submitClassicGuess(parsed.command)),
          };

    const name =
      parsed.command.operation === "get_game" ? "daily-classic-game" : "classic-guess-result";
    return Response.json(
      {
        jsonrpc: "2.0",
        id: requestId,
        result: { task: agentTask({ contextId: parsed.contextId, data, name }) },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return jsonRpcError(requestId, -32600, "Request payload is too large.");
    }
    if (error instanceof SyntaxError)
      return jsonRpcError(requestId, -32700, "Invalid JSON payload.");
    if (error instanceof ZodError || error instanceof AgentRequestError) {
      return jsonRpcError(requestId, -32602, "Invalid request parameters.");
    }
    if (error instanceof Error && publicRequestErrors[error.message]) {
      return jsonRpcError(requestId, -32602, publicRequestErrors[error.message]);
    }
    console.error("A2A game request failed", error);
    return jsonRpcError(requestId, -32603, "Internal error.");
  }
}
