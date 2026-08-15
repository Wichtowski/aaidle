import type { Metadata } from "next";
import { ClassicGame } from "../../components/game/ClassicGame";
import {
  classicCategoryDetails,
  classicCategoryFromRouteSegment,
  isClassicDifficulty,
} from "../../../lib/domain/models/model-types";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { classicDifficultyCookieName } from "../../../lib/domain/games/classic/difficulty-preference";
import { classicGameData } from "../../../lib/domain/games/classic/classic-game-api";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";
import { hasHardcoreAccess, isInnerCircleActive } from "@/lib/domain/games/classic/hardcore-access";

type ClassicCategoryPageProps = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: ClassicCategoryPageProps): Promise<Metadata> {
  const { category: requestedRouteSegment } = await params;
  const category = classicCategoryFromRouteSegment(requestedRouteSegment);
  if (!category) return {};

  const label = classicCategoryDetails[category].label;
  const title = `Classic ${label}`;
  const description = `Identify today’s ${label} AI model from the clues in aAIdle’s daily Classic challenge.`;

  return {
    title,
    description,
    alternates: { canonical: `/classic/${classicCategoryDetails[category].routeSegment}` },
    openGraph: {
      title,
      description,
      url: `/classic/${classicCategoryDetails[category].routeSegment}`,
    },
    twitter: { title, description },
  };
}

export default async function ClassicCategoryPage({ params }: ClassicCategoryPageProps) {
  const cookieStore = await cookies();
  const session = cookieStore.get(sessionCookieName)?.value ?? null;
  const user = await userForSession(session);
  if (user?.disabled_at) redirect("/account-disabled");
  const { category: routeSegment } = await params;
  const category = classicCategoryFromRouteSegment(routeSegment);
  if (!category) notFound();
  if (user && category !== "hardcore" && (await isInnerCircleActive(user.id))) {
    redirect("/classic/hardcore");
  }
  if (category === "hardcore" && !user) redirect("/login");
  const savedDifficulty = cookieStore.get(classicDifficultyCookieName)?.value;
  const difficulty =
    category === "hardcore"
      ? "hardcore"
      : isClassicDifficulty(savedDifficulty) && savedDifficulty !== "hardcore"
        ? savedDifficulty
        : "normal";
  const hasHardcoreGameAccess =
    category !== "hardcore" || Boolean(user && (await hasHardcoreAccess(user.id)));
  return (
    <ClassicGame
      category={category}
      difficulty={difficulty}
      initialGame={hasHardcoreGameAccess ? await classicGameData(category, difficulty) : null}
      hasHardcoreAccess={hasHardcoreGameAccess}
      key={category}
    />
  );
}
