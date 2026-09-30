use serde::Serialize;
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use time::Date;
use uuid::Uuid;

use super::{format_date, parse_date};
use crate::{domain::streak::derive_streak, error::AppResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStreak {
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_streak_date: Option<String>,
    pub secured_today: bool,
    pub qualifying_dates: Vec<String>,
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
    let family = |name: &str| -> AppResult<GameStreak> {
        let qualifying_dates = rows
            .iter()
            .filter(|row| row.game_type == name)
            .map(|row| row.game_date.clone())
            .collect::<Vec<_>>();
        let dates = qualifying_dates
            .iter()
            .map(|date| parse_date(date))
            .collect::<AppResult<Vec<_>>>()?;
        let streak = derive_streak(dates, today);
        Ok(GameStreak {
            current_streak: streak.current_streak,
            longest_streak: streak.best_streak,
            secured_today: streak.last_solved_date == Some(today),
            last_streak_date: streak.last_solved_date.map(format_date).transpose()?,
            qualifying_dates,
        })
    };
    Ok(GameStreaks {
        current_game_date: format_date(today)?,
        classic: family("classic")?,
        timeline: family("timeline")?,
        emoji: family("emoji")?,
        logo: family("logo")?,
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
