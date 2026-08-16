use std::collections::BTreeMap;

use serde_json::{Map, Value};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

const MAX_GAMES: usize = 2_000;
const MAX_GUESSES_PER_GAME: usize = 100;

pub fn parse_progress(value: Value) -> AppResult<Value> {
    let root = value
        .as_object()
        .ok_or_else(|| AppError::validation("Progress must be an object."))?;
    if root.get("version").and_then(Value::as_i64) != Some(1) {
        return Err(AppError::validation("Progress version must be 1."));
    }
    let player_id = required_string(root, "playerId")?;
    Uuid::parse_str(player_id)
        .map_err(|_| AppError::validation("Progress playerId is invalid."))?;
    if required_string(root, "activeMode")? != "classic" {
        return Err(AppError::validation("Progress activeMode is invalid."));
    }
    let games = required_object(root, "games")?;
    if games.len() > MAX_GAMES {
        return Err(AppError::validation("Progress has too many games."));
    }
    for (game_key, game) in games {
        if game_key.is_empty() || game_key.len() > 300 {
            return Err(AppError::validation("Progress game key is invalid."));
        }
        validate_game(game)?;
    }
    let preferences = required_object(root, "preferences")?;
    for key in [
        "reducedMotion",
        "highContrast",
        "hasSeenClassicPrivacy",
        "hardcoreUnlocked",
        "innerCircleActive",
        "hellMode",
        "hasAutoplayedHardcoreSoundtrack",
    ] {
        if !preferences.get(key).is_some_and(Value::is_boolean) {
            return Err(AppError::validation("Progress preferences are invalid."));
        }
    }
    if let Some(value) = preferences.get("hasSeenClassicHowToPlay")
        && !value.is_boolean()
    {
        return Err(AppError::validation("Progress preferences are invalid."));
    }
    let stats = required_object(root, "stats")?;
    if !stats.get("classic").is_some_and(Value::is_object) {
        return Err(AppError::validation("Progress stats are invalid."));
    }
    Ok(reconcile(value))
}

pub fn merge_progress(current: Value, incoming: Value) -> AppResult<Value> {
    let current = parse_progress(current)?;
    let incoming = parse_progress(incoming)?;
    let current_root = current.as_object().expect("validated progress object");
    let incoming_root = incoming.as_object().expect("validated progress object");
    let mut merged = incoming_root.clone();
    merged.insert(
        "playerId".to_owned(),
        current_root
            .get("playerId")
            .expect("validated player ID")
            .clone(),
    );
    let current_games = required_object(current_root, "games")?;
    let incoming_games = required_object(incoming_root, "games")?;
    let mut games = current_games.clone();
    for (key, incoming_game) in incoming_games {
        let next = match current_games.get(key) {
            Some(current_game) => merge_game(current_game, incoming_game)?,
            None => incoming_game.clone(),
        };
        games.insert(key.clone(), next);
    }
    merged.insert("games".to_owned(), Value::Object(games));
    let current_preferences = required_object(current_root, "preferences")?;
    let incoming_preferences = required_object(incoming_root, "preferences")?;
    let mut preferences = current_preferences.clone();
    preferences.extend(incoming_preferences.clone());
    for key in ["hardcoreUnlocked", "hasAutoplayedHardcoreSoundtrack"] {
        let value = current_preferences
            .get(key)
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || incoming_preferences
                .get(key)
                .and_then(Value::as_bool)
                .unwrap_or(false);
        preferences.insert(key.to_owned(), Value::Bool(value));
    }
    merged.insert("preferences".to_owned(), Value::Object(preferences));
    Ok(reconcile(Value::Object(merged)))
}

pub fn solved_challenge_ids(progress: &Value) -> Vec<String> {
    progress
        .pointer("/games")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(_, game)| {
            (game.get("status").and_then(Value::as_str) == Some("solved"))
                .then(|| {
                    game.get("challengeId")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                })
                .flatten()
        })
        .collect()
}

pub fn hardcore_unlocked(progress: &Value) -> bool {
    progress
        .pointer("/preferences/hardcoreUnlocked")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn validate_game(value: &Value) -> AppResult<()> {
    let game = value
        .as_object()
        .ok_or_else(|| AppError::validation("Progress game is invalid."))?;
    for key in ["challengeId", "challengeDate", "mode", "startedAt"] {
        bounded_string(
            required_string(game, key)?,
            300,
            "Progress game is invalid.",
        )?;
    }
    if !matches!(
        game.get("status").and_then(Value::as_str),
        Some("in-progress" | "solved")
    ) {
        return Err(AppError::validation("Progress game is invalid."));
    }
    if !matches!(
        game.get("completedAt"),
        Some(Value::Null | Value::String(_))
    ) {
        return Err(AppError::validation("Progress game is invalid."));
    }
    let guesses = game
        .get("guesses")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::validation("Progress game guesses are invalid."))?;
    if guesses.len() > MAX_GUESSES_PER_GAME {
        return Err(AppError::validation("Progress game has too many guesses."));
    }
    for guess in guesses {
        let guess = guess
            .as_object()
            .ok_or_else(|| AppError::validation("Progress guess is invalid."))?;
        Uuid::parse_str(required_string(guess, "requestId")?)
            .map_err(|_| AppError::validation("Progress guess is invalid."))?;
        bounded_string(
            required_string(guess, "attemptedAt")?,
            64,
            "Progress guess is invalid.",
        )?;
        if !guess.get("isCorrect").is_some_and(Value::is_boolean) {
            return Err(AppError::validation("Progress guess is invalid."));
        }
    }
    Ok(())
}

