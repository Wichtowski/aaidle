import { classicGameResponse } from "../../../../../../lib/domain/games/classic/classic-game-api";

export async function GET() {
  return classicGameResponse("llm", "normal");
}
