import { classicGameResponse } from "@/lib/domain/games/classic/classic-game-api";
import { isClassicCategory, isClassicDifficulty } from "@/lib/domain/models/model-types";

export async function GET(_: Request, { params }: { params: Promise<{ category: string; difficulty: string }> }) {
  const { category, difficulty } = await params;
  if (!isClassicCategory(category) || !isClassicDifficulty(difficulty) || (category === "hardcore") !== (difficulty === "hardcore")) {
    return new Response("Not found", { status: 404 });
  }
  return classicGameResponse(category, difficulty);
}
