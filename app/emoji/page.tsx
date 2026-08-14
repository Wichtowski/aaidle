import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EmojiGame } from "../components/game/EmojiGame";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";
import { emojiGameData } from "@/lib/domain/games/emoji/emoji-game-service";

export const metadata: Metadata = {
  title: "Emoji",
  description: "Decode today’s AI model family from progressive emoji clues.",
  alternates: { canonical: "/emoji" },
};

export default async function EmojiPage() {
  const session = (await cookies()).get(sessionCookieName)?.value ?? null;
  const user = await userForSession(session);
  if (user?.disabled_at) redirect("/account-disabled");
  return <EmojiGame initialGame={await emojiGameData()} />;
}
