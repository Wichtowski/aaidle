import { sqliteConnection } from "./sqlite-connection.mjs";

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: pnpm dev:today-challenges [YYYY-MM-DD]");
  process.exit(1);
}

const database = sqliteConnection();

try {
  const challenges = database
    .prepare(
      `SELECT
        d.mode,
        d.challenge_date AS challengeDate,
        m.name AS answerModel,
        p.name AS provider
      FROM daily_challenges d
      JOIN models m ON m.id = d.answer_model_id
      JOIN providers p ON p.id = m.provider_id
      WHERE d.challenge_date = ?
      ORDER BY d.mode`,
    )
    .all(date);

  if (!challenges.length) {
    console.log(`No daily challenges found for ${date}.`);
    process.exitCode = 1;
  } else {
    console.log(`Daily challenges for ${date}`);
    console.table(challenges);
  }
} finally {
  database.close();
}
