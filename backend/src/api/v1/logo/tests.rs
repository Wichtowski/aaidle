use super::*;
use axum::http::{HeaderValue, header};

async fn seed_models(state: &AppState) {
    sqlx::query(
        "INSERT INTO providers (id, name, slug, is_active, created_at, updated_at) VALUES ('logo-provider', 'Logo Provider', 'logo-provider', 1, 0, 0)",
    )
    .execute(&state.db)
    .await
    .unwrap();
    for (index, entry) in state.logo.entries().enumerate() {
        sqlx::query(
            "INSERT INTO models (id, provider_id, name, slug, local_execution, reasoning_support, status, is_guessable, verified_at, source_label, created_at, updated_at) VALUES (?, 'logo-provider', ?, ?, 'unknown', 'no', 'active', 1, '2026-01-01', 'test', 0, 0)",
        )
        .bind(&entry.answer_id)
        .bind(format!("Logo API Model {index}"))
        .bind(format!("logo-api-model-{index}"))
        .execute(&state.db)
        .await
        .unwrap();
    }
}

async fn authenticated_headers(state: &AppState) -> (String, HeaderMap) {
    let user_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?)")
        .bind(&user_id)
        .bind(format!("{user_id}@example.com"))
        .bind(format!("{user_id}@example.com"))
        .bind(1_i64)
        .bind(0_i64)
        .bind(0_i64)
        .execute(&state.db)
        .await
        .unwrap();
    let token = crate::auth::create_session(&state.db, &user_id, super::super::now_millis())
        .await
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::COOKIE,
        HeaderValue::from_str(&format!("aaidle_session={token}; aaidle_csrf=csrf")).unwrap(),
    );
    headers.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    headers.insert("x-aaidle-csrf-token", HeaderValue::from_static("csrf"));
    (user_id, headers)
}

#[tokio::test]
async fn logo_handlers_load_guess_and_restore_public_asset_path() {
    let state = super::super::test_support::state().await;
    seed_models(&state).await;
    let player_id = Uuid::new_v4();
    let Json(loaded) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".to_owned()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(loaded.challenge.mode, "logo:normal");
    assert_eq!(loaded.progress.image_revision, 0);
    let answer =
        sqlx::query_scalar::<_, String>("SELECT answer_model_id FROM logo_challenges WHERE id = ?")
            .bind(loaded.challenge.id.to_string())
            .fetch_one(&state.db)
            .await
            .unwrap();
    let Json(outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:4321".parse().unwrap()),
        HeaderMap::new(),
        Path(loaded.challenge.id.to_string()),
        Ok(Json(LogoGuessRequest {
            player_id,
            request_id: Uuid::new_v4(),
            guessed_model_id: answer,
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    assert!(outcome.is_correct);
    assert_eq!(outcome.global_completion_count, 1);
    let Json(restored) = guess_history(
        State(state.clone()),
        HeaderMap::new(),
        Path(loaded.challenge.id.to_string()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(restored.guesses.len(), 1);
    assert!(restored.progress.solved);
    assert!(restored.progress.image_url.starts_with("/logo-assets/"));
}

#[tokio::test]
async fn authenticated_logo_reads_restore_the_canonical_player_history() {
    let state = super::super::test_support::state().await;
    seed_models(&state).await;
    let (user_id, headers) = authenticated_headers(&state).await;
    let canonical_player_id = Uuid::new_v4();
    crate::progress::canonical_player_id(
        &state.db,
        &user_id,
        canonical_player_id,
        super::super::now_millis(),
    )
    .await
    .unwrap();
    let requested_player_id = Uuid::new_v4();
    let Json(loaded) = game(
        State(state.clone()),
        headers.clone(),
        Path("normal".to_owned()),
        Query(LogoPlayerQuery {
            player_id: requested_player_id,
        }),
    )
    .await
    .unwrap();
    let answer =
        sqlx::query_scalar::<_, String>("SELECT answer_model_id FROM logo_challenges WHERE id = ?")
            .bind(loaded.challenge.id.to_string())
            .fetch_one(&state.db)
            .await
            .unwrap();
    let wrong = loaded
        .models
        .iter()
        .find(|model| model.id != answer)
        .unwrap()
        .id
        .clone();
    let _ = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:4321".parse().unwrap()),
        headers.clone(),
        Path(loaded.challenge.id.to_string()),
        Ok(Json(LogoGuessRequest {
            player_id: requested_player_id,
            request_id: Uuid::new_v4(),
            guessed_model_id: wrong,
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    let Json(restored) = guess_history(
        State(state),
        headers,
        Path(loaded.challenge.id.to_string()),
        Query(LogoPlayerQuery {
            player_id: requested_player_id,
        }),
    )
    .await
    .unwrap();
    assert_eq!(restored.guesses.len(), 1);
    assert_eq!(restored.progress.image_revision, 1);
}

#[tokio::test]
async fn logo_handlers_validate_difficulty_ids_and_attempts() {
    let state = super::super::test_support::state().await;
    assert!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path("challenge".to_owned()),
            Query(LogoPlayerQuery {
                player_id: Uuid::new_v4()
            }),
        )
        .await
        .is_err()
    );
    assert!(
        guess_history(
            State(state.clone()),
            HeaderMap::new(),
            Path("invalid".to_owned()),
            Query(LogoPlayerQuery {
                player_id: Uuid::new_v4()
            }),
        )
        .await
        .is_err()
    );
    assert!(
        guess(
            State(state),
            ConnectInfo("127.0.0.1:4321".parse().unwrap()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(LogoGuessRequest {
                player_id: Uuid::new_v4(),
                request_id: Uuid::new_v4(),
                guessed_model_id: "bad id".to_owned(),
                attempt_number: 0,
            })),
        )
        .await
        .is_err()
    );
}
