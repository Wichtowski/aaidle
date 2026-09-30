use crate::{
    domain::{daily_completion::*, difficulty::Difficulty},
    error::{AppError, AppResult},
};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(FromRow)]
struct ResultRow {
    group_name: String,
    category: Option<String>,
    difficulty: Option<String>,
    metric: i64,
}

pub async fn summary(
    pool: &SqlitePool,
    date: &str,
    player: Uuid,
    user: Option<&str>,
) -> AppResult<DailyCompletionSummary> {
    let registry = applicable_registry(date, &registries())
        .ok_or_else(|| AppError::NotFound("Daily completion requirements unavailable.".into()))?;
    sqlx::query("INSERT OR IGNORE INTO daily_completion_requirement_snapshots (challenge_date,requirement_version,requirements_json) VALUES (?,?,?)")
        .bind(date).bind(registry.version).bind(serde_json::to_string(&registry)?).execute(pool).await?;
    let stored: String = sqlx::query_scalar("SELECT requirements_json FROM daily_completion_requirement_snapshots WHERE challenge_date=?")
        .bind(date).fetch_one(pool).await?;
    let registry: RequirementRegistry = serde_json::from_str(&stored)?;
    let rows = sqlx::query_as::<_, ResultRow>(
        "SELECT 'classic' AS group_name, substr(c.mode,9,length(c.mode)-9-length(CASE WHEN c.mode LIKE '%:hardcore' THEN 'hardcore' WHEN c.mode LIKE '%:challenge' THEN 'challenge' ELSE 'normal' END)) AS category, \
         CASE WHEN c.mode LIKE '%:hardcore' THEN 'hardcore' WHEN c.mode LIKE '%:challenge' THEN 'challenge' ELSE 'normal' END AS difficulty, \
         MIN(g.attempt_number) AS metric FROM guess_events g JOIN daily_challenges c ON c.id=g.challenge_id \
         WHERE g.player_id=?1 AND c.challenge_date=?2 AND g.is_correct=1 AND c.mode LIKE 'classic:%' GROUP BY c.mode \
         UNION ALL SELECT 'emoji',NULL,NULL,MIN(g.attempt_number) FROM visual_clue_guess_events g \
         JOIN visual_clue_challenges c ON c.id=g.challenge_id WHERE g.player_id=?1 AND c.challenge_date=?2 AND g.is_correct=1 GROUP BY c.mode \
         UNION ALL SELECT 'timeline',NULL,c.difficulty,MIN(g.attempt_number) FROM timeline_attempts g \
         JOIN timeline_challenges c ON c.id=g.challenge_id WHERE g.player_id=?1 AND c.challenge_date=?2 AND g.is_correct=1 GROUP BY c.difficulty"
    ).bind(player.to_string()).bind(date).fetch_all(pool).await?;
    let results = rows
        .into_iter()
        .map(|r| VerifiedResult {
            group: r.group_name,
            category: r.category,
            tier: r.difficulty.as_deref().and_then(Difficulty::parse),
            metric: r.metric,
        })
        .collect::<Vec<_>>();
    let mut summary = summarize(date, &registry, &results);
    if let Some(user) = user {
        let seen = sqlx::query_as::<_, (Option<String>,Option<i64>)>("SELECT highest_celebrated_tier,goat_seen_at FROM user_daily_completion_milestones WHERE user_id=? AND challenge_date=? AND requirement_version=?")
            .bind(user).bind(date).bind(registry.version).fetch_optional(pool).await?;
        if let Some((tier, goat)) = seen {
            summary.highest_celebrated_tier = tier.as_deref().and_then(Difficulty::parse);
            summary.goat_seen = goat.is_some();
        }
    }
    Ok(summary)
}

pub async fn mark_seen(
    pool: &SqlitePool,
    summary: &DailyCompletionSummary,
    user: Option<&str>,
    tier: Option<Difficulty>,
    goat: bool,
    now: i64,
) -> AppResult<()> {
    if tier_rank(tier) > tier_rank(summary.highest_completed_tier)
        || (goat && !summary.hardcore_sweep)
    {
        return Err(AppError::validation(
            "Only verified daily milestones can be acknowledged.",
        ));
    }
    if let Some(user) = user {
        sqlx::query("INSERT INTO user_daily_completion_milestones (user_id,challenge_date,requirement_version,highest_celebrated_tier,goat_seen_at,updated_at) VALUES (?,?,?,?,?,?) \
            ON CONFLICT(user_id,challenge_date,requirement_version) DO UPDATE SET \
            highest_celebrated_tier=CASE WHEN excluded.highest_celebrated_tier='hardcore' OR user_daily_completion_milestones.highest_celebrated_tier IS NULL \
              OR (excluded.highest_celebrated_tier='challenge' AND user_daily_completion_milestones.highest_celebrated_tier='normal') THEN excluded.highest_celebrated_tier ELSE user_daily_completion_milestones.highest_celebrated_tier END, \
            goat_seen_at=COALESCE(user_daily_completion_milestones.goat_seen_at,excluded.goat_seen_at),updated_at=excluded.updated_at")
            .bind(user).bind(&summary.challenge_date).bind(summary.requirement_version).bind(tier.map(Difficulty::as_str)).bind(goat.then_some(now)).bind(now).execute(pool).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