fn merge_game(current: &Value, incoming: &Value) -> AppResult<Value> {
    let current = current
        .as_object()
        .ok_or_else(|| AppError::validation("Progress game is invalid."))?;
    let incoming = incoming
        .as_object()
        .ok_or_else(|| AppError::validation("Progress game is invalid."))?;
    let mut merged = incoming.clone();
    let mut guesses = BTreeMap::new();
    for guess in current
        .get("guesses")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .chain(
            incoming
                .get("guesses")
                .and_then(Value::as_array)
                .into_iter()
                .flatten(),
        )
    {
        let request_id = guess
            .get("requestId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::validation("Progress guess is invalid."))?;
        guesses.insert(request_id.to_owned(), guess.clone());
    }
    let mut guesses = guesses.into_values().collect::<Vec<_>>();
    guesses.sort_by_key(|guess| {
        guess
            .get("attemptedAt")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    });
    merged.insert("guesses".to_owned(), Value::Array(guesses));
    let solved = current.get("status").and_then(Value::as_str) == Some("solved")
        || incoming.get("status").and_then(Value::as_str) == Some("solved");
    merged.insert(
        "status".to_owned(),
        Value::String(if solved { "solved" } else { "in-progress" }.to_owned()),
    );
    merged.insert(
        "startedAt".to_owned(),
        Value::String(min_string(current, incoming, "startedAt")?),
    );
    merged.insert(
        "completedAt".to_owned(),
        earliest_completed_at(current, incoming),
    );
    Ok(Value::Object(merged))
}

fn reconcile(mut progress: Value) -> Value {
    let solved_game_guess_counts = progress
        .pointer("/games")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter(|(_, game)| game.get("status").and_then(Value::as_str) == Some("solved"))
        .map(|(_, game)| {
            game.get("guesses")
                .and_then(Value::as_array)
                .map_or(0, Vec::len)
        })
        .collect::<Vec<_>>();
    let mut distribution = Map::new();
    for key in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"] {
        distribution.insert(key.to_owned(), Value::from(0));
    }
    for count in &solved_game_guess_counts {
        let bucket = if *count > 9 {
            "10+"
        } else {
            &count.to_string()
        };
        distribution.insert(
            bucket.to_owned(),
            Value::from(
                distribution
                    .get(bucket)
                    .and_then(Value::as_i64)
                    .unwrap_or(0)
                    + 1,
            ),
        );
    }
    if let Some(root) = progress.as_object_mut() {
        let stats = root
            .get_mut("stats")
            .and_then(Value::as_object_mut)
            .expect("validated stats");
        let classic = stats
            .get_mut("classic")
            .and_then(Value::as_object_mut)
            .expect("validated classic stats");
        classic.insert(
            "gamesPlayed".to_owned(),
            Value::from(solved_game_guess_counts.len() as i64),
        );
        classic.insert(
            "gamesWon".to_owned(),
            Value::from(solved_game_guess_counts.len() as i64),
        );
        classic.insert("guessDistribution".to_owned(), Value::Object(distribution));
    }
    progress
}

fn required_object<'a>(
    object: &'a Map<String, Value>,
    key: &str,
) -> AppResult<&'a Map<String, Value>> {
    object
        .get(key)
        .and_then(Value::as_object)
        .ok_or_else(|| AppError::validation("Progress is invalid."))
}

fn required_string<'a>(object: &'a Map<String, Value>, key: &str) -> AppResult<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::validation("Progress is invalid."))
}

fn bounded_string(value: &str, maximum: usize, message: &str) -> AppResult<()> {
    if value.is_empty() || value.len() > maximum {
        return Err(AppError::validation(message));
    }
    Ok(())
}

fn min_string(
    current: &Map<String, Value>,
    incoming: &Map<String, Value>,
    key: &str,
) -> AppResult<String> {
    let current = required_string(current, key)?;
    let incoming = required_string(incoming, key)?;
    Ok(current.min(incoming).to_owned())
}

fn earliest_completed_at(current: &Map<String, Value>, incoming: &Map<String, Value>) -> Value {
    let values = [current.get("completedAt"), incoming.get("completedAt")]
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    values
        .into_iter()
        .min()
        .map_or(Value::Null, |value| Value::String(value.to_owned()))
}
