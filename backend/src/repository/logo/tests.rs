use super::*;
use sqlx::sqlite::SqlitePoolOptions;

async fn pool_and_catalog() -> (SqlitePool, LogoCatalog) {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::db::migrate(&pool).await.unwrap();
    let catalog = LogoCatalog::load().unwrap();
    sqlx::query(
        "INSERT INTO providers (id, name, slug, is_active, created_at, updated_at) VALUES ('logo-provider', 'Logo Provider', 'logo-provider', 1, 0, 0)",
    )
    .execute(&pool)
    .await
    .unwrap();
    for (index, entry) in catalog.entries().enumerate() {
        sqlx::query(
            "INSERT INTO models (id, provider_id, name, slug, local_execution, reasoning_support, status, is_guessable, verified_at, source_label, created_at, updated_at) VALUES (?, 'logo-provider', ?, ?, 'unknown', 'no', 'active', 1, '2026-01-01', 'test', 0, 0)",
        )
        .bind(&entry.answer_id)
        .bind(format!("Logo Model {index}"))
        .bind(format!("logo-model-{index}"))
        .execute(&pool)
        .await
        .unwrap();
    }
    (pool, catalog)
}

#[tokio::test]
async fn logo_game_progresses_to_text_clue_and_completes() {
    let (pool, catalog) = pool_and_catalog().await;
    assert!(
        game(
            &pool,
            &catalog,
            "2026-09-01",
            "challenge",
            "secret",
            Uuid::new_v4()
        )
        .await
        .is_err()
    );
    let player_id = Uuid::new_v4();
    let data = game(
        &pool,
        &catalog,
        "2026-09-01",
        "normal",
        "selection-secret",
        player_id,
    )
    .await
    .unwrap();
    assert_eq!(data.models.len(), catalog.eligible(0).count());
    assert_eq!(data.progress.image_revision, 0);
    assert!(data.progress.clues.is_empty());
    let challenge_id = Uuid::parse_str(&data.challenge.id).unwrap();
    sqlx::query("UPDATE logo_challenges SET asset_path = 'assets/logo/old-path.webp' WHERE id = ?")
        .bind(challenge_id.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let wrong = catalog
        .eligible(0)
        .filter(|entry| entry.answer_id != data.challenge.answer_model_id)
        .take(5)
        .map(|entry| entry.answer_id.clone())
        .collect::<Vec<_>>();
    for (index, guessed_model_id) in wrong.into_iter().enumerate() {
        let outcome = process_guess(
            &pool,
            &catalog,
            LogoGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id,
                attempt_number: (index + 1) as u16,
            },
        )
        .await
        .unwrap();
        assert!(!outcome.is_correct);
        assert_eq!(outcome.progress.image_revision, index + 1);
    }
    let history_before = history(&pool, &catalog, challenge_id, player_id)
        .await
        .unwrap();
    assert_eq!(history_before.guesses.len(), 5);
    assert_eq!(history_before.progress.clues.len(), 1);
    assert!(
        history_before
            .progress
            .image_url
            .starts_with("/logo-visual/")
    );
    let solved = process_guess(
        &pool,
        &catalog,
        LogoGuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: data.challenge.answer_model_id,
            attempt_number: 6,
        },
    )
    .await
    .unwrap();
    assert!(solved.is_correct);
    assert_eq!(solved.progress.image_revision, 5);
    assert!(solved.progress.attribution.is_none());
    assert_eq!(solved.completion_count, 1);
    assert!(solved.progress.image_url.starts_with("/logo-visual/"));
}

#[tokio::test]
async fn logo_guess_rejects_stale_duplicate_and_out_of_pool_requests() {
    let (pool, catalog) = pool_and_catalog().await;
    let player_id = Uuid::new_v4();
    let data = game(&pool, &catalog, "2026-09-02", "normal", "secret", player_id)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&data.challenge.id).unwrap();
    let wrong = catalog
        .eligible(0)
        .find(|entry| entry.answer_id != data.challenge.answer_model_id)
        .unwrap()
        .answer_id
        .clone();
    let request_id = Uuid::new_v4();
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            LogoGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id,
                guessed_model_id: wrong.clone(),
                attempt_number: 2,
            }
        )
        .await,
        Err(AppError::Conflict(code)) if code == "STALE_GUESS_STATE"
    ));
    process_guess(
        &pool,
        &catalog,
        LogoGuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id,
            guessed_model_id: wrong.clone(),
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            LogoGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id,
                guessed_model_id: data.challenge.answer_model_id.clone(),
                attempt_number: 2,
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            LogoGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: "not-curated".to_owned(),
                attempt_number: 2,
            }
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn missing_challenges_are_not_disclosed() {
    let (pool, catalog) = pool_and_catalog().await;
    assert!(
        history(&pool, &catalog, Uuid::new_v4(), Uuid::new_v4())
            .await
            .is_err()
    );
}
