#![forbid(unsafe_code)]

use std::sync::Arc;

use aidle_api::{auth, config::AppConfig, db, error::AppResult};
use time::OffsetDateTime;
use uuid::Uuid;

const EMAIL: &str = "admin@test.com";
const PASSWORD: &str = "zaq1@WSX";
const PLAYER_ID: &str = "00000000-0000-4000-8000-000000000001";

#[tokio::main]
async fn main() -> AppResult<()> {
    dotenvy::dotenv().ok();
    let config = Arc::new(AppConfig::from_env()?);
    let pool = db::connect(&config).await?;
    db::migrate(&pool).await?;

    let email = auth::normalize_email(EMAIL)?;
    let password_hash = auth::hash_password(PASSWORD)?;
    let now = OffsetDateTime::now_utc()
        .unix_timestamp_nanos()
        .div_euclid(1_000_000) as i64;

    sqlx::query(
        "INSERT INTO users \
         (id, email, email_normalized, password_hash, email_verified_at, permission, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, 'superadmin', ?, ?) \
         ON CONFLICT(email_normalized) DO UPDATE SET \
         email = excluded.email, password_hash = excluded.password_hash, \
         email_verified_at = excluded.email_verified_at, permission = excluded.permission, \
         disabled_at = NULL, disabled_reason = NULL, disabled_by_user_id = NULL, \
         updated_at = excluded.updated_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&email)
    .bind(&email)
    .bind(password_hash)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    let user_id =
        sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email_normalized = ?")
            .bind(&email)
            .fetch_one(&pool)
            .await?;
    let player_id = Uuid::parse_str(PLAYER_ID).expect("fixture player ID is a UUID");

    sqlx::query(
        "INSERT INTO anonymous_players (id, created_at, last_seen_at) VALUES (?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
    )
    .bind(PLAYER_ID)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO user_player_links (user_id, player_id, linked_at) VALUES (?, ?, ?) \
         ON CONFLICT(user_id, player_id) DO UPDATE SET linked_at = excluded.linked_at",
    )
    .bind(&user_id)
    .bind(PLAYER_ID)
    .bind(now)
    .execute(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO user_progress_profiles \
         (user_id, primary_player_id, has_seen_classic_privacy, has_seen_classic_how_to_play, \
          inner_circle_active, updated_at) \
         VALUES (?, ?, 1, 1, 1, ?) \
         ON CONFLICT(user_id) DO UPDATE SET primary_player_id = excluded.primary_player_id, \
          has_seen_classic_privacy = 1, has_seen_classic_how_to_play = 1, \
          inner_circle_active = 1, updated_at = excluded.updated_at",
    )
    .bind(&user_id)
    .bind(PLAYER_ID)
    .bind(now)
    .execute(&pool)
    .await?;

    let challenges = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, mode, answer_model_id FROM daily_challenges \
         WHERE mode LIKE 'classic:%' ORDER BY challenge_date, mode",
    )
    .fetch_all(&pool)
    .await?;
    let model_ids = sqlx::query_scalar::<_, String>(
        "SELECT id FROM models WHERE is_guessable = 1 AND status = 'active' ORDER BY id",
    )
    .fetch_all(&pool)
    .await?;

    let mut completed = 0_usize;
    for (challenge_id, mode, answer_model_id) in challenges {
        let challenge_id =
            Uuid::parse_str(&challenge_id).expect("seeded Classic challenge ID is a UUID");
        let has_correct = sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM guess_events WHERE challenge_id = ? \
             AND player_id = ? AND is_correct = 1)",
        )
        .bind(challenge_id.to_string())
        .bind(PLAYER_ID)
        .fetch_one(&pool)
        .await?
            != 0;

        if !has_correct {
            let guess_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM guess_events WHERE challenge_id = ? AND player_id = ?",
            )
            .bind(challenge_id.to_string())
            .bind(PLAYER_ID)
            .fetch_one(&pool)
            .await?;

            if guess_count == 0 {
                let wrong_model_id = if mode.ends_with(":normal") {
                    let category = mode
                        .strip_prefix("classic:")
                        .and_then(|value| value.strip_suffix(":normal"))
                        .map(|value| {
                            if value == "od" {
                                "object-detection"
                            } else {
                                value
                            }
                        });
                    if let Some(category) = category {
                        sqlx::query_scalar::<_, String>(
                            "SELECT m.id FROM models m \
                             JOIN model_categories mc ON mc.model_id = m.id \
                             JOIN categories c ON c.id = mc.category_id \
                             LEFT JOIN model_game_metadata g ON g.model_id = m.id \
                             WHERE m.is_guessable = 1 AND m.status = 'active' \
                             AND c.slug = ? AND COALESCE(g.min_pool_rank, 0) <= 0 \
                             AND m.id != ? ORDER BY m.id LIMIT 1",
                        )
                        .bind(category)
                        .bind(&answer_model_id)
                        .fetch_optional(&pool)
                        .await?
                    } else {
                        None
                    }
                } else {
                    model_ids
                        .iter()
                        .find(|model_id| *model_id != &answer_model_id)
                        .cloned()
                };
                if let Some(wrong_model_id) = wrong_model_id {
                    let _ = aidle_api::repository::process_guess(
                        &pool,
                        aidle_api::repository::GuessInput {
                            challenge_id,
                            player_id,
                            user_id: Some(user_id.clone()),
                            request_id: Uuid::new_v4(),
                            guessed_model_id: wrong_model_id,
                            attempt_number: 1,
                        },
                    )
                    .await;
                }
            }

            let next_attempt = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) + 1 FROM guess_events WHERE challenge_id = ? AND player_id = ?",
            )
            .bind(challenge_id.to_string())
            .bind(PLAYER_ID)
            .fetch_one(&pool)
            .await? as u16;
            aidle_api::repository::process_guess(
                &pool,
                aidle_api::repository::GuessInput {
                    challenge_id,
                    player_id,
                    user_id: Some(user_id.clone()),
                    request_id: Uuid::new_v4(),
                    guessed_model_id: answer_model_id,
                    attempt_number: next_attempt,
                },
            )
            .await?;
        }

        aidle_api::progress::record_authenticated_classic_completion(
            &pool,
            &user_id,
            challenge_id,
            now,
        )
        .await?;
        completed += 1;
    }

    auth::grant_hardcore_access(&pool, &user_id, now).await?;
    println!(
        "Provisioned development superadmin {EMAIL} with Hardcore access and history for {completed} Classic challenges."
    );
    Ok(())
}
