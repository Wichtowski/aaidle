use super::*;

fn placement_challenge(difficulty: TimelineDifficulty) -> TimelineChallenge {
    TimelineChallenge {
        id: Uuid::new_v4(),
        challenge_date: "2026-08-25".to_owned(),
        difficulty,
        model_order: vec![
            TimelineModelSnapshot {
                id: "first".to_owned(),
                name: "First".to_owned(),
                item_kind: "model".to_owned(),
                release_date: "2020-01-01".to_owned(),
                year_annotation: None,
                categories: vec!["language-model".to_owned()],
            },
            TimelineModelSnapshot {
                id: "second".to_owned(),
                name: "Second".to_owned(),
                item_kind: "model".to_owned(),
                release_date: "2020-06-01".to_owned(),
                year_annotation: None,
                categories: vec!["language-model".to_owned()],
            },
            TimelineModelSnapshot {
                id: "third".to_owned(),
                name: "Third".to_owned(),
                item_kind: "model".to_owned(),
                release_date: "2021-01-01".to_owned(),
                year_annotation: None,
                categories: vec!["language-model".to_owned()],
            },
        ],
        anchor_positions: vec![],
        tray_order: vec!["first".to_owned(), "second".to_owned(), "third".to_owned()],
    }
}

#[test]
fn hardcore_marks_same_year_positions_without_marking_normal() {
    let submitted = ["second".to_owned(), "first".to_owned(), "third".to_owned()];
    assert_eq!(
        timeline_placements(
            &placement_challenge(TimelineDifficulty::Hardcore),
            &submitted
        ),
        [2, 2, 1]
    );
    assert_eq!(
        timeline_placements(&placement_challenge(TimelineDifficulty::Normal), &submitted),
        [0, 0, 1]
    );
    assert_eq!(
        timeline_placements(
            &placement_challenge(TimelineDifficulty::Speedrun),
            &submitted
        ),
        [2, 2, 1]
    );
    assert_eq!(release_year("2024-01-01"), Some("2024"));
    assert_eq!(release_year("bad"), None);
}

async fn test_pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect test database");
    crate::db::migrate(&pool)
        .await
        .expect("migrate test database");
    pool
}

async fn insert_challenge(pool: &SqlitePool, difficulty: TimelineDifficulty) -> TimelineChallenge {
    let mut challenge = placement_challenge(difficulty);
    challenge.anchor_positions = if difficulty == TimelineDifficulty::Challenge {
        vec![0]
    } else {
        vec![]
    };
    sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) VALUES (?,?,?,?,?,?,?,?, 'test')")
        .bind(challenge.id.to_string())
        .bind(&challenge.challenge_date)
        .bind(difficulty.as_str())
        .bind(serde_json::to_string(&challenge.model_order).unwrap())
        .bind(serde_json::to_string(&challenge.anchor_positions).unwrap())
        .bind(serde_json::to_string(&challenge.tray_order).unwrap())
        .bind(TIMELINE_SELECTION_VERSION)
        .bind(0_i64)
        .execute(pool).await.expect("challenge");
    challenge
}

#[test]
fn validates_orders_and_parses_stored_challenges() {
    let challenge = placement_challenge(TimelineDifficulty::Normal);
    assert!(validate_model_order(&challenge, &challenge.tray_order).is_ok());
    assert!(
        validate_model_order(
            &challenge,
            &["first".into(), "first".into(), "third".into()]
        )
        .is_err()
    );
    let mut anchored = challenge.clone();
    anchored.anchor_positions = vec![0];
    assert!(
        validate_model_order(
            &anchored,
            &["second".into(), "first".into(), "third".into()]
        )
        .is_err()
    );
    let row = TimelineChallengeRow {
        id: challenge.id.to_string(),
        challenge_date: challenge.challenge_date.clone(),
        difficulty: "normal".into(),
        model_order_json: serde_json::to_string(&challenge.model_order).unwrap(),
        anchor_positions_json: "[]".into(),
        tray_order_json: serde_json::to_string(&challenge.tray_order).unwrap(),
    };
    assert_eq!(parse_challenge(row).unwrap(), challenge);
    let invalid = TimelineChallengeRow {
        id: "bad".into(),
        challenge_date: String::new(),
        difficulty: "bad".into(),
        model_order_json: "[]".into(),
        anchor_positions_json: "[]".into(),
        tray_order_json: "[]".into(),
    };
    assert!(parse_challenge(invalid).is_err());
    assert!(map_global_ranking(Vec::new(), &BTreeMap::new()).is_empty());
}

