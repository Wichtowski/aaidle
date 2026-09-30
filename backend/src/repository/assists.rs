use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::{comparison::ComparisonResult, timeline::TimelineDifficulty},
    error::{AppError, AppResult},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnHint {
    pub column: String,
    pub value: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicAssistState {
    pub hints: Vec<ColumnHint>,
    pub available_columns: Vec<String>,
    pub remaining_hints: i64,
}

pub async fn classic_assists(
    pool: &SqlitePool,
    challenge_id: Uuid,
    player_id: Uuid,
    selected_column: Option<&str>,
) -> AppResult<ClassicAssistState> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let challenge = super::find_challenge(&mut *transaction, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Classic challenge not found.".to_owned()))?;
    let (category, difficulty) = super::parse_classic_mode(&challenge.mode)
        .ok_or_else(|| AppError::NotFound("Classic challenge not found.".to_owned()))?;
    if difficulty != super::ClassicDifficulty::Normal {
        return Err(AppError::Forbidden(
            "Hints are available only in Classic Normal.".to_owned(),
        ));
    }
    let guesses = sqlx::query_as::<_, (i64, String)>(
        "SELECT is_correct, comparison_json FROM guess_events WHERE challenge_id = ? AND player_id = ?",
    )
    .bind(challenge_id.to_string())
    .bind(player_id.to_string())
    .fetch_all(&mut *transaction)
    .await?;
    let mut matched = BTreeSet::new();
    let mut misses = 0;
    let mut solved = false;
    for (is_correct, comparison) in guesses {
        solved |= is_correct != 0;
        misses += i64::from(is_correct == 0);
        let comparison: BTreeMap<String, ComparisonResult> = serde_json::from_str(&comparison)?;
        matched.extend(comparison.into_iter().filter_map(|(column, result)| {
            (result == ComparisonResult::Correct).then_some(column)
        }));
    }
    let mut hints = stored_classic_hints(&mut transaction, challenge_id, player_id).await?;
    let columns = super::classic_columns(category, difficulty);
    let mut remaining = (misses - hints.len() as i64).max(0);
    if let Some(column) = selected_column {
        if !columns.contains(&column) {
            return Err(AppError::validation("This column does not support hints."));
        }
        if !hints.iter().any(|hint| hint.column == column) {
            if solved || matched.contains(column) {
                return Err(AppError::Conflict("COLUMN_ALREADY_SOLVED".to_owned()));
            }
            if remaining == 0 {
                return Err(AppError::Conflict("HINT_NOT_AVAILABLE".to_owned()));
            }
            let answer = super::load_model(&mut transaction, &challenge.answer_model_id, false)
                .await?
                .ok_or_else(|| {
                    AppError::Unavailable("Challenge data is unavailable.".to_owned())
                })?;
            let public = serde_json::to_value(answer.public)?;
            let value = if column == "release" {
                public["releaseYear"].clone()
            } else if let Some(value) = public.get(column) {
                value.clone()
            } else {
                public["categoryDetails"]
                    .get(category.catalog_slug().unwrap_or_default())
                    .and_then(|details| details.get(column))
                    .cloned()
                    .unwrap_or(Value::Null)
            };
            sqlx::query("INSERT INTO player_challenge_hints (player_id, challenge_id, hint_index, hint_type, target_column, value_json, created_at) VALUES (?, ?, ?, 'column', ?, ?, ?)")
                .bind(player_id.to_string()).bind(challenge_id.to_string())
                .bind(hints.len() as i64 + 1).bind(column).bind(serde_json::to_string(&value)?)
                .bind(super::now_unix_millis()).execute(&mut *transaction).await?;
            hints.push(ColumnHint {
                column: column.to_owned(),
                value,
            });
            remaining -= 1;
        }
    }
    let available_columns = if solved {
        Vec::new()
    } else {
        columns
            .into_iter()
            .filter(|column| {
                !matched.contains(*column) && !hints.iter().any(|hint| hint.column == *column)
            })
            .map(str::to_owned)
            .collect()
    };
    transaction.commit().await?;
    Ok(ClassicAssistState {
        hints,
        available_columns,
        remaining_hints: if solved { 0 } else { remaining },
    })
}

async fn stored_classic_hints(
    connection: &mut SqliteConnection,
    challenge_id: Uuid,
    player_id: Uuid,
) -> AppResult<Vec<ColumnHint>> {
    sqlx::query_as::<_, (String, String)>("SELECT target_column, value_json FROM player_challenge_hints WHERE challenge_id = ? AND player_id = ? ORDER BY hint_index")
        .bind(challenge_id.to_string()).bind(player_id.to_string()).fetch_all(connection).await?
        .into_iter().map(|(column, value)| Ok(ColumnHint { column, value: serde_json::from_str(&value)? })).collect()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoPlacement {
    pub card_id: String,
    pub position: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineAssistState {
    pub auto_placements: Vec<AutoPlacement>,
    pub incorrect_submissions: i64,
    pub unlock_every: i64,
    pub remaining_auto_placements: i64,
    pub available_card_ids: Vec<String>,
}

pub async fn timeline_assists(
    pool: &SqlitePool,
    challenge_id: Uuid,
    player_id: Uuid,
    selected_card: Option<&str>,
) -> AppResult<TimelineAssistState> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let row = super::timeline::find_timeline_challenge(&mut transaction, challenge_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Timeline challenge not found.".to_owned()))?;
    let challenge = super::timeline::parse_challenge(row)?;
    let unlock_every = match challenge.difficulty {
        TimelineDifficulty::Normal => 3,
        TimelineDifficulty::Challenge => 5,
        _ => {
            return Err(AppError::Forbidden(
                "Auto-place is available only in Timeline Normal and Challenge.".to_owned(),
            ));
        }
    };
    let attempts = sqlx::query_as::<_, (i64, String, String)>("SELECT is_correct, model_order_json, placements_json FROM timeline_attempts WHERE challenge_id = ? AND player_id = ? ORDER BY attempt_number")
        .bind(challenge_id.to_string()).bind(player_id.to_string()).fetch_all(&mut *transaction).await?;
    let mut incorrect_submissions = 0;
    let mut resolved = BTreeSet::new();
    let mut solved = false;
    for (correct, order, placements) in attempts {
        incorrect_submissions += i64::from(correct == 0);
        solved |= correct != 0;
        let order: Vec<String> = serde_json::from_str(&order)?;
        let placements: Vec<u8> = serde_json::from_str(&placements)?;
        resolved.extend(
            order
                .into_iter()
                .zip(placements)
                .filter_map(|(id, placement)| (placement == 1).then_some(id)),
        );
    }
    let cards = sqlx::query_scalar::<_, String>("SELECT card_id FROM player_timeline_auto_placements WHERE challenge_id = ? AND player_id = ? ORDER BY unlock_index")
        .bind(challenge_id.to_string()).bind(player_id.to_string()).fetch_all(&mut *transaction).await?;
    let mut auto_placements = Vec::new();
    for card_id in cards {
        let position = challenge
            .model_order
            .iter()
            .position(|model| model.id == card_id)
            .ok_or_else(|| AppError::Unavailable("Stored assistance is unavailable.".to_owned()))?;
        auto_placements.push(AutoPlacement { card_id, position });
    }
    let mut remaining =
        (incorrect_submissions / unlock_every - auto_placements.len() as i64).max(0);
    if let Some(card) = selected_card {
        let position = challenge
            .model_order
            .iter()
            .position(|model| model.id == card)
            .ok_or_else(|| AppError::validation("cardId must belong to this challenge."))?;
        if !auto_placements
            .iter()
            .any(|placement| placement.card_id == card)
        {
            if solved || resolved.contains(card) || challenge.anchor_positions.contains(&position) {
                return Err(AppError::Conflict("CARD_ALREADY_RESOLVED".to_owned()));
            }
            if remaining == 0 {
                return Err(AppError::Conflict("AUTO_PLACE_NOT_AVAILABLE".to_owned()));
            }
            sqlx::query("INSERT INTO player_timeline_auto_placements (player_id, challenge_id, unlock_index, card_id, created_at) VALUES (?, ?, ?, ?, ?)")
                .bind(player_id.to_string()).bind(challenge_id.to_string()).bind(auto_placements.len() as i64 + 1)
                .bind(card).bind(super::now_unix_millis()).execute(&mut *transaction).await?;
            auto_placements.push(AutoPlacement {
                card_id: card.to_owned(),
                position,
            });
            remaining -= 1;
        }
    }
    let available_card_ids = if solved {
        Vec::new()
    } else {
        challenge
            .tray_order
            .iter()
            .filter(|id| {
                !resolved.contains(*id)
                    && !auto_placements
                        .iter()
                        .any(|placement| placement.card_id == **id)
            })
            .cloned()
            .collect()
    };
    transaction.commit().await?;
    Ok(TimelineAssistState {
        auto_placements,
        incorrect_submissions,
        unlock_every,
        remaining_auto_placements: if solved { 0 } else { remaining },
        available_card_ids,
    })
}

pub(crate) async fn merge_player_assists(
    connection: &mut SqliteConnection,
    incoming: &str,
    canonical: &str,
) -> AppResult<()> {
    let hints = sqlx::query_as::<_, (String, String, String, i64)>("SELECT challenge_id, target_column, value_json, created_at FROM player_challenge_hints WHERE player_id = ? ORDER BY challenge_id, hint_index")
        .bind(incoming).fetch_all(&mut *connection).await?;
    for (challenge, column, value, created_at) in hints {
        sqlx::query("INSERT INTO player_challenge_hints (player_id, challenge_id, hint_index, hint_type, target_column, value_json, created_at) SELECT ?, ?, COALESCE(MAX(hint_index), 0) + 1, 'column', ?, ?, ? FROM player_challenge_hints WHERE player_id = ? AND challenge_id = ? ON CONFLICT(player_id, challenge_id, target_column) DO NOTHING")
            .bind(canonical).bind(&challenge).bind(column).bind(value).bind(created_at).bind(canonical).bind(&challenge)
            .execute(&mut *connection).await?;
    }
    sqlx::query("DELETE FROM player_challenge_hints WHERE player_id = ?")
        .bind(incoming)
        .execute(&mut *connection)
        .await?;
    let placements = sqlx::query_as::<_, (String, String, i64)>("SELECT challenge_id, card_id, created_at FROM player_timeline_auto_placements WHERE player_id = ? ORDER BY challenge_id, unlock_index")
        .bind(incoming).fetch_all(&mut *connection).await?;
    for (challenge, card, created_at) in placements {
        sqlx::query("INSERT INTO player_timeline_auto_placements (player_id, challenge_id, unlock_index, card_id, created_at) SELECT ?, ?, COALESCE(MAX(unlock_index), 0) + 1, ?, ? FROM player_timeline_auto_placements WHERE player_id = ? AND challenge_id = ? ON CONFLICT(player_id, challenge_id, card_id) DO NOTHING")
            .bind(canonical).bind(&challenge).bind(card).bind(created_at).bind(canonical).bind(&challenge)
            .execute(&mut *connection).await?;
    }
    sqlx::query("DELETE FROM player_timeline_auto_placements WHERE player_id = ?")
        .bind(incoming)
        .execute(connection)
        .await?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests;
