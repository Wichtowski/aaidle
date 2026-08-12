import type { Metadata } from "next";
import { ClassicGame } from "../../components/game/ClassicGame";
import { classicCategoryDetails, isClassicCategory, isClassicDifficulty } from "../../../lib/domain/models/model-types";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { classicDifficultyCookieName } from "../../../lib/domain/games/classic/difficulty-preference";
import { classicGameData } from "../../../lib/domain/games/classic/classic-game-api";

type ClassicCategoryPageProps = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: ClassicCategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isClassicCategory(category)) return {};

  const label = classicCategoryDetails[category].label;
  const title = `Classic ${label}`;
  const description = `Identify today’s ${label} AI model from the clues in aAIdle’s daily Classic challenge.`;

  return {
    title,
    description,
    alternates: { canonical: `/classic/${category}` },
    openGraph: { title, description, url: `/classic/${category}` },
    twitter: { title, description },
  };
}

export default async function ClassicCategoryPage({ params }: ClassicCategoryPageProps) {
  const { category } = await params;
  if (!isClassicCategory(category)) notFound();
  const savedDifficulty = (await cookies()).get(classicDifficultyCookieName)?.value;
  const difficulty = category === "hardcore" ? "hardcore" : isClassicDifficulty(savedDifficulty) && savedDifficulty !== "hardcore" ? savedDifficulty : "normal";
  return <ClassicGame category={category} difficulty={difficulty} initialGame={await classicGameData(category, difficulty)} />;
}
