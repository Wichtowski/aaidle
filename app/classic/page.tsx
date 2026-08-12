import { cookies } from "next/headers";
import { ClassicGame } from "../components/game/ClassicGame";
import { isClassicDifficulty } from "../../lib/domain/models/model-types";
import { classicDifficultyCookieName } from "../../lib/domain/games/classic/difficulty-preference";

export default async function ClassicPage() {
  const difficulty = (await cookies()).get(classicDifficultyCookieName)?.value;
  return <ClassicGame difficulty={isClassicDifficulty(difficulty) ? difficulty : "normal"} />;
}
