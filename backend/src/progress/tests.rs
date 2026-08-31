use super::*;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};

async fn pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect test database");
    crate::db::migrate(&pool)
        .await
        .expect("migrate test database");
    for (id, email) in [
        ("user-1", "one@example.test"),
        ("user-2", "two@example.test"),
    ] {
        sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES (?,?,?,?,?)")
            .bind(id).bind(email).bind(email).bind(0_i64).bind(0_i64)
            .execute(&pool).await.expect("user");
    }
    pool
}

fn request(player_id: Uuid) -> ProgressSyncRequest {
    ProgressSyncRequest {
        version: 1,
        player_id,
        preferences: ProgressPreferencesInput {
            reduced_motion: false,
            high_contrast: false,
            has_seen_classic_privacy: false,
            has_seen_classic_how_to_play: true,
            inner_circle_active: true,
            hell_mode: true,
            has_autoplayed_hardcore_soundtrack: true,
        },
        active_games: Vec::new(),
    }
}

#[test]
fn stats_streaks_dates_and_history_helpers() {
    assert_eq!(default_distribution().len(), 8);
    assert_eq!(streaks(&[]).unwrap(), (0, 0));
    assert_eq!(
        streaks(&["2026-01-04", "2026-01-03", "2026-01-01"]).unwrap(),
        (2, 2)
    );
    assert!(streaks(&["bad"]).is_err());
    let rows = vec![
        HistoryRow {
            challenge_id: "a".into(),
            challenge_date: "2026-01-02".into(),
            mode: "classic:llm:normal".into(),
            guess_count: 1,
            solved: 1,
        },
        HistoryRow {
            challenge_id: "b".into(),
            challenge_date: "2026-01-01".into(),
            mode: "classic:llm:normal".into(),
            guess_count: 9,
            solved: 1,
        },
        HistoryRow {
            challenge_id: "c".into(),
            challenge_date: "2025-12-20".into(),
            mode: "classic:llm:normal".into(),
            guess_count: 2,
            solved: 0,
        },
    ];
    let stats = history_stats_from_rows(&rows, false).unwrap();
    assert_eq!((stats.games_played, stats.games_won), (2, 2));
    assert_eq!(stats.guess_distribution["1"], 1);
    assert_eq!(stats.guess_distribution["8+"], 1);
    let game = history_game(rows.into_iter().next().unwrap(), vec!["Model".into()]);
    assert_eq!(game.status, "solved");
    let timestamp = unix_millis(OffsetDateTime::UNIX_EPOCH).unwrap();
    assert_eq!(timestamp, 0);
    assert!(format_millis(0).unwrap().starts_with("1970-01-01T00:00:00"));
    assert!(format_millis(i64::MAX).is_err());
}