#[tokio::test]
async fn attempts_replay_game_state_and_completion_errors() {
    let pool = test_pool().await;
    let challenge = insert_challenge(&pool, TimelineDifficulty::Normal).await;
    let player_id = Uuid::new_v4();
    let wrong_order = vec!["second".into(), "first".into(), "third".into()];
    let request_id = Uuid::new_v4();
    let wrong = process_timeline_attempt(
        &pool,
        TimelineAttemptInput {
            challenge_id: challenge.id,
            player_id,
            user_id: None,
            hardcore_access: false,
            request_id,
            model_order: wrong_order.clone(),
        },
    )
    .await
    .unwrap();
    assert_eq!(wrong.placements, [0, 0, 1]);
    let replay = process_timeline_attempt(
        &pool,
        TimelineAttemptInput {
            challenge_id: challenge.id,
            player_id,
            user_id: None,
            hardcore_access: false,
            request_id,
            model_order: wrong_order,
        },
    )
    .await
    .unwrap();
    assert_eq!(replay.placements, wrong.placements);
    assert!(matches!(
        process_timeline_attempt(
            &pool,
            TimelineAttemptInput {
                challenge_id: challenge.id,
                player_id,
                user_id: None,
                hardcore_access: false,
                request_id,
                model_order: challenge.tray_order.clone()
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    let solved = process_timeline_attempt(
        &pool,
        TimelineAttemptInput {
            challenge_id: challenge.id,
            player_id,
            user_id: None,
            hardcore_access: false,
            request_id: Uuid::new_v4(),
            model_order: challenge.tray_order.clone(),
        },
    )
    .await
    .unwrap();
    assert_eq!(solved.placements, [1, 1, 1]);
    assert!(matches!(
        process_timeline_attempt(
            &pool,
            TimelineAttemptInput {
                challenge_id: challenge.id,
                player_id,
                user_id: None,
                hardcore_access: false,
                request_id: Uuid::new_v4(),
                model_order: challenge.tray_order
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    assert!(
        timeline_leaderboard(&pool, challenge.id, None)
            .await
            .is_err()
    );
    assert!(
        start_speedrun(&pool, challenge.id, player_id)
            .await
            .is_err()
    );
    assert!(
        process_timeline_attempt(
            &pool,
            TimelineAttemptInput {
                challenge_id: Uuid::new_v4(),
                player_id,
                user_id: None,
                hardcore_access: false,
                request_id: Uuid::new_v4(),
                model_order: vec![]
            }
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn given_up_speedrun_is_persisted_and_cannot_accept_attempts() {
    let pool = test_pool().await;
    let speedrun = insert_challenge(&pool, TimelineDifficulty::Speedrun).await;
    let player = Uuid::new_v4();
    start_speedrun(&pool, speedrun.id, player).await.unwrap();

    let given_up_at = give_up_speedrun(&pool, speedrun.id, player).await.unwrap();
    assert_eq!(
        give_up_speedrun(&pool, speedrun.id, player).await.unwrap(),
        given_up_at
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT given_up_at FROM timeline_speedrun_starts WHERE challenge_id = ? AND player_id = ?",
        )
        .bind(speedrun.id.to_string())
        .bind(player.to_string())
        .fetch_one(&pool)
        .await
        .unwrap(),
        given_up_at
    );
    assert!(matches!(
        process_timeline_attempt(
            &pool,
            TimelineAttemptInput {
                challenge_id: speedrun.id,
                player_id: player,
                user_id: None,
                hardcore_access: false,
                request_id: Uuid::new_v4(),
                model_order: speedrun.tray_order
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
}

#[tokio::test]
async fn hardcore_and_speedrun_paths() {
    let pool = test_pool().await;
    let hardcore = insert_challenge(&pool, TimelineDifficulty::Hardcore).await;
    let player = Uuid::new_v4();
    assert!(matches!(
        process_timeline_attempt(
            &pool,
            TimelineAttemptInput {
                challenge_id: hardcore.id,
                player_id: player,
                user_id: None,
                hardcore_access: false,
                request_id: Uuid::new_v4(),
                model_order: hardcore.tray_order.clone()
            }
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    let speedrun = insert_challenge(&pool, TimelineDifficulty::Speedrun).await;
    let (started, parsed) = start_speedrun(&pool, speedrun.id, player).await.unwrap();
    assert_eq!(parsed.id, speedrun.id);
    assert_eq!(
        start_speedrun(&pool, speedrun.id, player).await.unwrap().0,
        started
    );
    let result = process_timeline_attempt(
        &pool,
        TimelineAttemptInput {
            challenge_id: speedrun.id,
            player_id: player,
            user_id: None,
            hardcore_access: false,
            request_id: Uuid::new_v4(),
            model_order: speedrun.tray_order.clone(),
        },
    )
    .await
    .unwrap();
    assert!(result.speedrun_time_ms.is_some());
    assert!(
        timeline_leaderboard(&pool, speedrun.id, None)
            .await
            .unwrap()
            .is_empty()
    );
    let global = timeline_global_leaderboard(&pool, None).await.unwrap();
    assert!(global.fastest.is_empty());
    assert!(
        timeline_recent_speedruns(&pool, &BTreeSet::new())
            .await
            .unwrap()
            .is_empty()
    );
}

async fn seed_timeline_candidates(pool: &SqlitePool) {
    for index in 0..20 {
        sqlx::query("INSERT INTO timeline_items (id,item_kind,name,provider_key,categories_json,min_pool_rank,release_date,source_url,is_active,updated_at) VALUES (?,'event',?,?,'[\"language-model\"]',0,?,'https://example.test',1,0)")
            .bind(format!("event-{index}"))
            .bind(format!("Event {index}"))
            .bind(format!("provider-{index}"))
            .bind(format!("{}-01-01", 1980 + index))
            .execute(pool)
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn generates_reuses_and_replaces_timeline_challenges() {
    let pool = test_pool().await;
    seed_timeline_candidates(&pool).await;
    let player = Uuid::new_v4();
    let normal = timeline_game(
        &pool,
        "2026-09-01",
        TimelineDifficulty::Normal,
        "secret",
        player,
    )
    .await
    .unwrap();
    assert_eq!(normal.challenge.model_order.len(), 6);
    assert_eq!(normal.challenge.anchor_positions.len(), 2);
    assert!(normal.latest_attempt.is_none());
    assert!(normal.attempt_limit.is_none());
    assert_eq!(
        ensure_timeline_challenge(&pool, "2026-09-01", TimelineDifficulty::Normal, "other")
            .await
            .unwrap()
            .id,
        normal.challenge.id
    );

    let stale = insert_challenge(&pool, TimelineDifficulty::Challenge).await;
    let replacement = ensure_timeline_challenge(
        &pool,
        &stale.challenge_date,
        TimelineDifficulty::Challenge,
        "secret",
    )
    .await
    .unwrap();
    assert_ne!(replacement.id, stale.id);
    assert_eq!(replacement.model_order.len(), 12);
    assert_eq!(replacement.anchor_positions.len(), 4);

    let speedrun = timeline_game(
        &pool,
        "2026-09-02",
        TimelineDifficulty::Speedrun,
        "secret",
        player,
    )
    .await
    .unwrap();
    assert!(speedrun.speedrun_started_at.is_none());
    start_speedrun(&pool, speedrun.challenge.id, player)
        .await
        .unwrap();
    let started = timeline_game(
        &pool,
        "2026-09-02",
        TimelineDifficulty::Speedrun,
        "secret",
        player,
    )
    .await
    .unwrap();
    assert!(started.speedrun_started_at.is_some());
    assert!(started.speedrun_given_up_at.is_none());
    give_up_speedrun(&pool, speedrun.challenge.id, player)
        .await
        .unwrap();
    assert!(
        timeline_game(
            &pool,
            "2026-09-02",
            TimelineDifficulty::Speedrun,
            "secret",
            player,
        )
        .await
        .unwrap()
        .speedrun_given_up_at
        .is_some()
    );
}

#[tokio::test]
async fn populated_daily_and_global_leaderboards_map_users_and_runs() {
    let pool = test_pool().await;
    let challenge = insert_challenge(&pool, TimelineDifficulty::Speedrun).await;
    for (index, username, disabled) in [
        (1, Some("runner"), false),
        (2, None, false),
        (3, Some("hidden"), true),
    ] {
        let user = format!("user-{index}");
        let email = format!("email-{index}@example.test");
        let player = Uuid::new_v4();
        sqlx::query("INSERT INTO users (id,email,email_normalized,username,disabled_at,created_at,updated_at) VALUES (?,?,?,?,?,0,0)")
            .bind(&user).bind(&email).bind(&email).bind(username).bind(disabled.then_some(1_i64))
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES (?,0,0)")
            .bind(player.to_string())
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,user_id,model_order_json,placements_json,attempt_number,is_correct,attempts_remaining_after,speedrun_started_at,speedrun_time_ms,created_at) VALUES (?,?,?,?,?,'[]','[]',?,1,NULL,0,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
            .bind(challenge.id.to_string()).bind(player.to_string()).bind(&user)
            .bind(index).bind(1_000_i64 * index).bind(index)
            .execute(&pool).await.unwrap();
    }
    let daily = timeline_leaderboard(&pool, challenge.id, Some("user-2"))
        .await
        .unwrap();
    assert_eq!(daily.len(), 2);
    assert_eq!(daily[0].display_name, "runner");
    assert_eq!(daily[1].display_name, "email-2");
    assert!(daily[1].is_current_user);

    let global = timeline_global_leaderboard(&pool, Some("user-1"))
        .await
        .unwrap();
    assert_eq!(global.fastest.len(), 2);
    assert!(global.fastest.iter().any(|entry| entry.is_current_user));
    assert!(
        global
            .fastest
            .iter()
            .all(|entry| entry.recent_runs.len() == 1)
    );
    assert_eq!(
        global.fastest[0].recent_runs[0].challenge_date,
        challenge.challenge_date
    );
}

#[tokio::test]
async fn malformed_timeline_storage_and_give_up_errors_are_reported() {
    let pool = test_pool().await;
    assert!(matches!(
        give_up_speedrun(&pool, Uuid::new_v4(), Uuid::new_v4()).await,
        Err(AppError::NotFound(_))
    ));
    let normal = insert_challenge(&pool, TimelineDifficulty::Normal).await;
    assert!(matches!(
        give_up_speedrun(&pool, normal.id, Uuid::new_v4()).await,
        Err(AppError::Validation(_))
    ));
    let speedrun = insert_challenge(&pool, TimelineDifficulty::Speedrun).await;
    assert!(matches!(
        give_up_speedrun(&pool, speedrun.id, Uuid::new_v4()).await,
        Err(AppError::Conflict(_))
    ));

    let player = Uuid::new_v4();
    sqlx::query("INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES (?,0,0)")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?, 'not-json','[]',70000,0,0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(normal.id.to_string()).bind(player.to_string()).execute(&pool).await.unwrap();
    assert!(
        timeline_game(
            &pool,
            &normal.challenge_date,
            TimelineDifficulty::Normal,
            "secret",
            player
        )
        .await
        .is_err()
    );

    sqlx::query("DROP VIEW timeline_speedrun_public_stats")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("CREATE VIEW timeline_speedrun_public_stats AS SELECT 'user' AS user_id, 'User' AS display_name, -1 AS completed_speedruns, 1 AS average_time_ms, 1.0 AS average_submissions, 1 AS fastest_time_ms")
        .execute(&pool).await.unwrap();
    assert!(timeline_global_leaderboard(&pool, None).await.is_err());
}

#[test]
fn replay_and_parse_reject_malformed_stored_values() {
    let challenge = placement_challenge(TimelineDifficulty::Normal);
    let input = TimelineAttemptInput {
        challenge_id: challenge.id,
        player_id: Uuid::new_v4(),
        user_id: None,
        hardcore_access: false,
        request_id: Uuid::new_v4(),
        model_order: challenge.tray_order.clone(),
    };
    let row = |order: &str, placements: &str, remaining| TimelineAttemptRow {
        challenge_id: challenge.id.to_string(),
        player_id: input.player_id.to_string(),
        model_order_json: order.into(),
        placements_json: placements.into(),
        attempt_number: 1,
        is_correct: 0,
        attempts_remaining_after: remaining,
        speedrun_time_ms: None,
    };
    assert!(replay_attempt(row("not-json", "[]", None), &input, &challenge).is_err());
    assert!(matches!(
        replay_attempt(row("[]", "[]", None), &input, &challenge),
        Err(AppError::Conflict(_))
    ));
    assert!(
        replay_attempt(
            row(
                &serde_json::to_string(&input.model_order).unwrap(),
                "not-json",
                None
            ),
            &input,
            &challenge
        )
        .is_err()
    );
    assert!(matches!(
        replay_attempt(
            row(
                &serde_json::to_string(&input.model_order).unwrap(),
                "[]",
                Some(-1)
            ),
            &input,
            &challenge
        ),
        Err(AppError::Unavailable(_))
    ));
    let invalid_difficulty = TimelineChallengeRow {
        id: Uuid::new_v4().to_string(),
        challenge_date: "2026-01-01".into(),
        difficulty: "invalid".into(),
        model_order_json: "[]".into(),
        anchor_positions_json: "[]".into(),
        tray_order_json: "[]".into(),
    };
    assert!(matches!(
        parse_challenge(invalid_difficulty),
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn malformed_attempt_counts_and_candidate_ranks_are_reported() {
    let pool = test_pool().await;
    seed_timeline_candidates(&pool).await;
    let challenge =
        ensure_timeline_challenge(&pool, "2026-10-01", TimelineDifficulty::Normal, "secret")
            .await
            .unwrap();
    let player = Uuid::new_v4();
    sqlx::query("INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES (?,0,0)")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?, '[]','[]',70000,0,0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(challenge.id.to_string()).bind(player.to_string()).execute(&pool).await.unwrap();
    assert!(matches!(
        timeline_game(
            &pool,
            "2026-10-01",
            TimelineDifficulty::Normal,
            "secret",
            player
        )
        .await,
        Err(AppError::Unavailable(_))
    ));

    sqlx::query("PRAGMA ignore_check_constraints = ON")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO timeline_items (id,item_kind,name,provider_key,categories_json,min_pool_rank,release_date,source_url,is_active,updated_at) VALUES ('invalid-rank','event','Invalid','provider','[]',-1,'2020-01-01','https://example.test',1,0)")
        .execute(&pool).await.unwrap();
    assert!(matches!(
        timeline_candidates(&pool).await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn leaderboard_and_give_up_reject_invalid_persisted_submissions() {
    let pool = test_pool().await;
    let speedrun = insert_challenge(&pool, TimelineDifficulty::Speedrun).await;
    let player = Uuid::new_v4();
    let user = "runner";
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('runner','runner@example.test','runner@example.test',0,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES (?,0,0)")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,user_id,model_order_json,placements_json,attempt_number,is_correct,speedrun_time_ms,created_at) VALUES (?,?,?,?,?,'[]','[]',70000,1,100,0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(speedrun.id.to_string()).bind(player.to_string()).bind(user).execute(&pool).await.unwrap();
    assert!(matches!(
        timeline_leaderboard(&pool, speedrun.id, None).await,
        Err(AppError::Unavailable(_))
    ));
    start_speedrun(&pool, speedrun.id, player).await.unwrap();
    assert!(matches!(
        give_up_speedrun(&pool, speedrun.id, player).await,
        Err(AppError::Conflict(_))
    ));

    sqlx::query("DROP VIEW timeline_speedrun_public_stats")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DROP VIEW timeline_speedrun_public_runs")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("CREATE VIEW timeline_speedrun_public_runs AS SELECT 'runner' AS user_id, '2026-01-01' AS challenge_date, -1 AS submissions, 100 AS time_ms, 0 AS created_at")
        .execute(&pool).await.unwrap();
    let users = BTreeSet::from(["runner".to_owned()]);
    assert!(matches!(
        timeline_recent_speedruns(&pool, &users).await,
        Err(AppError::Unavailable(_))
    ));
}
