use super::*;
use axum::{
    body::Body,
    http::{HeaderValue, Request, StatusCode, header},
};
use tower::ServiceExt;

async fn seed_models(state: &AppState) {
    sqlx::query("INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES ('p','Provider','provider','US',1,0,0)")
        .execute(&state.db).await.unwrap();
    sqlx::query("INSERT INTO categories (id,name,slug) VALUES ('language-model','Language model','language-model')")
        .execute(&state.db).await.unwrap();
    for number in 1..=3 {
        let id = format!("model-{number}");
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (?,'p',?,?,?,2024,'unknown','unknown','active',1,'test','test',0,0)")
            .bind(&id)
            .bind(format!("Model {number}"))
            .bind(&id)
            .bind(format!("2024-0{number}-01"))
            .execute(&state.db).await.unwrap();
        sqlx::query(
            "INSERT INTO model_categories (model_id,category_id) VALUES (?,'language-model')",
        )
        .bind(&id)
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
        .execute(&state.db).await.unwrap();
    let token = crate::auth::create_session(&state.db, &user_id, now_millis())
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
async fn classic_route_parameters_are_validated_before_repository_access() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path(("unknown".to_owned(), "normal".to_owned())),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path(("llm".to_owned(), "unknown".to_owned())),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        challenge_stats(State(state.clone()), Path("not-a-uuid".to_owned())).await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        player_stats(State(state), Path("not-a-uuid".to_owned())).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn guesses_reject_invalid_identifiers_and_attempt_numbers_early() {
    let state = super::super::test_support::state().await;
    let peer = ConnectInfo("127.0.0.1:1234".parse().unwrap());
    let request = GuessRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        guessed_model_id: "model-one".to_owned(),
        attempt_number: 1,
    };
    assert!(matches!(
        guess(
            State(state.clone()),
            peer,
            HeaderMap::new(),
            Path("bad-id".to_owned()),
            Ok(Json(request)),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let request = GuessRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        guessed_model_id: "bad model".to_owned(),
        attempt_number: 1,
    };
    assert!(matches!(
        guess(
            State(state.clone()),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request)),
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let request = GuessRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        guessed_model_id: "model-one".to_owned(),
        attempt_number: 0,
    };
    assert!(matches!(
        guess(
            State(state),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request)),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn protected_classic_operations_reject_missing_origin_or_authentication() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        trajectory(
            State(state.clone()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TrajectoryRequest {
                trajectory_access_token: None,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        hardcore_access(State(state.clone()), HeaderMap::new()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        hardcore_game(State(state.clone()), HeaderMap::new()).await,
        Err(AppError::Unauthorized(_))
    ));
    let mut origin_and_csrf = HeaderMap::new();
    origin_and_csrf.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    origin_and_csrf.insert(header::COOKIE, HeaderValue::from_static("aaidle_csrf=csrf"));
    origin_and_csrf.insert("x-aaidle-csrf-token", HeaderValue::from_static("csrf"));
    assert!(matches!(
        hardcore_access(State(state.clone()), origin_and_csrf).await,
        Err(AppError::Unauthorized(_))
    ));
    let (_, mut authenticated) = authenticated_headers(&state).await;
    authenticated.remove("x-aaidle-csrf-token");
    assert!(matches!(
        hardcore_access(State(state), authenticated).await,
        Err(AppError::Forbidden(_))
    ));
}

#[tokio::test]
async fn classic_game_guess_history_stats_and_trajectory_succeed() {
    let state = super::super::test_support::state().await;
    seed_models(&state).await;
    let Json(game_response) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path(("llm".to_owned(), "normal".to_owned())),
    )
    .await
    .unwrap();
    assert_eq!(game_response.models.len(), 3);
    let challenge_id = game_response.challenge.id;
    let answer = sqlx::query_scalar::<_, String>(
        "SELECT answer_model_id FROM daily_challenges WHERE id = ?",
    )
    .bind(challenge_id.to_string())
    .fetch_one(&state.db)
    .await
    .unwrap();
    let player_id = Uuid::new_v4();
    let wrong = ["model-1", "model-2", "model-3"]
        .into_iter()
        .find(|model| *model != answer)
        .unwrap();
    let Json(wrong_outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:1234".parse().unwrap()),
        HeaderMap::new(),
        Path(challenge_id.to_string()),
        Ok(Json(GuessRequest {
            player_id,
            request_id: Uuid::new_v4(),
            guessed_model_id: wrong.to_owned(),
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    assert!(!wrong_outcome.is_correct);
    assert!(wrong_outcome.trajectory_access_token.is_none());
    let Json(outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.1:1234".parse().unwrap()),
        HeaderMap::new(),
        Path(challenge_id.to_string()),
        Ok(Json(GuessRequest {
            player_id,
            request_id: Uuid::new_v4(),
            guessed_model_id: answer.clone(),
            attempt_number: 2,
        })),
    )
    .await
    .unwrap();
    assert!(outcome.is_correct);
    let access_token = outcome.trajectory_access_token.unwrap();

    let (_, authenticated) = authenticated_headers(&state).await;
    let Json(authenticated_outcome) = guess(
        State(state.clone()),
        ConnectInfo("127.0.0.2:1234".parse().unwrap()),
        authenticated.clone(),
        Path(challenge_id.to_string()),
        Ok(Json(GuessRequest {
            player_id: Uuid::new_v4(),
            request_id: Uuid::new_v4(),
            guessed_model_id: answer,
            attempt_number: 1,
        })),
    )
    .await
    .unwrap();
    assert!(authenticated_outcome.is_correct);
    let Json(authenticated_trajectory) = trajectory(
        State(state.clone()),
        authenticated,
        Path(challenge_id.to_string()),
        Ok(Json(TrajectoryRequest {
            trajectory_access_token: None,
        })),
    )
    .await
    .unwrap();
    assert_eq!(authenticated_trajectory.models.len(), 3);

    let Json(history) = guess_history(
        State(state.clone()),
        Path(challenge_id.to_string()),
        Query(GuessHistoryQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(history.guesses.len(), 2);
    let Json(challenge_stats_response) =
        challenge_stats(State(state.clone()), Path(challenge_id.to_string()))
            .await
            .unwrap();
    assert_eq!(challenge_stats_response.correct_guesses, 2);
    let Json(player_stats_response) =
        player_stats(State(state.clone()), Path(player_id.to_string()))
            .await
            .unwrap();
    assert!(
        player_stats_response
            .stats
            .iter()
            .any(|stats| stats.games_won == 1)
    );

    let mut origin = HeaderMap::new();
    origin.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    let Json(trajectory_response) = trajectory(
        State(state),
        origin,
        Path(challenge_id.to_string()),
        Ok(Json(TrajectoryRequest {
            trajectory_access_token: Some(access_token),
        })),
    )
    .await
    .unwrap();
    assert_eq!(trajectory_response.models.len(), 3);
}

#[tokio::test]
async fn hardcore_access_is_granted_after_all_category_completions() {
    let state = super::super::test_support::state().await;
    let (user_id, headers) = authenticated_headers(&state).await;
    assert!(matches!(
        hardcore_access(State(state.clone()), headers.clone()).await,
        Err(AppError::Forbidden(_))
    ));
    for category in CLASSIC_CHALLENGE_COMPLETION_CATEGORIES {
        sqlx::query("INSERT INTO user_game_progress (user_id,game_type,difficulty,category,completed_at) VALUES (?,'classic','challenge',?,0)")
            .bind(&user_id)
            .bind(category)
            .execute(&state.db)
            .await
            .unwrap();
    }
    let (cache, Json(access)) = hardcore_access(State(state.clone()), headers.clone())
        .await
        .unwrap();
    assert_eq!(cache, [("cache-control", "no-store")]);
    assert!(access.unlocked);
    assert!(
        crate::auth::has_hardcore_access(&state.db, &user_id)
            .await
            .unwrap()
    );
    let (_, Json(existing)) = hardcore_access(State(state), headers).await.unwrap();
    assert!(existing.unlocked);
}

#[tokio::test]
async fn classic_guess_and_trajectory_cover_auth_security_and_disabled_accounts() {
    let state = super::super::test_support::state().await;
    seed_models(&state).await;
    let Json(game_response) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path(("llm".to_owned(), "normal".to_owned())),
    )
    .await
    .unwrap();
    let challenge_id = game_response.challenge.id;
    let answer = sqlx::query_scalar::<_, String>(
        "SELECT answer_model_id FROM daily_challenges WHERE id = ?",
    )
    .bind(challenge_id.to_string())
    .fetch_one(&state.db)
    .await
    .unwrap();
    let player_id = Uuid::new_v4();
    let (_, headers) = authenticated_headers(&state).await;

    assert!(matches!(
        trajectory(
            State(state.clone()),
            headers.clone(),
            Path(challenge_id.to_string()),
            Ok(Json(TrajectoryRequest {
                trajectory_access_token: None,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let mut missing_origin = headers.clone();
    missing_origin.remove(header::ORIGIN);
    assert!(matches!(
        guess(
            State(state.clone()),
            ConnectInfo("127.0.0.3:1234".parse().unwrap()),
            missing_origin,
            Path(challenge_id.to_string()),
            Ok(Json(GuessRequest {
                player_id,
                request_id: Uuid::new_v4(),
                guessed_model_id: answer.clone(),
                attempt_number: 1,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    let mut missing_csrf = headers.clone();
    missing_csrf.remove("x-aaidle-csrf-token");
    assert!(matches!(
        guess(
            State(state.clone()),
            ConnectInfo("127.0.0.3:1234".parse().unwrap()),
            missing_csrf,
            Path(challenge_id.to_string()),
            Ok(Json(GuessRequest {
                player_id,
                request_id: Uuid::new_v4(),
                guessed_model_id: answer,
                attempt_number: 1,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let mut origin = HeaderMap::new();
    origin.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    assert!(matches!(
        trajectory(
            State(state.clone()),
            origin.clone(),
            Path(challenge_id.to_string()),
            Ok(Json(TrajectoryRequest {
                trajectory_access_token: None,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        trajectory(
            State(state.clone()),
            origin,
            Path("bad-id".to_owned()),
            Ok(Json(TrajectoryRequest {
                trajectory_access_token: None,
            })),
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let (disabled_user_id, disabled_headers) = authenticated_headers(&state).await;
    sqlx::query("UPDATE users SET disabled_at = 1 WHERE id = ?")
        .bind(disabled_user_id)
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        guess(
            State(state.clone()),
            ConnectInfo("127.0.0.4:1234".parse().unwrap()),
            disabled_headers.clone(),
            Path(challenge_id.to_string()),
            Ok(Json(GuessRequest {
                player_id,
                request_id: Uuid::new_v4(),
                guessed_model_id: "model-1".to_owned(),
                attempt_number: 1,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        trajectory(
            State(state),
            disabled_headers,
            Path(challenge_id.to_string()),
            Ok(Json(TrajectoryRequest {
                trajectory_access_token: None,
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
}

#[tokio::test]
async fn classic_lookup_and_hardcore_game_cover_empty_error_and_success_paths() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        guess_history(
            State(state.clone()),
            Path("bad-id".to_owned()),
            Query(GuessHistoryQuery {
                player_id: Uuid::new_v4(),
            }),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        guess_history(
            State(state.clone()),
            Path(Uuid::new_v4().to_string()),
            Query(GuessHistoryQuery {
                player_id: Uuid::new_v4(),
            }),
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        challenge_stats(State(state.clone()), Path(Uuid::new_v4().to_string())).await,
        Err(AppError::NotFound(_))
    ));
    let Json(empty_player_stats) =
        player_stats(State(state.clone()), Path(Uuid::new_v4().to_string()))
            .await
            .unwrap();
    assert!(empty_player_stats.stats.is_empty());

    seed_models(&state).await;
    let (user_id, headers) = authenticated_headers(&state).await;
    assert!(matches!(
        hardcore_game(State(state.clone()), headers.clone()).await,
        Err(AppError::Forbidden(_))
    ));
    crate::auth::grant_hardcore_access(&state.db, &user_id, now_millis())
        .await
        .unwrap();
    let Json(hardcore) = hardcore_game(State(state), headers).await.unwrap();
    assert_eq!(hardcore.models.len(), 3);
    assert!(!hardcore.columns.is_empty());
}

#[tokio::test]
async fn classic_game_rejects_an_invalid_stored_challenge_id() {
    let state = super::super::test_support::state().await;
    seed_models(&state).await;
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES ('invalid',?,'classic:llm:challenge','model-1',1,0,'test')")
        .bind(current_utc_date().unwrap())
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        game(
            State(state),
            HeaderMap::new(),
            Path(("llm".to_owned(), "challenge".to_owned())),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn classic_database_errors_propagate_from_each_public_read_path() {
    let state = super::super::test_support::state().await;
    state.db.close().await;
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path(("llm".to_owned(), "normal".to_owned())),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        guess(
            State(state.clone()),
            ConnectInfo("127.0.0.11:1234".parse().unwrap()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(GuessRequest {
                player_id: Uuid::new_v4(),
                request_id: Uuid::new_v4(),
                guessed_model_id: "model-one".to_owned(),
                attempt_number: 1,
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        guess_history(
            State(state.clone()),
            Path(Uuid::new_v4().to_string()),
            Query(GuessHistoryQuery {
                player_id: Uuid::new_v4(),
            }),
        )
        .await,
        Err(AppError::Database(_))
    ));
    let mut origin = HeaderMap::new();
    origin.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:3000"),
    );
    assert!(matches!(
        trajectory(
            State(state.clone()),
            origin,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TrajectoryRequest {
                trajectory_access_token: None,
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        challenge_stats(State(state.clone()), Path(Uuid::new_v4().to_string()),).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        player_stats(State(state), Path(Uuid::new_v4().to_string())).await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn hardcore_handlers_propagate_access_lookup_failures() {
    let access_state = super::super::test_support::state().await;
    let (_, access_headers) = authenticated_headers(&access_state).await;
    sqlx::query("DROP TABLE user_game_progress")
        .execute(&access_state.db)
        .await
        .unwrap();
    assert!(matches!(
        hardcore_access(State(access_state), access_headers).await,
        Err(AppError::Database(_))
    ));

    let game_state = super::super::test_support::state().await;
    let (_, game_headers) = authenticated_headers(&game_state).await;
    sqlx::query("DROP TABLE user_unlocks")
        .execute(&game_state.db)
        .await
        .unwrap();
    assert!(matches!(
        hardcore_game(State(game_state), game_headers).await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn classic_json_rejections_cover_invalid_and_oversized_bodies() {
    let state = super::super::test_support::state().await;
    let challenge_id = Uuid::new_v4();
    let cases = [
        (
            format!("/games/classic/challenges/{challenge_id}/guesses"),
            "{".to_owned(),
            StatusCode::BAD_REQUEST,
            true,
        ),
        (
            format!("/games/classic/challenges/{challenge_id}/trajectory"),
            "{".to_owned(),
            StatusCode::BAD_REQUEST,
            false,
        ),
        (
            format!("/games/classic/challenges/{challenge_id}/guesses"),
            "x".repeat(17 * 1024),
            StatusCode::PAYLOAD_TOO_LARGE,
            true,
        ),
    ];
    for (uri, body, expected, needs_peer) in cases {
        let mut request = Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://localhost:3000")
            .body(Body::from(body))
            .unwrap();
        if needs_peer {
            request
                .extensions_mut()
                .insert(ConnectInfo("127.0.0.9:1234".parse::<SocketAddr>().unwrap()));
        }
        let response = super::super::router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
}
