import { database } from "../../../../../lib/db/client";
export async function GET(_: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  const { challengeId } = await params;
  const DB = database();
  const totals = await DB.prepare(
    'SELECT COALESCE(SUM(total_guess_count), 0) AS "totalGuesses", COALESCE(SUM(unique_player_count), 0) AS "uniquePlayers" FROM challenge_guess_stats WHERE challenge_id = ?',
  )
    .bind(challengeId)
    .first<{ totalGuesses: number; uniquePlayers: number }>();
  const topGuesses = (
    await DB.prepare(
      'SELECT s.guessed_model_id AS "modelId", m.name AS "modelName", s.unique_player_count AS count FROM challenge_guess_stats s JOIN models m ON m.id = s.guessed_model_id WHERE s.challenge_id = ? ORDER BY s.unique_player_count DESC LIMIT 5',
    )
      .bind(challengeId)
      .all()
  ).results;
  return Response.json(
    {
      totalGuesses: totals?.totalGuesses ?? 0,
      uniquePlayers: totals?.uniquePlayers ?? 0,
      topGuesses,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