#[tokio::test]
async fn synchronize_load_preferences_and_canonical_player() {
    let pool = pool().await;
    let player = Uuid::new_v4();
    let incoming = request(player);
    synchronize(&pool, "user-1", &incoming, 1_000)
        .await
        .unwrap();
    let loaded = load(&pool, "user-1").await.unwrap().unwrap();
    assert_eq!(loaded["playerId"], player.to_string());
    assert_eq!(loaded["preferences"]["hasSeenClassicHowToPlay"], true);
    assert_eq!(loaded["preferences"]["innerCircleActive"], false);
    assert!(load(&pool, "missing").await.unwrap().is_none());
    assert_eq!(
        canonical_player_id(&pool, "user-1", Uuid::new_v4(), 2_000)
            .await
            .unwrap(),
        player
    );
    let second_player = Uuid::new_v4();
    assert_eq!(
        canonical_player_id(&pool, "user-2", second_player, 2_000)
            .await
            .unwrap(),
        second_player
    );
    assert!(matches!(
        synchronize(&pool, "user-2", &incoming, 2_000).await,
        Err(AppError::Conflict(_))
    ));

    update_preferences(
        &pool,
        "user-1",
        &ProgressPreferencesUpdate {
            has_seen_classic_how_to_play: false,
            inner_circle_active: true,
            hell_mode: true,
            has_autoplayed_hardcore_soundtrack: false,
        },
        3_000,
    )
    .await
    .unwrap();
    assert!(matches!(
        update_preferences(
            &pool,
            "missing",
            &ProgressPreferencesUpdate {
                has_seen_classic_how_to_play: false,
                inner_circle_active: false,
                hell_mode: false,
                has_autoplayed_hardcore_soundtrack: false
            },
            3_000
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    for (game, category) in [
        ("classic", "llm"),
        ("emoji", "normal"),
        ("timeline", "normal"),
    ] {
        let response = history(&pool, "user-1", game, category, 1).await.unwrap();
        assert_eq!(response.total, 0);
    }
}

#[tokio::test]
async fn synchronize_and_history_validation_errors() {
    let pool = pool().await;
    let mut incoming = request(Uuid::new_v4());
    incoming.version = 2;
    assert!(matches!(
        synchronize(&pool, "user-1", &incoming, 0).await,
        Err(AppError::Validation(_))
    ));
    incoming.version = 1;
    incoming.active_games = (0..=MAX_ACTIVE_GAMES)
        .map(|_| ActiveGameInput {
            challenge_id: Uuid::new_v4(),
            started_at: "1970-01-01T00:00:00Z".into(),
        })
        .collect();
    assert!(synchronize(&pool, "user-1", &incoming, 0).await.is_err());
    incoming.active_games = vec![ActiveGameInput {
        challenge_id: Uuid::new_v4(),
        started_at: "invalid".into(),
    }];
    assert!(synchronize(&pool, "user-1", &incoming, 0).await.is_err());
    let duplicate = Uuid::new_v4();
    incoming.active_games = vec![
        ActiveGameInput {
            challenge_id: duplicate,
            started_at: "1970-01-01T00:00:00Z".into(),
        },
        ActiveGameInput {
            challenge_id: duplicate,
            started_at: "1970-01-01T00:00:00Z".into(),
        },
    ];
    assert!(synchronize(&pool, "user-1", &incoming, 0).await.is_err());
    incoming.active_games = vec![ActiveGameInput {
        challenge_id: Uuid::new_v4(),
        started_at: "1970-01-01T00:10:00Z".into(),
    }];
    assert!(synchronize(&pool, "user-1", &incoming, 0).await.is_err());
    incoming.active_games = vec![ActiveGameInput {
        challenge_id: Uuid::new_v4(),
        started_at: "1970-01-01T00:00:00Z".into(),
    }];
    assert!(synchronize(&pool, "user-1", &incoming, 0).await.is_err());

    assert!(history(&pool, "user-1", "classic", "bad", 1).await.is_err());
    assert!(history(&pool, "user-1", "emoji", "bad", 1).await.is_err());
    assert!(
        history(&pool, "user-1", "timeline", "bad", 1)
            .await
            .is_err()
    );
    assert!(history(&pool, "user-1", "bad", "normal", 1).await.is_err());
    assert!(history(&pool, "user-1", "classic", "llm", 0).await.is_err());
}

struct GameFixtures {
    classic: Uuid,
    visual: Uuid,
    timeline: Uuid,
}

async fn seed_game_fixtures(pool: &SqlitePool) -> GameFixtures {
    sqlx::query("INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES ('provider','Provider','provider','US',1,0,0)")
        .execute(pool).await.unwrap();
    for index in 1..=3 {
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (?,'provider',?,?, '2024-01-01',2024,'unknown','unknown','active',1,'test','test',0,0)")
            .bind(format!("model-{index}")).bind(format!("Model {index}")).bind(format!("model-{index}"))
            .execute(pool).await.unwrap();
    }
    let classic = Uuid::new_v4();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES (?,date('now'),'classic:llm:normal','model-1',1,0,'test')")
        .bind(classic.to_string()).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES ('visual-1','Visual One','[]','emoji','[]',0,'{}',0),('visual-2','Visual Two','[]','emoji','[]',0,'{}',0)")
        .execute(pool).await.unwrap();
    let visual = Uuid::new_v4();
    sqlx::query("INSERT INTO visual_clue_challenges (id,challenge_date,mode,answer_entity_id,variant_id,selection_version,generated_at) VALUES (?,'2026-01-02','emoji-z:normal','visual-1','variant',1,0)")
        .bind(visual.to_string()).execute(pool).await.unwrap();
    let timeline = Uuid::new_v4();
    sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) VALUES (?,'2026-01-01','normal','[]','[]','[]',1,0,'test')")
        .bind(timeline.to_string()).execute(pool).await.unwrap();
    GameFixtures {
        classic,
        visual,
        timeline,
    }
}

async fn anonymous_player(pool: &SqlitePool, player: Uuid) {
    sqlx::query("INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES (?,0,0)")
        .bind(player.to_string())
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn non_empty_histories_load_and_completion_records() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    let player = Uuid::new_v4();
    anonymous_player(&pool, player).await;
    synchronize(&pool, "user-1", &request(player), 1_000)
        .await
        .unwrap();
    for (attempt, model, correct) in [(1, "model-2", 0), (2, "model-1", 1)] {
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,user_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,?,?,?, '{}',?)")
            .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
            .bind(fixtures.classic.to_string()).bind(player.to_string()).bind("user-1")
            .bind(model).bind(attempt).bind(correct).bind(1_000_i64 + attempt)
            .execute(&pool).await.unwrap();
    }
    sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,user_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?,?,?,?,?,'visual-1',1,1,1000)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(fixtures.visual.to_string()).bind(player.to_string()).bind("user-1")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,user_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?,?,'[]','[]',1,1,1000)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(fixtures.timeline.to_string()).bind(player.to_string()).bind("user-1")
        .execute(&pool).await.unwrap();

    let classic = history(&pool, "user-1", "classic", "llm", 1).await.unwrap();
    assert_eq!(classic.total, 1);
    assert_eq!(classic.games[0].guessed_model_names, ["Model 2", "Model 1"]);
    assert_eq!(classic.games[0].status, "solved");
    assert_eq!(classic.stats.guess_distribution["2"], 1);
    let emoji = history(&pool, "user-1", "emoji", "normal", 1)
        .await
        .unwrap();
    assert_eq!(emoji.games[0].guessed_model_names, ["Visual One"]);
    let timeline = history(&pool, "user-1", "timeline", "normal", 1)
        .await
        .unwrap();
    assert_eq!(timeline.games[0].guessed_model_names, ["Submission 1"]);

    record_authenticated_classic_completion(&pool, "user-1", fixtures.classic, 2_000)
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_challenge_completions WHERE user_id = 'user-1'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
    let loaded = load(&pool, "user-1").await.unwrap().unwrap();
    assert_eq!(loaded["games"].as_array().unwrap().len(), 1);
    assert!(loaded["games"][0]["completedAt"].is_string());
}

