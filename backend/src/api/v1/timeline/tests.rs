use super::*;

use crate::domain::timeline::TimelineModelSnapshot;
use axum::{
    body::Body,
    http::{HeaderValue, Request, header},
};
use tower::ServiceExt;

async fn authenticated_headers(state: &AppState, disabled: bool) -> (String, HeaderMap) {
    let user_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id,email,email_normalized,email_verified_at,disabled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(&user_id)
        .bind(format!("{user_id}@example.com"))
        .bind(format!("{user_id}@example.com"))
        .bind(1_i64)
        .bind(disabled.then_some(1_i64))
        .bind(0_i64)
        .bind(0_i64)
        .execute(&state.db)
        .await
        .unwrap();
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

async fn insert_challenge(
    state: &AppState,
    date: &str,
    difficulty: TimelineDifficulty,
) -> timeline::TimelineChallenge {
    let mut challenge = challenge();
    challenge.id = Uuid::new_v4();
    challenge.challenge_date = date.to_owned();
    challenge.difficulty = difficulty;
    let config = difficulty.config();
    challenge.model_order = (0..config.total_model_count)
        .map(|index| TimelineModelSnapshot {
            id: format!("model-{index}"),
            name: format!("Model {index}"),
            item_kind: "model".to_owned(),
            release_date: format!("{}-01-01", 2000 + index),
            year_annotation: Some((2000 + index).to_string()),
            categories: vec!["llm".to_owned()],
        })
        .collect();
    challenge.anchor_positions = (0..config.locked_anchor_count).collect();
    challenge.tray_order = challenge
        .model_order
        .iter()
        .enumerate()
        .filter(|(index, _)| !challenge.anchor_positions.contains(index))
        .map(|(_, model)| model.id.clone())
        .collect();
    sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) VALUES (?,?,?,?,?,?,?,0,'test')")
        .bind(challenge.id.to_string())
        .bind(date)
        .bind(difficulty.as_str())
        .bind(serde_json::to_string(&challenge.model_order).unwrap())
        .bind(serde_json::to_string(&challenge.anchor_positions).unwrap())
        .bind(serde_json::to_string(&challenge.tray_order).unwrap())
        .bind(crate::domain::timeline::TIMELINE_SELECTION_VERSION)
        .execute(&state.db)
        .await
        .unwrap();
    challenge
}

fn challenge() -> timeline::TimelineChallenge {
    timeline::TimelineChallenge {
        id: Uuid::new_v4(),
        challenge_date: "2025-01-01".to_owned(),
        difficulty: TimelineDifficulty::Normal,
        model_order: vec![TimelineModelSnapshot {
            id: "model-one".to_owned(),
            name: "Model One".to_owned(),
            item_kind: "model".to_owned(),
            release_date: "2024-01-01".to_owned(),
            year_annotation: Some("2024".to_owned()),
            categories: vec!["llm".to_owned()],
        }],
        anchor_positions: vec![],
        tray_order: vec!["model-one".to_owned()],
    }
}

fn solution(challenge: &timeline::TimelineChallenge) -> Vec<String> {
    challenge
        .model_order
        .iter()
        .map(|model| model.id.clone())
        .collect()
}

#[test]
fn leaderboard_dates_require_real_compact_calendar_dates() {
    assert_eq!(parse_leaderboard_date("20240229").unwrap(), "2024-02-29");
    for invalid in ["2024-01-01", "2024011", "2024abcd", "20230229"] {
        assert!(matches!(
            parse_leaderboard_date(invalid),
            Err(AppError::Validation(_))
        ));
    }
}

