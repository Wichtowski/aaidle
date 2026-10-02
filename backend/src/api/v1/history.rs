use axum::http::HeaderMap;
use time::{
    Date,
    macros::{date, format_description},
};

use super::{current_utc_date, optional_authenticated_user};
use crate::{
    domain::streak::{ROLLOVER_GRACE, rollover},
    error::{AppError, AppResult},
    state::AppState,
};

pub(super) const FIRST_GAME_DATE: Date = date!(2026 - 08 - 11);

pub(super) fn parse_compact_date(value: &str) -> AppResult<Date> {
    if value.len() != 8 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(AppError::validation("date must use YYYYMMDD format"));
    }
    Date::parse(value, format_description!("[year][month][day]"))
        .map_err(|_| AppError::validation("date must be a valid YYYYMMDD date"))
}

pub(super) fn validate_range(date: Date, today: Date) -> AppResult<()> {
    if date < FIRST_GAME_DATE || date > today {
        return Err(AppError::NotFound("Daily game unavailable.".to_owned()));
    }
    Ok(())
}

pub(super) async fn requested_date(
    state: &AppState,
    headers: &HeaderMap,
    value: Option<&str>,
) -> AppResult<String> {
    let today = current_utc_date()?;
    let Some(value) = value else {
        return Ok(today);
    };
    let date = parse_compact_date(value)?;
    validate_range(
        date,
        Date::parse(&today, super::DATE_FORMAT)
            .map_err(|_| AppError::Unavailable("Current game date is invalid.".to_owned()))?,
    )?;
    let user = optional_authenticated_user(state, headers)
        .await?
        .ok_or_else(|| {
            AppError::Unauthorized("Sign in to play historical daily games.".to_owned())
        })?;
    if user.disabled {
        return Err(AppError::Forbidden(
            "This account has been disabled.".to_owned(),
        ));
    }
    date.format(super::DATE_FORMAT)
        .map_err(|_| AppError::Unavailable("Daily game date could not be formatted.".to_owned()))
}

/// The game family and raw challenge ID of a route addressed by challenge ID, unless the
/// route is public by design.
///
/// Every `/games/{family}/challenges/{id}/...` path is guarded whatever follows the ID,
/// so a route added below it later is covered without touching this function
pub(super) fn guarded_challenge(path: &str) -> Option<(&str, &str)> {
    let mut parts = path.trim_start_matches('/').split('/');
    if parts.next() != Some("games") {
        return None;
    }
    let family = parts.next()?;
    if parts.next() != Some("challenges") {
        return None;
    }
    let id = parts.next()?;
    let rest = parts.collect::<Vec<_>>();
    // Browsing a Speedrun leaderboard is not a gameplay entitlement
    if family == "timeline" && rest == ["leaderboard"] {
        return None;
    }
    Some((family, id))
}

/// Backstop every challenge-ID gameplay route, including hints, images and retries.
pub(super) async fn authorize_challenge_request(
    state: &AppState,
    headers: &HeaderMap,
    path: &str,
) -> AppResult<()> {
    let Some((family, id)) = guarded_challenge(path) else {
        return Ok(());
    };
    if id.contains('%') {
        return Err(AppError::validation(
            "challengeId must use its canonical UUID spelling",
        ));
    }
    let query = match family {
        "classic" => "SELECT challenge_date FROM daily_challenges WHERE id = ?",
        "timeline" => "SELECT challenge_date FROM timeline_challenges WHERE id = ?",
        "emoji" => "SELECT challenge_date FROM visual_clue_challenges WHERE id = ?",
        "logo" => "SELECT challenge_date FROM logo_challenges WHERE id = ?",
        // A family this guard cannot check must never reach a handler unchecked
        _ => return Err(AppError::NotFound("Daily game unavailable.".to_owned())),
    };
    // Leave malformed and unknown IDs to the route's existing validation and error contract.
    let Ok(id) = uuid::Uuid::parse_str(id) else {
        return Ok(());
    };
    let date = sqlx::query_scalar::<_, String>(query)
        .bind(id.to_string())
        .fetch_optional(&state.db)
        .await?;
    let Some(date) = date else {
        return Ok(());
    };
    let date = Date::parse(&date, super::DATE_FORMAT)
        .map_err(|_| AppError::Unavailable("Stored game date is invalid.".to_owned()))?;
    let now = time::OffsetDateTime::now_utc();
    validate_range(date, now.date())?;
    if !is_current_game(date, now) {
        let user = optional_authenticated_user(state, headers)
            .await?
            .ok_or_else(|| {
                AppError::Unauthorized("Sign in to play historical daily games.".to_owned())
            })?;
        if user.disabled {
            return Err(AppError::Forbidden(
                "This account has been disabled.".to_owned(),
            ));
        }
    }
    Ok(())
}

/// Today's game, or yesterday's while a game started before midnight may still be
/// finished. A guest can only hold yesterday's challenge ID by having loaded it yesterday
fn is_current_game(date: Date, now: time::OffsetDateTime) -> bool {
    date == now.date()
        || rollover(date).is_some_and(|rollover| now >= rollover && now < rollover + ROLLOVER_GRACE)
}

#[cfg(test)]
mod tests;
