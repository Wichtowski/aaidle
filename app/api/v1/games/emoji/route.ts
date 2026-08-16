import { disabledGameAccessResponse } from "@/lib/auth/game-access";
import { emojiGameResponse } from "@/lib/domain/games/emoji/emoji-game-service";

export async function GET(request: Request) {
  const disabledResponse = await disabledGameAccessResponse(request);
  if (disabledResponse) return disabledResponse;
  return emojiGameResponse();
}