#[test]
fn public_movable_models_hide_dates_until_the_puzzle_is_solved() {
    let hidden = public_movable_models(&challenge(), false).unwrap();
    assert_eq!(hidden.len(), 1);
    assert!(hidden[0].release_date.is_none());
    assert!(hidden[0].year_annotation.is_none());

    let revealed = public_movable_models(&challenge(), true).unwrap();
    assert_eq!(revealed[0].release_date.as_deref(), Some("2024-01-01"));
    assert_eq!(revealed[0].year_annotation.as_deref(), Some("2024"));

    let mut invalid = challenge();
    invalid.tray_order = vec!["missing".to_owned()];
    assert!(matches!(
        public_movable_models(&invalid, false),
        Err(AppError::Unavailable(_))
    ));
}

#[test]
fn leaderboard_mappers_preserve_repository_fields() {
    let mapped = map_leaderboard_entry(timeline::TimelineLeaderboardEntry {
        rank: 2,
        display_name: "Player".to_owned(),
        is_current_user: true,
        submissions: 3,
        time_ms: 4_000,
    });
    assert_eq!(mapped.rank, 2);
    assert!(mapped.is_current_user);
    assert_eq!(mapped.submissions, 3);

    let mapped = map_global_leaderboard_entry(timeline::TimelineGlobalLeaderboardEntry {
        rank: 1,
        display_name: "Player".to_owned(),
        is_current_user: false,
        completed_speedruns: 5,
        average_time_ms: 4_000,
        average_submissions: 2.5,
        fastest_time_ms: 3_000,
        recent_runs: vec![timeline::TimelineGlobalRunPoint {
            challenge_date: "2025-01-01".to_owned(),
            submissions: 2,
            time_ms: 3_000,
        }],
    });
    assert_eq!(mapped.completed_speedruns, 5);
    assert_eq!(mapped.recent_runs.len(), 1);
    assert_eq!(mapped.recent_runs[0].date, "2025-01-01");
}