#[tokio::test]
async fn final_classic_challenge_completion_grants_hardcore_access() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    sqlx::query("UPDATE daily_challenges SET mode = 'classic:filters:challenge' WHERE id = ?")
        .bind(fixtures.classic.to_string())
        .execute(&pool)
        .await
        .unwrap();
    for category in CHALLENGE_CATEGORIES
        .iter()
        .copied()
        .filter(|category| *category != "filters")
    {
        sqlx::query("INSERT INTO user_game_progress (user_id,game_type,difficulty,category,completed_at) VALUES ('user-1','classic','challenge',?,100)")
            .bind(category)
            .execute(&pool)
            .await
            .unwrap();
    }

    let player = Uuid::new_v4();
    anonymous_player(&pool, player).await;
    synchronize(&pool, "user-1", &request(player), 1_000)
        .await
        .unwrap();
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?, 'model-1',1,1,'{}',1500)")
        .bind(Uuid::new_v4().to_string())
        .bind(Uuid::new_v4().to_string())
        .bind(fixtures.classic.to_string())
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();

    record_authenticated_classic_completion(&pool, "user-1", fixtures.classic, 2_000)
        .await
        .unwrap();

    assert_eq!(
        completed_challenge_categories(&pool, "user-1")
            .await
            .unwrap(),
        6
    );
    assert!(
        crate::auth::has_hardcore_access(&pool, "user-1")
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn synchronize_merges_players_deduplicates_events_and_rebuilds_stats() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    let primary = Uuid::new_v4();
    synchronize(&pool, "user-1", &request(primary), 1_000)
        .await
        .unwrap();
    let secondary = Uuid::new_v4();
    anonymous_player(&pool, secondary).await;
    for (player, request, created) in [
        (primary, Uuid::new_v4(), 10_i64),
        (secondary, Uuid::new_v4(), 20_i64),
    ] {
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?, 'model-1',1,1,'{}',?)")
            .bind(Uuid::new_v4().to_string()).bind(request.to_string()).bind(fixtures.classic.to_string()).bind(player.to_string()).bind(created)
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?,?,?,?, 'visual-1',1,1,?)")
            .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(fixtures.visual.to_string()).bind(player.to_string()).bind(created)
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,attempts_remaining_after,created_at) VALUES (?,?,?,?, '[]','[]',1,1,2,?)")
            .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(fixtures.timeline.to_string()).bind(player.to_string()).bind(created)
            .execute(&pool).await.unwrap();
    }
    sqlx::query(
        "INSERT INTO challenge_completion_counts (challenge_id,completion_count) VALUES (?,2)",
    )
    .bind(fixtures.classic.to_string())
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO visual_clue_completion_counts (challenge_id,completion_count) VALUES (?,2)",
    )
    .bind(fixtures.visual.to_string())
    .execute(&pool)
    .await
    .unwrap();
    synchronize(&pool, "user-1", &request(secondary), 2_000)
        .await
        .unwrap();

    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM guess_events WHERE player_id = ?")
            .bind(primary.to_string())
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM visual_clue_guess_events WHERE player_id = ?"
        )
        .bind(primary.to_string())
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM timeline_attempts WHERE player_id = ?")
            .bind(primary.to_string())
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT MAX(attempt_number) FROM timeline_attempts WHERE player_id = ?"
        )
        .bind(primary.to_string())
        .fetch_one(&pool)
        .await
        .unwrap(),
        2
    );
    assert!(
        !crate::repository::player_stats(&pool, primary)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn active_game_state_uses_earliest_start_and_rejects_non_classic_modes() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    let player = Uuid::new_v4();
    let mut incoming = request(player);
    incoming.active_games.push(ActiveGameInput {
        challenge_id: fixtures.classic,
        started_at: "1970-01-01T00:00:02Z".into(),
    });
    synchronize(&pool, "user-1", &incoming, 3_000)
        .await
        .unwrap();
    incoming.active_games[0].started_at = "1970-01-01T00:00:01Z".into();
    synchronize(&pool, "user-1", &incoming, 4_000)
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT started_at FROM user_game_states WHERE user_id = 'user-1'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        1_000
    );
    let loaded = load(&pool, "user-1").await.unwrap().unwrap();
    assert!(loaded["games"][0]["completedAt"].is_null());

    incoming.active_games[0].challenge_id = fixtures.visual;
    assert!(matches!(
        synchronize(&pool, "user-1", &incoming, 5_000).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn completed_categories_grant_access_and_allow_hardcore_preferences() {
    let pool = pool().await;
    for category in CHALLENGE_CATEGORIES {
        sqlx::query("INSERT INTO user_game_progress (user_id,game_type,difficulty,category,completed_at) VALUES ('user-1','classic','challenge',?,0)")
            .bind(category).execute(&pool).await.unwrap();
    }
    let player = Uuid::new_v4();
    synchronize(&pool, "user-1", &request(player), 1_000)
        .await
        .unwrap();
    assert!(
        crate::auth::has_hardcore_access(&pool, "user-1")
            .await
            .unwrap()
    );
    update_preferences(
        &pool,
        "user-1",
        &ProgressPreferencesUpdate {
            has_seen_classic_how_to_play: true,
            inner_circle_active: true,
            hell_mode: true,
            has_autoplayed_hardcore_soundtrack: true,
        },
        2_000,
    )
    .await
    .unwrap();
    let loaded = load(&pool, "user-1").await.unwrap().unwrap();
    assert_eq!(loaded["preferences"]["innerCircleActive"], true);
    assert_eq!(loaded["preferences"]["hellMode"], true);
}

#[tokio::test]
async fn object_detection_and_in_progress_histories_are_mapped() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    sqlx::query("UPDATE daily_challenges SET mode = 'classic:od:normal' WHERE id = ?")
        .bind(fixtures.classic.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let player = Uuid::new_v4();
    anonymous_player(&pool, player).await;
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,user_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,'model-2',1,0,'{}',0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(fixtures.classic.to_string()).bind(player.to_string()).bind("user-1")
        .execute(&pool).await.unwrap();
    let response = history(&pool, "user-1", "classic", "object-detection", 1)
        .await
        .unwrap();
    assert_eq!(response.games[0].status, "in-progress");
    assert_eq!(response.stats.games_played, 0);
    assert_eq!(
        history_game(
            HistoryRow {
                challenge_id: "x".into(),
                challenge_date: "2026-01-01".into(),
                mode: "emoji:normal".into(),
                guess_count: 1,
                solved: 0
            },
            Vec::new()
        )
        .status,
        "in-progress"
    );
}

#[tokio::test]
async fn oversized_stored_progress_is_rejected() {
    let pool = pool().await;
    let player = Uuid::new_v4();
    synchronize(&pool, "user-1", &request(player), 1_000)
        .await
        .unwrap();
    sqlx::query("INSERT INTO providers (id,name,slug,is_active,created_at,updated_at) VALUES ('p','P','p',1,0,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO models (id,provider_id,name,slug,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES ('m','p','M','m','unknown','unknown','active',1,'test','test',0,0)").execute(&pool).await.unwrap();
    let large = "x".repeat(5_000);
    for index in 0..64 {
        let challenge = format!("challenge-{index}-{large}");
        sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES (?,date('now'),?,'m',1,0,'test')")
            .bind(&challenge).bind(format!("classic:{large}:{index}"))
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO user_game_states (user_id,challenge_id,started_at,updated_at) VALUES ('user-1',?,0,?)")
            .bind(&challenge).bind(index).execute(&pool).await.unwrap();
    }
    assert!(matches!(
        load(&pool, "user-1").await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn every_history_category_and_difficulty_maps_solved_and_in_progress_games() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    let player = Uuid::new_v4();
    anonymous_player(&pool, player).await;

    let classic_categories = [
        ("llm", "llm"),
        ("cv", "cv"),
        ("nlp", "nlp"),
        ("object-detection", "od"),
        ("classical-ml", "classical-ml"),
        ("filters", "filters"),
        ("hardcore", "hardcore"),
    ];
    for (index, (category, mode_segment)) in classic_categories.iter().enumerate() {
        for (solved_index, solved) in [0_i64, 1].into_iter().enumerate() {
            let challenge = Uuid::new_v4();
            let mode = format!("classic:{mode_segment}:normal");
            sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES (?,? ,?,'model-1',1,0,'test')")
                .bind(challenge.to_string())
                .bind(format!("2026-02-{:02}", index + solved_index + 1))
                .bind(mode)
                .execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,user_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,'model-2',1,?,'{}',?)")
                .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
                .bind(challenge.to_string()).bind(player.to_string()).bind("user-1")
                .bind(solved).bind(index as i64 * 10 + solved_index as i64)
                .execute(&pool).await.unwrap();
        }
        let response = history(&pool, "user-1", "classic", category, 1)
            .await
            .unwrap();
        assert_eq!(response.total, 2);
        assert!(response.games.iter().any(|game| game.status == "solved"));
        assert!(
            response
                .games
                .iter()
                .any(|game| game.status == "in-progress")
        );
    }

    for (index, difficulty) in ["normal", "challenge", "hardcore"].into_iter().enumerate() {
        for (solved_index, solved) in [0_i64, 1].into_iter().enumerate() {
            let visual = Uuid::new_v4();
            sqlx::query("INSERT INTO visual_clue_challenges (id,challenge_date,mode,answer_entity_id,variant_id,selection_version,generated_at) VALUES (?,?,?,'visual-1','variant',1,0)")
                .bind(visual.to_string()).bind(format!("2026-03-{:02}", index * 2 + solved_index + 1))
                .bind(format!("emoji-z:{difficulty}")).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,user_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?,?,?,?,?,'visual-2',1,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
                .bind(visual.to_string()).bind(player.to_string()).bind("user-1")
                .bind(solved).bind(index as i64 * 10 + solved_index as i64)
                .execute(&pool).await.unwrap();

            let timeline = Uuid::new_v4();
            sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) VALUES (?,?,?,'[]','[]','[]',1,0,'test')")
                .bind(timeline.to_string()).bind(format!("2026-04-{:02}", index * 2 + solved_index + 1))
                .bind(difficulty).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,user_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?,?,'[]','[]',1,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
                .bind(timeline.to_string()).bind(player.to_string()).bind("user-1")
                .bind(solved).bind(index as i64 * 10 + solved_index as i64)
                .execute(&pool).await.unwrap();
        }
        for game in ["emoji", "timeline"] {
            let response = history(&pool, "user-1", game, difficulty, 1).await.unwrap();
            assert_eq!(response.total, 2);
            assert!(response.games.iter().any(|entry| entry.status == "solved"));
            assert!(
                response
                    .games
                    .iter()
                    .any(|entry| entry.status == "in-progress")
            );
        }
    }
    assert_ne!(fixtures.classic, fixtures.visual);
}

#[tokio::test]
async fn first_sync_imports_classic_and_timeline_completion_records() {
    let pool = pool().await;
    let fixtures = seed_game_fixtures(&pool).await;
    sqlx::query("UPDATE daily_challenges SET mode = 'classic:llm:challenge' WHERE id = ?")
        .bind(fixtures.classic.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let player = Uuid::new_v4();
    anonymous_player(&pool, player).await;
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,'model-1',1,1,'{}',100)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(fixtures.classic.to_string()).bind(player.to_string()).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?,'[]','[]',1,1,200)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(fixtures.timeline.to_string()).bind(player.to_string()).execute(&pool).await.unwrap();

    synchronize(&pool, "user-1", &request(player), 1_000)
        .await
        .unwrap();
    for table in ["user_challenge_completions", "timeline_user_completions"] {
        let count = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM {table} WHERE user_id = 'user-1'"
        ))
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "completion missing from {table}");
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_game_progress WHERE user_id = 'user-1'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        2
    );
}

