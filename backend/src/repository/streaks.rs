use serde::Serialize;
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use time::{Date, OffsetDateTime};
use uuid::Uuid;

use super::{format_date, parse_date};
use crate::{
    domain::streak::{ROLLOVER_GRACE, completion_qualifies, derive_streak, rollover},
    error::{AppError, AppResult},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameFamily {
    Classic,
    Timeline,
    Emoji,
    Logo,
}

impl GameFamily {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Classic => "classic",
            Self::Timeline => "timeline",
            Self::Emoji => "emoji",
            Self::Logo => "logo",
        }
    }

    // The earliest server-recorded activity of one player on one challenge
    const fn started_at_query(self) -> &'static str {
        match self {
            Self::Classic => {
                "SELECT MIN(created_at) FROM guess_events WHERE challenge_id = ?1 AND player_id = ?2"
            }
            Self::Emoji => {
                "SELECT MIN(created_at) FROM visual_clue_guess_events WHERE challenge_id = ?1 AND player_id = ?2"
            }
            Self::Logo => {
                "SELECT MIN(created_at) FROM logo_guess_events WHERE challenge_id = ?1 AND player_id = ?2"
            }
            Self::Timeline => {
                "SELECT MIN(started_at) FROM (\
                   SELECT created_at AS started_at FROM timeline_attempts WHERE challenge_id = ?1 AND player_id = ?2 \
                   UNION ALL \
                   SELECT started_at FROM timeline_speedrun_starts WHERE challenge_id = ?1 AND player_id = ?2\
                 )"
            }
        }
    }
}

fn instant(unix_millis: i64) -> AppResult<OffsetDateTime> {
    OffsetDateTime::from_unix_timestamp_nanos(i128::from(unix_millis) * 1_000_000)
        .map_err(|_| AppError::Unavailable("Stored completion time is invalid.".to_owned()))
}

/// Records the streak day a correct, server-accepted completion earns, if any.
///
/// Every completion path calls this inside the transaction that stores the completion
/// event, after that event was inserted. `completed_at` is server time, never a client value
pub(crate) async fn record_completion(
    connection: &mut SqliteConnection,
    family: GameFamily,
    player: Uuid,
    challenge_id: &str,
    challenge_date: &str,
    completed_at: i64,
) -> AppResult<()> {
    let started_at = sqlx::query_scalar::<_, Option<i64>>(family.started_at_query())
        .bind(challenge_id)
        .bind(player.to_string())
        .fetch_one(&mut *connection)
        .await?
        .map(instant)
        .transpose()?;
    if !completion_qualifies(
        parse_date(challenge_date)?,
        instant(completed_at)?,
        started_at,
    ) {
        return Ok(());
    }
    sqlx::query(
        "INSERT OR IGNORE INTO player_game_streak_days (player_id, game_type, game_date, completed_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(player.to_string())
    .bind(family.as_str())
    .bind(challenge_date)
    .bind(completed_at)
    .execute(connection)
    .await?;
    Ok(())
}

/// Removes a Classic streak day once no completion that could have earned it remains,
/// for example after an administrator deleted the winning guess
pub(crate) async fn revoke_unearned_classic_day(
    connection: &mut SqliteConnection,
    player_id: &str,
    game_date: &str,
) -> AppResult<()> {
    let deadline = rollover(parse_date(game_date)?)
        .map(|rollover| (rollover + ROLLOVER_GRACE).unix_timestamp() * 1_000)
        .unwrap_or(i64::MAX);
    sqlx::query(
        "DELETE FROM player_game_streak_days WHERE player_id = ?1 AND game_type = 'classic' AND game_date = ?2 \
         AND NOT EXISTS (\
           SELECT 1 FROM guess_events g JOIN daily_challenges d ON d.id = g.challenge_id \
           WHERE g.player_id = ?1 AND g.is_correct = 1 AND d.challenge_date = ?2 AND g.created_at < ?3\
         )",
    )
    .bind(player_id)
    .bind(game_date)
    .bind(deadline)
    .execute(connection)
    .await?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStreak {
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_streak_date: Option<String>,
    pub secured_today: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStreaks {
    pub current_game_date: String,
    pub classic: GameStreak,
    pub timeline: GameStreak,
    pub emoji: GameStreak,
    pub logo: GameStreak,
}

#[derive(FromRow)]
struct StreakDay {
    game_type: String,
    game_date: String,
}

pub async fn game_streaks(pool: &SqlitePool, player: Uuid, today: Date) -> AppResult<GameStreaks> {
    let rows = sqlx::query_as::<_, StreakDay>(
        "SELECT game_type, game_date FROM player_game_streak_days WHERE player_id = ? AND game_date <= ? ORDER BY game_date",
    ).bind(player.to_string()).bind(format_date(today)?).fetch_all(pool).await?;
    let family = |family: GameFamily| -> AppResult<GameStreak> {
        let dates = rows
            .iter()
            .filter(|row| row.game_type == family.as_str())
            .map(|row| parse_date(&row.game_date))
            .collect::<AppResult<Vec<_>>>()?;
        let streak = derive_streak(dates, today);
        Ok(GameStreak {
            current_streak: streak.current_streak,
            longest_streak: streak.best_streak,
            secured_today: streak.last_solved_date == Some(today),
            last_streak_date: streak.last_solved_date.map(format_date).transpose()?,
        })
    };
    Ok(GameStreaks {
        current_game_date: format_date(today)?,
        classic: family(GameFamily::Classic)?,
        timeline: family(GameFamily::Timeline)?,
        emoji: family(GameFamily::Emoji)?,
        logo: family(GameFamily::Logo)?,
    })
}

pub async fn merge_streak_days(
    connection: &mut SqliteConnection,
    incoming: &str,
    canonical: &str,
) -> AppResult<()> {
    sqlx::query("INSERT OR IGNORE INTO player_game_streak_days (player_id,game_type,game_date,completed_at) SELECT ?,game_type,game_date,completed_at FROM player_game_streak_days WHERE player_id = ?")
        .bind(canonical).bind(incoming).execute(&mut *connection).await?;
    sqlx::query("DELETE FROM player_game_streak_days WHERE player_id = ?")
        .bind(incoming)
        .execute(connection)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests;