#[tokio::test]
async fn timeline_handlers_validate_paths_and_payloads_before_database_access() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path("unknown".to_owned()),
            Query(TimelineGameQuery {
                player_id: Uuid::new_v4(),
            }),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        start(
            State(state.clone()),
            HeaderMap::new(),
            Path("bad-id".to_owned()),
            Ok(Json(TimelineSpeedrunStartRequest {
                player_id: Uuid::new_v4(),
            })),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        leaderboard(
            State(state.clone()),
            HeaderMap::new(),
            Path("bad-id".to_owned()),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        dated_leaderboard(
            State(state.clone()),
            HeaderMap::new(),
            Path("bad-date".to_owned()),
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let peer = ConnectInfo("127.0.0.1:1234".parse().unwrap());
    let empty = TimelineAttemptRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        model_order: vec![],
    };
    assert!(matches!(
        attempt(
            State(state.clone()),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(empty)),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let invalid = TimelineAttemptRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        model_order: vec!["bad model".to_owned()],
    };
    assert!(matches!(
        attempt(
            State(state.clone()),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(invalid)),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    let oversized = TimelineAttemptRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        model_order: vec!["model-one".to_owned(); 19],
    };
    assert!(matches!(
        attempt(
            State(state),
            peer,
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(oversized)),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn normal_game_attempt_and_leaderboard_handlers_return_seeded_state() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    let challenge = insert_challenge(&state, &today, TimelineDifficulty::Normal).await;
    let player_id = Uuid::new_v4();

    let Json(game_response) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(game_response.challenge.id, challenge.id);
    assert_eq!(game_response.slots.len(), 6);
    assert_eq!(game_response.movable_models.len(), 4);
    assert!(game_response.movable_models[0].release_date.is_none());

    let Json(attempt_response) = attempt(
        State(state.clone()),
        ConnectInfo("127.0.0.1:1234".parse().unwrap()),
        HeaderMap::new(),
        Path(challenge.id.to_string()),
        Ok(Json(TimelineAttemptRequest {
            player_id,
            request_id: Uuid::new_v4(),
            model_order: solution(&challenge),
        })),
    )
    .await
    .unwrap();
    assert_eq!(attempt_response.placements, vec![1; 6]);
    assert_eq!(attempt_response.revealed_models.len(), 6);
    assert_eq!(
        attempt_response.revealed_models[0].release_date.as_deref(),
        Some("2000-01-01")
    );

    let Json(solved) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("normal".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();
    assert!(solved.progress.solved);
    assert_eq!(solved.progress.latest_attempt.unwrap().attempt_number, 1);

    assert!(matches!(
        leaderboard(
            State(state),
            HeaderMap::new(),
            Path(challenge.id.to_string()),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn speedrun_start_and_leaderboards_cover_authenticated_success_paths() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    let challenge = insert_challenge(&state, &today, TimelineDifficulty::Speedrun).await;
    let (user_id, headers) = authenticated_headers(&state, false).await;
    let player_id = Uuid::new_v4();

    let Json(before_start) = game(
        State(state.clone()),
        headers.clone(),
        Path("speedrun".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();
    assert!(before_start.movable_models.is_empty());

    let Json(started) = start(
        State(state.clone()),
        headers.clone(),
        Path(challenge.id.to_string()),
        Ok(Json(TimelineSpeedrunStartRequest { player_id })),
    )
    .await
    .unwrap();
    assert!(started.started_at > 0);
    assert_eq!(started.movable_models.len(), challenge.tray_order.len());

    let Json(attempted) = attempt(
        State(state.clone()),
        ConnectInfo("127.0.0.2:1234".parse().unwrap()),
        headers.clone(),
        Path(challenge.id.to_string()),
        Ok(Json(TimelineAttemptRequest {
            player_id,
            request_id: Uuid::new_v4(),
            model_order: solution(&challenge),
        })),
    )
    .await
    .unwrap();
    assert!(attempted.speedrun_time_ms.is_some());

    let Json(by_id) = leaderboard(
        State(state.clone()),
        headers.clone(),
        Path(challenge.id.to_string()),
    )
    .await
    .unwrap();
    assert_eq!(by_id.entries.len(), 1);
    assert!(by_id.entries[0].is_current_user);

    let Json(current) = current_leaderboard(State(state.clone()), headers.clone())
        .await
        .unwrap();
    assert_eq!(current.entries.len(), 1);
    let compact_today = today.replace('-', "");
    let Json(dated) = dated_leaderboard(State(state.clone()), headers.clone(), Path(compact_today))
        .await
        .unwrap();
    assert_eq!(dated.entries.len(), 1);
    let Json(global) = global_leaderboard(State(state), headers).await.unwrap();
    assert_eq!(global.fastest.len(), 1);
    assert_eq!(
        global.fastest[0].display_name,
        user_id.split('@').next().unwrap_or(&user_id)
    );
}

#[tokio::test]
async fn speedrun_give_up_marks_progress_unfinished() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    let challenge = insert_challenge(&state, &today, TimelineDifficulty::Speedrun).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    let player_id = Uuid::new_v4();
    let Json(_) = start(
        State(state.clone()),
        headers.clone(),
        Path(challenge.id.to_string()),
        Ok(Json(TimelineSpeedrunStartRequest { player_id })),
    )
    .await
    .unwrap();

    let Json(response) = give_up(
        State(state.clone()),
        headers.clone(),
        Path(challenge.id.to_string()),
        Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
    )
    .await
    .unwrap();
    let Json(game) = game(
        State(state),
        headers,
        Path("speedrun".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();

    assert_eq!(
        game.progress.speedrun_given_up_at,
        Some(response.given_up_at)
    );
    assert!(!game.progress.solved);
}

#[tokio::test]
async fn speedrun_give_up_validates_path_auth_origin_and_challenge_mode() {
    let state = super::super::test_support::state().await;
    let player_id = Uuid::new_v4();
    assert!(matches!(
        give_up(
            State(state.clone()),
            HeaderMap::new(),
            Path("bad-id".to_owned()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        give_up(
            State(state.clone()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    let (_, headers) = authenticated_headers(&state, false).await;
    let mut missing_origin = headers.clone();
    missing_origin.remove(header::ORIGIN);
    assert!(matches!(
        give_up(
            State(state.clone()),
            missing_origin,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    let normal = insert_challenge(
        &state,
        &current_utc_date().unwrap(),
        TimelineDifficulty::Normal,
    )
    .await;
    assert!(matches!(
        give_up(
            State(state),
            headers,
            Path(normal.id.to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn timeline_auth_and_empty_past_leaderboard_branches_are_enforced() {
    let state = super::super::test_support::state().await;
    let player_id = Uuid::new_v4();
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path("speedrun".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path("hardcore".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    assert!(matches!(
        start(
            State(state.clone()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
    let (user_id, locked_headers) = authenticated_headers(&state, false).await;
    assert!(matches!(
        game(
            State(state.clone()),
            locked_headers.clone(),
            Path("hardcore".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    insert_challenge(
        &state,
        &current_utc_date().unwrap(),
        TimelineDifficulty::Hardcore,
    )
    .await;
    crate::auth::grant_hardcore_access(&state.db, &user_id, now_millis())
        .await
        .unwrap();
    let Json(hardcore) = game(
        State(state.clone()),
        locked_headers,
        Path("hardcore".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(hardcore.challenge.difficulty, "hardcore");
    let (_, disabled_headers) = authenticated_headers(&state, true).await;
    assert!(matches!(
        game(
            State(state.clone()),
            disabled_headers.clone(),
            Path("normal".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        attempt(
            State(state.clone()),
            ConnectInfo("127.0.0.3:1234".parse().unwrap()),
            disabled_headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineAttemptRequest {
                player_id,
                request_id: Uuid::new_v4(),
                model_order: vec!["model-one".to_owned()],
            })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    let Json(past) = dated_leaderboard(State(state), HeaderMap::new(), Path("20200101".to_owned()))
        .await
        .unwrap();
    assert_eq!(past.challenge_date, "2020-01-01");
    assert!(past.entries.is_empty());
}

#[tokio::test]
async fn challenge_and_started_speedrun_games_expose_anchors_and_progress() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    let challenge = insert_challenge(&state, &today, TimelineDifficulty::Challenge).await;
    let Json(challenge_game) = game(
        State(state.clone()),
        HeaderMap::new(),
        Path("challenge".to_owned()),
        Query(TimelineGameQuery {
            player_id: Uuid::new_v4(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(challenge_game.challenge.id, challenge.id);
    assert_eq!(
        challenge_game
            .slots
            .iter()
            .filter(|slot| slot.anchor.is_some())
            .count(),
        4
    );
    assert_eq!(challenge_game.movable_models.len(), 8);

    let speedrun = insert_challenge(&state, &today, TimelineDifficulty::Speedrun).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    let player_id = Uuid::new_v4();
    let Json(_) = start(
        State(state.clone()),
        headers.clone(),
        Path(speedrun.id.to_string()),
        Ok(Json(TimelineSpeedrunStartRequest { player_id })),
    )
    .await
    .unwrap();
    let Json(started_game) = game(
        State(state),
        headers,
        Path("speedrun".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();
    assert!(started_game.progress.speedrun_started_at.is_some());
    assert!(!started_game.progress.solved);
    assert_eq!(started_game.movable_models.len(), 14);
}

#[tokio::test]
async fn timeline_mutations_cover_origin_csrf_disabled_and_repository_errors() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    let normal = insert_challenge(&state, &today, TimelineDifficulty::Normal).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    let player_id = Uuid::new_v4();

    let mut missing_origin = headers.clone();
    missing_origin.remove(header::ORIGIN);
    assert!(matches!(
        start(
            State(state.clone()),
            missing_origin,
            Path(normal.id.to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    let mut missing_csrf = headers.clone();
    missing_csrf.remove("x-aaidle-csrf-token");
    assert!(matches!(
        start(
            State(state.clone()),
            missing_csrf,
            Path(normal.id.to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        start(
            State(state.clone()),
            headers.clone(),
            Path(normal.id.to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        attempt(
            State(state.clone()),
            ConnectInfo("127.0.0.4:1234".parse().unwrap()),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineAttemptRequest {
                player_id,
                request_id: Uuid::new_v4(),
                model_order: solution(&normal),
            })),
        )
        .await,
        Err(AppError::NotFound(_))
    ));

    let (_, disabled) = authenticated_headers(&state, true).await;
    assert!(matches!(
        start(
            State(state),
            disabled,
            Path(normal.id.to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn hardcore_attempt_updates_attempt_limit_and_latest_unsolved_state() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    let challenge = insert_challenge(&state, &today, TimelineDifficulty::Hardcore).await;
    let (user_id, headers) = authenticated_headers(&state, false).await;
    crate::auth::grant_hardcore_access(&state.db, &user_id, now_millis())
        .await
        .unwrap();
    let player_id = Uuid::new_v4();
    let mut wrong = solution(&challenge);
    wrong.swap(6, 7);
    let Json(result) = attempt(
        State(state.clone()),
        ConnectInfo("127.0.0.5:1234".parse().unwrap()),
        headers.clone(),
        Path(challenge.id.to_string()),
        Ok(Json(TimelineAttemptRequest {
            player_id,
            request_id: Uuid::new_v4(),
            model_order: wrong.clone(),
        })),
    )
    .await
    .unwrap();
    assert_eq!(result.attempts_remaining, Some(7));
    assert_eq!(result.revealed_models.len(), 16);

    let Json(game_response) = game(
        State(state),
        headers,
        Path("hardcore".to_owned()),
        Query(TimelineGameQuery { player_id }),
    )
    .await
    .unwrap();
    assert_eq!(game_response.progress.attempt_limit, Some(8));
    assert_eq!(game_response.progress.attempts_remaining, Some(7));
    let latest = game_response.progress.latest_attempt.unwrap();
    assert_eq!(latest.model_order, wrong);
    assert_eq!(latest.attempt_number, 1);
}

#[tokio::test]
async fn leaderboard_handlers_cover_missing_invalid_and_anonymous_results() {
    let state = super::super::test_support::state().await;
    assert!(matches!(
        leaderboard(
            State(state.clone()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    let speedrun = insert_challenge(&state, "2020-02-03", TimelineDifficulty::Speedrun).await;
    let Json(empty) = leaderboard(
        State(state.clone()),
        HeaderMap::new(),
        Path(speedrun.id.to_string()),
    )
    .await
    .unwrap();
    assert_eq!(empty.challenge_date, "2020-02-03");
    assert!(empty.entries.is_empty());
    let Json(dated) = dated_leaderboard(
        State(state.clone()),
        HeaderMap::new(),
        Path("20200203".to_owned()),
    )
    .await
    .unwrap();
    assert!(dated.entries.is_empty());
    let Json(global) = global_leaderboard(State(state.clone()), HeaderMap::new())
        .await
        .unwrap();
    assert!(global.fastest.is_empty());

    sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) VALUES ('invalid','2020-02-04','speedrun','[]','[]','[]',?,0,'test')")
        .bind(crate::domain::timeline::TIMELINE_SELECTION_VERSION)
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        dated_leaderboard(State(state), HeaderMap::new(), Path("20200204".to_owned()),).await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn timeline_database_errors_propagate_across_handler_queries() {
    let state = super::super::test_support::state().await;
    state.db.close().await;
    let player_id = Uuid::new_v4();
    assert!(matches!(
        game(
            State(state.clone()),
            HeaderMap::new(),
            Path("normal".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        leaderboard(
            State(state.clone()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        current_leaderboard(State(state.clone()), HeaderMap::new()).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        dated_leaderboard(
            State(state.clone()),
            HeaderMap::new(),
            Path("20200101".to_owned()),
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        global_leaderboard(State(state.clone()), HeaderMap::new()).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        attempt(
            State(state),
            ConnectInfo("127.0.0.10:1234".parse().unwrap()),
            HeaderMap::new(),
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineAttemptRequest {
                player_id,
                request_id: Uuid::new_v4(),
                model_order: vec!["model-one".to_owned()],
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn malformed_timeline_json_reaches_start_and_attempt_rejections() {
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    for (uri, needs_peer) in [
        (
            format!("/games/timeline/challenges/{}/start", Uuid::new_v4()),
            false,
        ),
        (
            format!("/games/timeline/challenges/{}/attempts", Uuid::new_v4()),
            true,
        ),
        (
            format!("/games/timeline/challenges/{}/give-up", Uuid::new_v4()),
            false,
        ),
    ] {
        let mut request = Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ORIGIN, "http://localhost:3000")
            .header(header::COOKIE, headers[header::COOKIE].clone())
            .header("x-aaidle-csrf-token", "csrf")
            .body(Body::from("{"))
            .unwrap();
        if needs_peer {
            request
                .extensions_mut()
                .insert(ConnectInfo("127.0.0.8:1234".parse::<SocketAddr>().unwrap()));
        }
        let response = super::super::router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
    }
}

#[tokio::test]
async fn timeline_game_propagates_auth_access_player_and_projection_errors() {
    let player_id = Uuid::new_v4();
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        game(
            State(state),
            headers,
            Path("normal".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_unlocks")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        game(
            State(state),
            headers,
            Path("hardcore".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_progress_profiles")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        game(
            State(state),
            headers,
            Path("normal".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    insert_challenge(&state, &today, TimelineDifficulty::Normal).await;
    sqlx::query("UPDATE timeline_challenges SET tray_order_json = '[\"missing\"]'")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        game(
            State(state),
            HeaderMap::new(),
            Path("normal".to_owned()),
            Query(TimelineGameQuery { player_id }),
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn timeline_start_propagates_auth_player_repository_and_projection_errors() {
    let player_id = Uuid::new_v4();
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        start(
            State(state),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_progress_profiles")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        start(
            State(state),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let challenge = insert_challenge(
        &state,
        &current_utc_date().unwrap(),
        TimelineDifficulty::Speedrun,
    )
    .await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE timeline_speedrun_starts")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        start(
            State(state),
            headers,
            Path(challenge.id.to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let challenge = insert_challenge(
        &state,
        &current_utc_date().unwrap(),
        TimelineDifficulty::Speedrun,
    )
    .await;
    sqlx::query("UPDATE timeline_challenges SET tray_order_json = '[\"missing\"]' WHERE id = ?")
        .bind(challenge.id.to_string())
        .execute(&state.db)
        .await
        .unwrap();
    let (_, headers) = authenticated_headers(&state, false).await;
    assert!(matches!(
        start(
            State(state),
            headers,
            Path(challenge.id.to_string()),
            Ok(Json(TimelineSpeedrunStartRequest { player_id })),
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn timeline_give_up_propagates_auth_csrf_player_and_repository_errors() {
    let player_id = Uuid::new_v4();
    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        give_up(
            State(state),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, mut headers) = authenticated_headers(&state, false).await;
    headers.remove("x-aaidle-csrf-token");
    assert!(matches!(
        give_up(
            State(state),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_progress_profiles")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        give_up(
            State(state),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let challenge = insert_challenge(
        &state,
        &current_utc_date().unwrap(),
        TimelineDifficulty::Speedrun,
    )
    .await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE timeline_speedrun_starts")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        give_up(
            State(state),
            headers,
            Path(challenge.id.to_string()),
            Ok(Json(TimelineSpeedrunGiveUpRequest { player_id })),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn timeline_leaderboards_propagate_authentication_and_repository_errors() {
    let state = super::super::test_support::state().await;
    let challenge = insert_challenge(&state, "2020-03-04", TimelineDifficulty::Speedrun).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        leaderboard(State(state), headers, Path(challenge.id.to_string())).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let challenge = insert_challenge(&state, "2020-03-04", TimelineDifficulty::Speedrun).await;
    sqlx::query("DROP TABLE timeline_attempts")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        leaderboard(
            State(state),
            HeaderMap::new(),
            Path(challenge.id.to_string()),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    insert_challenge(&state, "2020-03-04", TimelineDifficulty::Speedrun).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        dated_leaderboard(State(state), headers, Path("20200304".to_owned())).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    insert_challenge(&state, "2020-03-04", TimelineDifficulty::Speedrun).await;
    sqlx::query("DROP TABLE timeline_attempts")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        dated_leaderboard(State(state), HeaderMap::new(), Path("20200304".to_owned()),).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        global_leaderboard(State(state), headers).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    sqlx::query("DROP TABLE timeline_attempts")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        global_leaderboard(State(state), HeaderMap::new()).await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn current_and_dated_leaderboards_propagate_stage_specific_failures() {
    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    insert_challenge(&state, &today, TimelineDifficulty::Speedrun).await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        current_leaderboard(State(state), headers).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let today = current_utc_date().unwrap();
    insert_challenge(&state, &today, TimelineDifficulty::Speedrun).await;
    sqlx::query("DROP TABLE timeline_attempts")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        current_leaderboard(State(state), HeaderMap::new()).await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    sqlx::query("DROP TABLE timeline_challenges")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        dated_leaderboard(
            State(state),
            HeaderMap::new(),
            Path(current_utc_date().unwrap().replace('-', "")),
        )
        .await,
        Err(AppError::Database(_))
    ));
}

#[tokio::test]
async fn timeline_attempt_validates_path_and_propagates_auth_security_and_access_errors() {
    let request = || TimelineAttemptRequest {
        player_id: Uuid::new_v4(),
        request_id: Uuid::new_v4(),
        model_order: vec!["model-one".to_owned()],
    };
    let state = super::super::test_support::state().await;
    assert!(matches!(
        attempt(
            State(state),
            ConnectInfo("127.0.0.20:1234".parse().unwrap()),
            HeaderMap::new(),
            Path("bad-id".to_owned()),
            Ok(Json(request())),
        )
        .await,
        Err(AppError::Validation(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_sessions")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        attempt(
            State(state),
            ConnectInfo("127.0.0.21:1234".parse().unwrap()),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request())),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    let mut missing_origin = headers.clone();
    missing_origin.remove(header::ORIGIN);
    assert!(matches!(
        attempt(
            State(state.clone()),
            ConnectInfo("127.0.0.22:1234".parse().unwrap()),
            missing_origin,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request())),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    let mut missing_csrf = headers;
    missing_csrf.remove("x-aaidle-csrf-token");
    assert!(matches!(
        attempt(
            State(state),
            ConnectInfo("127.0.0.23:1234".parse().unwrap()),
            missing_csrf,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request())),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let state = super::super::test_support::state().await;
    let (_, headers) = authenticated_headers(&state, false).await;
    sqlx::query("DROP TABLE user_progress_profiles")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        attempt(
            State(state),
            ConnectInfo("127.0.0.24:1234".parse().unwrap()),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(request())),
        )
        .await,
        Err(AppError::Database(_))
    ));

    let state = super::super::test_support::state().await;
    let (user_id, headers) = authenticated_headers(&state, false).await;
    let player_id = Uuid::new_v4();
    progress::canonical_player_id(&state.db, &user_id, player_id, now_millis())
        .await
        .unwrap();
    sqlx::query("DROP TABLE user_unlocks")
        .execute(&state.db)
        .await
        .unwrap();
    assert!(matches!(
        attempt(
            State(state),
            ConnectInfo("127.0.0.25:1234".parse().unwrap()),
            headers,
            Path(Uuid::new_v4().to_string()),
            Ok(Json(TimelineAttemptRequest {
                player_id,
                request_id: Uuid::new_v4(),
                model_order: vec!["model-one".to_owned()],
            })),
        )
        .await,
        Err(AppError::Database(_))
    ));
}