#[tokio::test]
async fn malformed_stored_ids_dates_and_timestamps_are_unavailable() {
    let pool = pool().await;
    anonymous_player(&pool, Uuid::new_v4()).await;
    sqlx::query(
        "INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES ('not-a-uuid',0,0)",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO user_progress_profiles (user_id,primary_player_id,updated_at) VALUES ('user-1','not-a-uuid',0)")
        .execute(&pool).await.unwrap();
    assert!(matches!(
        canonical_player_id(&pool, "user-1", Uuid::new_v4(), 0).await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        rebuild_primary_player_stats(&pool, "not-a-uuid", 0).await,
        Err(AppError::Unavailable(_))
    ));

    let fixtures = seed_game_fixtures(&pool).await;
    let player = Uuid::new_v4();
    anonymous_player(&pool, player).await;
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,user_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,'model-1',1,1,'{}',0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(fixtures.classic.to_string()).bind(player.to_string()).bind("user-1")
        .execute(&pool).await.unwrap();
    sqlx::query("UPDATE daily_challenges SET challenge_date = 'not-a-date' WHERE id = ?")
        .bind(fixtures.classic.to_string())
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        history(&pool, "user-1", "classic", "llm", 1).await,
        Err(AppError::Unavailable(_))
    ));

    sqlx::query("UPDATE daily_challenges SET challenge_date = date('now'), mode = 'classic:cv:normal' WHERE id = ?")
        .bind(fixtures.classic.to_string()).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO user_game_states (user_id,challenge_id,started_at,updated_at) VALUES ('user-1',?, ?,0)")
        .bind(fixtures.classic.to_string()).bind(i64::MAX).execute(&pool).await.unwrap();
    sqlx::query("DELETE FROM guess_events")
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        load(&pool, "user-1").await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn progress_database_failures_propagate_from_all_storage_entry_points() {
    let pool = pool().await;
    pool.close().await;
    let player = Uuid::new_v4();
    assert!(matches!(
        synchronize(&pool, "user-1", &request(player), 0).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        update_preferences(
            &pool,
            "user-1",
            &ProgressPreferencesUpdate {
                has_seen_classic_how_to_play: false,
                inner_circle_active: false,
                hell_mode: false,
                has_autoplayed_hardcore_soundtrack: false,
            },
            0
        )
        .await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        load(&pool, "user-1").await,
        Err(AppError::Database(_))
    ));
    for (game, category) in [
        ("classic", "llm"),
        ("emoji", "normal"),
        ("timeline", "normal"),
    ] {
        assert!(matches!(
            history(&pool, "user-1", game, category, 1).await,
            Err(AppError::Database(_))
        ));
    }
    assert!(matches!(
        canonical_player_id(&pool, "user-1", player, 0).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        record_authenticated_classic_completion(&pool, "user-1", player, 0).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        completed_challenge_categories(&pool, "user-1").await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        history_stats(&pool, "user-1", "classic:%").await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        emoji_history_rows(&pool, "user-1", "emoji-z:normal").await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        timeline_history_rows(&pool, "user-1", "normal").await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        player_stats_summary(&pool, &player.to_string()).await,
        Err(AppError::Database(_))
    ));
    assert!(matches!(
        rebuild_primary_player_stats(&pool, &player.to_string(), 0).await,
        Err(AppError::Database(_))
    ));
}
