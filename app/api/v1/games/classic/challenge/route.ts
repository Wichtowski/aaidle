import { classicGameResponse } from "../../../../../../lib/domain/games/classic/classic-game-api";
import { disabledGameAccessResponse } from "@/lib/auth/game-access";

export async function GET(request: Request) {
  const disabledResponse = await disabledGameAccessResponse(request);
  if (disabledResponse) return disabledResponse;
  return classicGameResponse("llm", "challenge");
}
