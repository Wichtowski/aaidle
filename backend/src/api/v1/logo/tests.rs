use super::*;
use axum::http::{HeaderValue, header};
use http_body_util::BodyExt;
use image::GenericImageView;

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
async fn logo_handlers_serve_authorized_crop_then_full_solved_image() {
    let mut state = super::super::test_support::state().await;
    let source_server = crate::logo_images::tests::image_server().await;
    state.logo_images = std::sync::Arc::new(
        crate::logo_images::LogoImageCache::new(
            &source_server.origin,
            std::time::Duration::from_secs(2),
        )
        .unwrap(),
    );
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
    sqlx::query("UPDATE logo_challenges SET answer_model_id = 'openai', asset_path = '/common/company-logo-1.png' WHERE id = ?")
        .bind(loaded.challenge.id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    assert!(loaded.progress.image_url.starts_with(&format!(
        "/api/v1/games/logo/challenges/{}/image?v=",
        loaded.challenge.id
    )));
    let initial_response = image(
        State(state.clone()),
        HeaderMap::new(),
        Path(loaded.challenge.id.to_string()),
        Query(LogoPlayerQuery { player_id }),
        Some("0".to_owned()),
    )
    .await
    .unwrap();
    assert_eq!(
        initial_response.headers()[header::CONTENT_TYPE],
        "image/png"
    );
    assert!(
        initial_response.headers()[header::CACHE_CONTROL]
            .to_str()
            .unwrap()
            .starts_with("private, max-age=")
    );
    let initial_image = initial_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    assert_eq!(
        image::load_from_memory(&initial_image)
            .unwrap()
            .dimensions(),
        (512, 512)
    );
    assert!(matches!(
        image(
            State(state.clone()),
            HeaderMap::new(),
            Path(loaded.challenge.id.to_string()),
            Query(LogoPlayerQuery { player_id }),
            Some("solved".to_owned()),
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    let answer =
        sqlx::query_scalar::<_, String>("SELECT answer_model_id FROM logo_challenges WHERE id = ?")
            .bind(loaded.challenge.id.to_string())
            .fetch_one(&state.db)
            .await
            .unwrap();
    let Json(outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:4321".parse().unwrap()),
        HeaderMap::from_iter([(
            header::ORIGIN,
            HeaderValue::from_static("http://localhost:3000"),
        )]),
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
    assert!(restored.progress.image_url.ends_with("/image?v=solved"));
    let solved_response = image(
        State(state.clone()),
        HeaderMap::new(),
        Path(loaded.challenge.id.to_string()),
        Query(LogoPlayerQuery { player_id }),
        Some("solved".to_owned()),
    )
    .await
    .unwrap();
    let solved_image = solved_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    assert_eq!(
        image::load_from_memory(&solved_image).unwrap().dimensions(),
        (512, 384)
    );
    assert_ne!(initial_image, solved_image);

    sqlx::query("UPDATE logo_challenges SET challenge_date = '2000-01-01' WHERE id = ?")
        .bind(loaded.challenge.id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        image(
            State(state),
            HeaderMap::new(),
            Path(loaded.challenge.id.to_string()),
            Query(LogoPlayerQuery { player_id }),
            Some("solved".to_owned()),
        )
        .await,
        Err(AppError::NotFound(_))
    ));
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

#[tokio::test]
async fn initial_clues_and_protected_image_clues_follow_persisted_guesses() {
    let mut state = super::super::test_support::state().await;
    let source_server = crate::logo_images::tests::image_server().await;
    state.logo_images = std::sync::Arc::new(
        crate::logo_images::LogoImageCache::new(
            &source_server.origin,
            std::time::Duration::from_secs(2),
        )
        .unwrap(),
    );
    let mut entries = state.logo.entries().cloned().collect::<Vec<_>>();
    let entry = entries
        .iter_mut()
        .find(|entry| entry.answer_id == "alexnet")
        .unwrap();
    entry.clues[0].after_incorrect_guesses = 0;
    entry.clues[1].after_incorrect_guesses = 1;
    state.logo =
        std::sync::Arc::new(crate::domain::logo::LogoCatalog::from_entries(entries).unwrap());
    let (user_id, headers) = authenticated_headers(&state).await;
    let canonical = Uuid::new_v4();
    crate::progress::canonical_player_id(
        &state.db,
        &user_id,
        canonical,
        super::super::now_millis(),
    )
    .await
    .unwrap();
    let player_id = Uuid::new_v4();
    let Json(initial) = game(
        State(state.clone()),
        headers.clone(),
        Path("normal".into()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    let id = initial.challenge.id;
    sqlx::query("UPDATE logo_challenges SET answer_model_id = 'alexnet' WHERE id = ?")
        .bind(id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    let Json(loaded) = game(
        State(state.clone()),
        headers.clone(),
        Path("normal".into()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(loaded.progress.clues.len(), 1);
    assert_eq!(loaded.progress.clues[0].after_incorrect_guesses, 0);
    assert!(loaded.progress.clues[0].image_url.is_none());
    for variant in ["clue-0", "clue-1", "clue-999", "clue-invalid"] {
        assert!(matches!(
            image(
                State(state.clone()),
                headers.clone(),
                Path(id.to_string()),
                Query(LogoPlayerQuery { player_id }),
                Some(variant.into())
            )
            .await,
            Err(AppError::NotFound(_))
        ));
    }
    let Json(outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:4321".parse().unwrap()),
        headers.clone(),
        Path(id.to_string()),
        Ok(Json(LogoGuessRequest {
            player_id,
            request_id: Uuid::new_v4(),
            guessed_model_id: "openai".into(),
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    assert_eq!(outcome.progress.clues.len(), 2);
    assert_eq!(
        outcome.progress.clues[1].image_url.as_deref(),
        Some(format!("/api/v1/games/logo/challenges/{id}/image?v=clue-1").as_str())
    );
    let serialized = serde_json::to_string(&outcome).unwrap();
    assert!(!serialized.contains("model_architecture"));
    assert!(!serialized.contains("answerModelId"));
    let response = image(
        State(state.clone()),
        headers.clone(),
        Path(id.to_string()),
        Query(LogoPlayerQuery { player_id }),
        Some("clue-1".into()),
    )
    .await
    .unwrap();
    assert_eq!(response.headers()[header::CONTENT_TYPE], "image/png");
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert!(image::load_from_memory(&bytes).is_ok());
    let Json(restored) = guess_history(
        State(state.clone()),
        headers.clone(),
        Path(id.to_string()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(restored.progress.clues.len(), 2);
    assert!(matches!(
        image(
            State(state.clone()),
            HeaderMap::new(),
            Path(id.to_string()),
            Query(LogoPlayerQuery {
                player_id: Uuid::new_v4()
            }),
            Some("clue-1".into())
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    sqlx::query("UPDATE logo_challenges SET challenge_date = '2000-01-01' WHERE id = ?")
        .bind(id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        image(
            State(state),
            headers,
            Path(id.to_string()),
            Query(LogoPlayerQuery { player_id }),
            Some("clue-1".into())
        )
        .await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn gaussian_profile_progress_and_images_restore_without_focal_point() {
    let mut state = super::super::test_support::state().await;
    let source_server = crate::logo_images::tests::image_server().await;
    state.logo_images = std::sync::Arc::new(
        crate::logo_images::LogoImageCache::new(
            &source_server.origin,
            std::time::Duration::from_secs(2),
        )
        .unwrap(),
    );
    let mut entries = state.logo.entries().cloned().collect::<Vec<_>>();
    entries
        .iter_mut()
        .find(|entry| entry.answer_id == "yolov8")
        .unwrap()
        .reveal = crate::domain::logo::RevealProfile::GaussianBlur {
        blur_start_strength: 4.0,
        blur_step_strength: 2.0,
    };
    state.logo =
        std::sync::Arc::new(crate::domain::logo::LogoCatalog::from_entries(entries).unwrap());
    let player_id = Uuid::new_v4();
    let Json(initial) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".into()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    let id = initial.challenge.id;
    sqlx::query("UPDATE logo_challenges SET answer_model_id = 'yolov8' WHERE id = ?")
        .bind(id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    let Json(loaded) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".into()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    let value = serde_json::to_value(&loaded.progress).unwrap();
    assert_eq!(value["revealProfile"], "gaussian-blur");
    assert_eq!(value["blurStartStrength"].as_f64(), Some(4.0));
    assert_eq!(value["blurStepStrength"].as_f64(), Some(2.0));
    assert!(value.get("focalPoint").is_none());
    let blurred = image(
        State(state.clone()),
        HeaderMap::new(),
        Path(id.to_string()),
        Query(LogoPlayerQuery { player_id }),
        Some("0".into()),
    )
    .await
    .unwrap()
    .into_body()
    .collect()
    .await
    .unwrap()
    .to_bytes();
    assert_eq!(
        image::load_from_memory(&blurred).unwrap().dimensions(),
        (512, 384)
    );
    for (index, answer) in ["openai", "yolov8"].into_iter().enumerate() {
        let Json(result) = guess(
            State(state.clone()),
            ConnectInfo("127.0.0.1:4321".parse().unwrap()),
            HeaderMap::from_iter([(
                header::ORIGIN,
                HeaderValue::from_static("http://localhost:3000"),
            )]),
            Path(id.to_string()),
            Ok(Json(LogoGuessRequest {
                player_id,
                request_id: Uuid::new_v4(),
                guessed_model_id: answer.into(),
                attempt_number: index as u16 + 1,
            })),
        )
        .await
        .unwrap();
        assert_eq!(result.is_correct, index == 1);
        assert_eq!(result.progress.image_revision, 1);
        assert_eq!(
            serde_json::to_value(&result.progress).unwrap()["revealProfile"],
            "gaussian-blur"
        );
    }
    let Json(restored) = guess_history(
        State(state.clone()),
        HeaderMap::new(),
        Path(id.to_string()),
        Query(LogoPlayerQuery { player_id }),
    )
    .await
    .unwrap();
    assert!(restored.progress.solved);
    assert!(
        serde_json::to_value(restored.progress)
            .unwrap()
            .get("focalPoint")
            .is_none()
    );
    let clear = image(
        State(state),
        HeaderMap::new(),
        Path(id.to_string()),
        Query(LogoPlayerQuery { player_id }),
        Some("solved".into()),
    )
    .await
    .unwrap()
    .into_body()
    .collect()
    .await
    .unwrap()
    .to_bytes();
    assert_ne!(blurred, clear);
}
