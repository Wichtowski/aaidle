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
    sqlx::query("INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES ('p','Provider','provider','US',1,0,0)")
        .execute(&pool).await.expect("provider");
    sqlx::query("INSERT INTO categories (id,name,slug) VALUES ('language-model','Language model','language-model')")
        .execute(&pool).await.expect("category");
    for number in 1..=3 {
        let id = format!("model-{number}");
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (?,'p',?,?,?,2024,'unknown','unknown','active',1,'test','test',0,0)")
            .bind(&id).bind(format!("Model {number}")).bind(&id).bind(format!("2024-0{number}-01"))
            .execute(&pool).await.expect("model");
        sqlx::query(
            "INSERT INTO model_categories (model_id,category_id) VALUES (?,'language-model')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("model category");
    }
    sqlx::query("INSERT INTO model_aliases (id,model_id,alias,normalized_alias) VALUES ('a','model-1','One','one')")
        .execute(&pool).await.expect("alias");
    pool
}

#[test]
fn category_modes_columns_and_helpers_cover_variants() {
    for (value, category, path) in [
        ("llm", ClassicCategory::Llm, "llm"),
        ("cv", ClassicCategory::Cv, "cv"),
        ("nlp", ClassicCategory::Nlp, "nlp"),
        ("od", ClassicCategory::ObjectDetection, "od"),
        ("classical-ml", ClassicCategory::ClassicalMl, "classical-ml"),
        ("filters", ClassicCategory::Filters, "filters"),
        ("hardcore", ClassicCategory::Hardcore, "hardcore"),
    ] {
        assert_eq!(ClassicCategory::parse(value), Some(category));
        assert_eq!(category.path_segment(), path);
        assert!(!classic_columns(category, ClassicDifficulty::Normal).is_empty());
        assert!(!classic_columns(category, ClassicDifficulty::Challenge).contains(&"country"));
    }
    assert_eq!(ClassicCategory::Cv.catalog_slug(), Some("computer-vision"));
    assert_eq!(ClassicCategory::Filters.catalog_slug(), Some("filters"));
    assert_eq!(ClassicCategory::parse("missing"), None);
    assert!(parse_classic_mode("classic:llm:normal").is_some());
    assert!(parse_classic_mode("classic:llm:normal:extra").is_none());
    assert!(is_classic_challenge_mode("classic"));
    assert_eq!(split_aliases(String::new()), Vec::<String>::new());
    assert_eq!(split_aliases("a\u{1f}b".into()), ["a", "b"]);
    assert_eq!(
        stored_family_values(None, Some("family")).unwrap(),
        ["family"]
    );
    assert_eq!(
        stored_family_values(Some("[\"a\",\"b\"]"), None).unwrap(),
        ["a", "b"]
    );
    assert!(parse_date("not-a-date").is_err());
}

#[tokio::test]
async fn classic_repository_round_trip_and_error_paths() {
    let pool = pool().await;
    let (models, cursor) = list_public_models(&pool, None, 2).await.unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].aliases, ["One"]);
    assert_eq!(cursor.as_deref(), Some("model-2"));
    let (last, cursor) = list_public_models(&pool, cursor.as_deref(), 2)
        .await
        .unwrap();
    assert_eq!(last.len(), 1);
    assert!(cursor.is_none());

    let challenge = ensure_daily_challenge(&pool, "2026-01-01", "classic", "secret", 2)
        .await
        .unwrap();
    assert_eq!(
        ensure_daily_challenge(&pool, "2026-01-01", "classic", "other", 2)
            .await
            .unwrap()
            .id,
        challenge.id
    );
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player_id = Uuid::new_v4();
    let wrong = ["model-1", "model-2", "model-3"]
        .into_iter()
        .find(|id| *id != challenge.answer_model_id)
        .unwrap();
    let wrong_request = Uuid::new_v4();
    let first = process_guess(
        &pool,
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: wrong_request,
            guessed_model_id: wrong.into(),
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    assert!(!first.is_correct);
    assert_eq!(first.player_stats.games_played, 1);
    let replay = process_guess(
        &pool,
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: wrong_request,
            guessed_model_id: wrong.into(),
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    assert_eq!(replay.attempt_number, 1);
    let reused = process_guess(
        &pool,
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: wrong_request,
            guessed_model_id: challenge.answer_model_id.clone(),
            attempt_number: 2,
        },
    )
    .await;
    assert!(matches!(reused, Err(AppError::Conflict(_))));
    let answer = process_guess(
        &pool,
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: challenge.answer_model_id.clone(),
            attempt_number: 2,
        },
    )
    .await
    .unwrap();
    assert!(answer.is_correct);
    assert_eq!(answer.completion_count, 1);
    assert!(matches!(
        process_guess(
            &pool,
            GuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: "missing".into(),
                attempt_number: 3
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));

    let history = classic_guess_history(&pool, challenge_id, player_id)
        .await
        .unwrap();
    assert_eq!(history.len(), 2);
    let aggregate = challenge_stats(&pool, challenge_id).await.unwrap();
    assert_eq!(
        (
            aggregate.total_guesses,
            aggregate.unique_players,
            aggregate.correct_guesses
        ),
        (2, 1, 1)
    );
    assert_eq!(
        player_stats(&pool, player_id).await.unwrap()[0].games_won,
        1
    );
    rebuild_classic_player_stats(&pool, player_id, "classic", 10)
        .await
        .unwrap();
    let trajectory_game = classic_game(
        &pool,
        "2026-01-02",
        ClassicCategory::Llm,
        ClassicDifficulty::Normal,
        "secret",
        2,
    )
    .await
    .unwrap();
    assert_eq!(
        classic_trajectory(
            &pool,
            Uuid::parse_str(&trajectory_game.challenge.id).unwrap()
        )
        .await
        .unwrap()
        .1
        .len(),
        3
    );
    assert!(challenge_stats(&pool, Uuid::new_v4()).await.is_err());
    assert!(
        classic_guess_history(&pool, Uuid::new_v4(), player_id)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn focused_classic_validation_and_empty_rebuild() {
    let pool = pool().await;
    assert!(
        classic_game(
            &pool,
            "2026-01-01",
            ClassicCategory::Hardcore,
            ClassicDifficulty::Normal,
            "s",
            1
        )
        .await
        .is_err()
    );
    let game = classic_game(
        &pool,
        "2026-01-01",
        ClassicCategory::Llm,
        ClassicDifficulty::Challenge,
        "s",
        1,
    )
    .await
    .unwrap();
    assert_eq!(game.models.len(), 3);
    let player = Uuid::new_v4();
    let mut connection = pool.acquire().await.unwrap();
    ensure_anonymous_player(&mut connection, player, 1)
        .await
        .unwrap();
    drop(connection);
    rebuild_visual_player_stats(&pool, player, "emoji:normal", 1)
        .await
        .unwrap();
    assert!(player_stats(&pool, player).await.unwrap().is_empty());
}

#[test]
fn malformed_repository_values_return_errors() {
    assert!(stored_family_values(Some("not-json"), None).is_err());
    assert_eq!(
        stored_family_values(Some("[]"), Some("primary")).unwrap(),
        ["primary"]
    );
    assert!(
        player_stats_dto(PlayerStatsRow {
            mode: "classic".into(),
            current_streak: 0,
            best_streak: 0,
            games_played: 0,
            games_won: 0,
            last_played_date: None,
            last_solved_date: None,
            guess_distribution_json: "not-json".into(),
        })
        .is_err()
    );
    assert!(!is_sqlite_busy(&AppError::validation("not busy")));
}

#[tokio::test]
async fn guess_validation_unavailable_models_and_invalid_relationships() {
    let pool = pool().await;
    let challenge = ensure_daily_challenge(&pool, "2026-02-01", "classic", "secret", 1)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player = Uuid::new_v4();
    assert!(matches!(
        process_guess(
            &pool,
            GuessInput {
                challenge_id,
                player_id: player,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: "missing".into(),
                attempt_number: 1,
            }
        )
        .await,
        Err(AppError::NotFound(_))
    ));
    let wrong = ["model-1", "model-2", "model-3"]
        .into_iter()
        .find(|model| *model != challenge.answer_model_id)
        .unwrap();
    assert!(matches!(
        process_guess(
            &pool,
            GuessInput {
                challenge_id,
                player_id: player,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: wrong.into(),
                attempt_number: 2,
            }
        )
        .await,
        Err(AppError::Validation(_))
    ));

    sqlx::query("UPDATE models SET status = 'unavailable' WHERE id = 'model-3'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        public_models_by_ids(&pool, &["model-3".into()])
            .await
            .is_err()
    );
    let mut connection = pool.acquire().await.unwrap();
    assert!(
        related_names(&mut connection, "bad", "bad", "bad", "model-1")
            .await
            .is_err()
    );
    assert!(
        load_model(&mut connection, "missing", false)
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn focused_normal_pool_uses_rank_threshold_and_rebuilds_unsolved_games() {
    let pool = pool().await;
    for number in 4..=10 {
        let id = format!("model-{number}");
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (?,'p',?,?, '2024-01-01',2024,'unknown','unknown','active',1,'test','test',0,0)")
            .bind(&id).bind(format!("Model {number}")).bind(&id).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO model_categories (model_id,category_id) VALUES (?,'language-model')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO model_game_metadata (model_id,min_pool_rank,category_details_json,updated_at) VALUES (?,?,'{}',0)")
            .bind(&id).bind(i64::from(number == 10)).execute(&pool).await.unwrap();
    }
    let ids = classic_eligible_model_ids(&pool, ClassicCategory::Llm, ClassicDifficulty::Normal)
        .await
        .unwrap();
    assert_eq!(ids.len(), 9);
    assert!(!ids.contains(&"model-10".to_owned()));
    let game = classic_game(
        &pool,
        "2026-02-02",
        ClassicCategory::Llm,
        ClassicDifficulty::Normal,
        "secret",
        1,
    )
    .await
    .unwrap();
    let challenge_id = Uuid::parse_str(&game.challenge.id).unwrap();
    let player = Uuid::new_v4();
    let wrong = ids
        .iter()
        .find(|id| **id != game.challenge.answer_model_id)
        .unwrap();
    process_guess(
        &pool,
        GuessInput {
            challenge_id,
            player_id: player,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: wrong.clone(),
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    rebuild_classic_player_stats(&pool, player, &game.challenge.mode, 10)
        .await
        .unwrap();
    let stats = player_stats(&pool, player).await.unwrap();
    assert_eq!(stats[0].games_played, 1);
    assert_eq!(stats[0].games_won, 0);
}

#[tokio::test]
async fn hardcore_pool_nonclassic_challenges_and_missing_stats_paths() {
    assert_eq!(ClassicCategory::Nlp.catalog_slug(), Some("nlp"));
    assert_eq!(
        ClassicCategory::ClassicalMl.catalog_slug(),
        Some("classical-ml")
    );
    assert_eq!(ClassicCategory::Hardcore.catalog_slug(), None);
    let pool = pool().await;
    assert!(
        ensure_daily_challenge_for_models(&pool, "2026-05-01", "classic", &[], "secret", 1)
            .await
            .is_err()
    );
    let player = Uuid::new_v4();
    assert!(matches!(
        process_guess(
            &pool,
            GuessInput {
                challenge_id: Uuid::new_v4(),
                player_id: player,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: "model-1".into(),
                attempt_number: 1
            }
        )
        .await,
        Err(AppError::NotFound(_))
    ));

    let nonclassic = ensure_daily_challenge(&pool, "2026-05-02", "daily", "secret", 1)
        .await
        .unwrap();
    assert!(matches!(
        process_guess(
            &pool,
            GuessInput {
                challenge_id: Uuid::parse_str(&nonclassic.id).unwrap(),
                player_id: player,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: "model-1".into(),
                attempt_number: 1
            }
        )
        .await,
        Err(AppError::NotFound(_))
    ));

    let hardcore = classic_game(
        &pool,
        "2026-05-03",
        ClassicCategory::Hardcore,
        ClassicDifficulty::Hardcore,
        "secret",
        1,
    )
    .await
    .unwrap();
    assert_eq!(hardcore.models.len(), 3);
    let mut connection = pool.acquire().await.unwrap();
    let challenge = find_challenge(
        &mut *connection,
        Uuid::parse_str(&hardcore.challenge.id).unwrap(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        classic_pool_size(&mut connection, &challenge)
            .await
            .unwrap(),
        3
    );
    assert!(
        is_model_eligible_for_challenge(&mut connection, &challenge, "model-1")
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn replay_requires_player_statistics_and_later_games_preserve_last_played_date() {
    let pool = pool().await;
    let challenge = ensure_daily_challenge(&pool, "2026-06-02", "classic", "secret", 1)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player = Uuid::new_v4();
    ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,0,'{}',0)")
        .bind(Uuid::new_v4().to_string()).bind("stored-request").bind(challenge_id.to_string()).bind(player.to_string()).bind("model-1")
        .execute(&pool).await.unwrap();
    let mut connection = pool.acquire().await.unwrap();
    let stored = find_guess_by_request_id(
        &mut connection,
        Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap(),
    )
    .await
    .unwrap();
    assert!(stored.is_none());
    let stored = sqlx::query_as::<_, StoredGuessRow>("SELECT challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json FROM guess_events WHERE request_id = 'stored-request'").fetch_one(&mut *connection).await.unwrap();
    assert!(matches!(
        replay_stored_guess(&mut connection, stored, challenge_id, player).await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn malformed_guess_history_storage_is_rejected() {
    let pool = pool().await;
    let challenge = ensure_daily_challenge(&pool, "2026-07-01", "classic", "secret", 1)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player = Uuid::new_v4();
    ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,0,'{}',0)")
        .bind(Uuid::new_v4().to_string())
        .bind("invalid-request-id")
        .bind(challenge_id.to_string())
        .bind(player.to_string())
        .bind("model-1")
        .execute(&pool)
        .await
        .unwrap();

    assert!(matches!(
        classic_guess_history(&pool, challenge_id, player).await,
        Err(AppError::Unavailable(_))
    ));
    sqlx::query("UPDATE guess_events SET request_id = ?, comparison_json = 'not-json'")
        .bind(Uuid::new_v4().to_string())
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        classic_guess_history(&pool, challenge_id, player).await,
        Err(AppError::Json(_))
    ));

    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE guess_events SET guessed_model_id = 'missing', comparison_json = '{}'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        classic_guess_history(&pool, challenge_id, player).await,
        Err(AppError::Unavailable(_))
    ));
    sqlx::query("UPDATE guess_events SET guessed_model_id = 'model-1'; UPDATE daily_challenges SET answer_model_id = 'missing' WHERE id = ?")
        .bind(challenge_id.to_string())
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        classic_guess_history(&pool, challenge_id, player).await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn replay_rejects_missing_models_challenges_and_malformed_statistics() {
    let pool = pool().await;
    let challenge = ensure_daily_challenge(&pool, "2026-07-02", "classic", "secret", 1)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player = Uuid::new_v4();
    ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    let stored = StoredGuessRow {
        challenge_id: challenge.id.clone(),
        player_id: player.to_string(),
        guessed_model_id: "missing".into(),
        attempt_number: 1,
        is_correct: 0,
        comparison_json: "{}".into(),
    };
    let mut connection = pool.acquire().await.unwrap();
    assert!(matches!(
        replay_stored_guess(&mut connection, stored, challenge_id, player).await,
        Err(AppError::Unavailable(_))
    ));
    let stored = StoredGuessRow {
        challenge_id: challenge.id.clone(),
        player_id: player.to_string(),
        guessed_model_id: "model-1".into(),
        attempt_number: 1,
        is_correct: 0,
        comparison_json: "{}".into(),
    };
    assert!(matches!(
        replay_stored_guess(&mut connection, stored.clone(), Uuid::new_v4(), player).await,
        Err(AppError::NotFound(_))
    ));
    sqlx::query("INSERT INTO player_mode_stats (player_id,mode,guess_distribution_json,updated_at) VALUES (?,'classic','not-json',0)")
        .bind(player.to_string())
        .execute(&mut *connection)
        .await
        .unwrap();
    let mut invalid_comparison = stored.clone();
    invalid_comparison.comparison_json = "not-json".into();
    assert!(matches!(
        replay_stored_guess(&mut connection, invalid_comparison, challenge_id, player).await,
        Err(AppError::Json(_))
    ));
    assert!(matches!(
        replay_stored_guess(&mut connection, stored, challenge_id, player).await,
        Err(AppError::Json(_))
    ));
}

#[tokio::test]
async fn completions_streaks_and_rebuild_statistics_cover_multiple_games() {
    let pool = pool().await;
    let player = Uuid::new_v4();
    for (date, expected_streak) in [("2026-08-01", 1), ("2026-08-02", 2)] {
        let challenge = ensure_daily_challenge(&pool, date, "classic", "secret", 1)
            .await
            .unwrap();
        let outcome = process_guess(
            &pool,
            GuessInput {
                challenge_id: Uuid::parse_str(&challenge.id).unwrap(),
                player_id: player,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: challenge.answer_model_id,
                attempt_number: 1,
            },
        )
        .await
        .unwrap();
        assert_eq!(outcome.player_stats.current_streak, expected_streak);
        assert_eq!(outcome.completion_count, 1);
    }
    rebuild_classic_player_stats(&pool, player, "classic", 20)
        .await
        .unwrap();
    let stats = player_stats(&pool, player).await.unwrap().pop().unwrap();
    assert_eq!((stats.games_played, stats.games_won), (2, 2));
    assert_eq!((stats.current_streak, stats.best_streak), (2, 2));
    assert_eq!(stats.guess_distribution.get("1"), Some(&2));

    let challenge = ensure_daily_challenge(&pool, "2026-08-03", "classic", "secret", 1)
        .await
        .unwrap();
    sqlx::query("UPDATE player_mode_stats SET guess_distribution_json = 'not-json' WHERE player_id = ? AND mode = 'classic'")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let mut connection = pool.acquire().await.unwrap();
    assert!(matches!(
        update_player_stats(
            &mut connection,
            PlayerEventTable::Classic,
            player,
            &challenge,
            1,
            false,
            21
        )
        .await,
        Err(AppError::Json(_))
    ));
    sqlx::query("UPDATE player_mode_stats SET guess_distribution_json = '{}', last_solved_date = 'invalid' WHERE player_id = ? AND mode = 'classic'")
        .bind(player.to_string())
        .execute(&mut *connection)
        .await
        .unwrap();
    assert!(matches!(
        update_player_stats(
            &mut connection,
            PlayerEventTable::Classic,
            player,
            &challenge,
            1,
            true,
            22
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
    let invalid_date = ChallengeRecord {
        challenge_date: "invalid".into(),
        ..challenge
    };
    assert!(matches!(
        update_player_stats(
            &mut connection,
            PlayerEventTable::Classic,
            player,
            &invalid_date,
            1,
            true,
            23
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn database_failures_propagate_from_repository_queries() {
    let closed_pool = pool().await;
    closed_pool.close().await;
    assert!(list_public_models(&closed_pool, None, 1).await.is_err());
    assert!(
        public_models_by_ids(&closed_pool, &["model-1".into()])
            .await
            .is_err()
    );
    assert!(
        classic_eligible_model_ids(
            &closed_pool,
            ClassicCategory::Llm,
            ClassicDifficulty::Normal,
        )
        .await
        .is_err()
    );
    assert!(
        ensure_daily_challenge(&closed_pool, "2026-09-01", "classic", "secret", 1)
            .await
            .is_err()
    );
    assert!(challenge_stats(&closed_pool, Uuid::new_v4()).await.is_err());
    assert!(player_stats(&closed_pool, Uuid::new_v4()).await.is_err());
    assert!(
        rebuild_classic_player_stats(&closed_pool, Uuid::new_v4(), "classic", 0)
            .await
            .is_err()
    );
    assert!(
        process_guess(
            &closed_pool,
            GuessInput {
                challenge_id: Uuid::new_v4(),
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: "model-1".into(),
                attempt_number: 1,
            }
        )
        .await
        .is_err()
    );

    let pool = pool().await;
    let mut connection = pool.acquire().await.unwrap();
    sqlx::query("DROP TABLE challenge_completion_counts")
        .execute(&mut *connection)
        .await
        .unwrap();
    assert!(completion_count(&mut *connection, "missing").await.is_err());
    assert!(
        increment_completion_count(&mut connection, "missing")
            .await
            .is_err()
    );
}

#[tokio::test]
async fn replay_conflicts_check_every_input_field_and_duplicate_models_replay() {
    let pool = pool().await;
    let challenge = ensure_daily_challenge(&pool, "2026-09-10", "classic", "secret", 1)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player_id = Uuid::new_v4();
    let guessed_model_id = ["model-1", "model-2", "model-3"]
        .into_iter()
        .find(|id| *id != challenge.answer_model_id)
        .unwrap()
        .to_owned();
    let request_id = Uuid::new_v4();
    let input = GuessInput {
        challenge_id,
        player_id,
        user_id: None,
        request_id,
        guessed_model_id: guessed_model_id.clone(),
        attempt_number: 1,
    };
    process_guess(
        &pool,
        GuessInput {
            challenge_id: input.challenge_id,
            player_id: input.player_id,
            user_id: None,
            request_id: input.request_id,
            guessed_model_id: input.guessed_model_id.clone(),
            attempt_number: input.attempt_number,
        },
    )
    .await
    .unwrap();

    let replayed = process_guess(
        &pool,
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: guessed_model_id.clone(),
            attempt_number: 2,
        },
    )
    .await
    .unwrap();
    assert_eq!(replayed.attempt_number, 1);

    let mut connection = pool.acquire().await.unwrap();
    let stored = find_guess_by_request_id(&mut connection, request_id)
        .await
        .unwrap()
        .unwrap();
    for conflicting in [
        GuessInput {
            challenge_id: Uuid::new_v4(),
            player_id,
            user_id: None,
            request_id,
            guessed_model_id: guessed_model_id.clone(),
            attempt_number: 1,
        },
        GuessInput {
            challenge_id,
            player_id: Uuid::new_v4(),
            user_id: None,
            request_id,
            guessed_model_id: guessed_model_id.clone(),
            attempt_number: 1,
        },
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id,
            guessed_model_id: challenge.answer_model_id.clone(),
            attempt_number: 1,
        },
        GuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id,
            guessed_model_id: guessed_model_id.clone(),
            attempt_number: 2,
        },
    ] {
        assert!(matches!(
            replay_guess(&mut connection, stored.clone(), &conflicting).await,
            Err(AppError::Conflict(_))
        ));
    }
}

#[tokio::test]
async fn classic_attempt_limit_and_malformed_model_metadata_are_rejected() {
    let pool = pool().await;
    let challenge = ensure_daily_challenge(&pool, "2026-09-11", "classic", "secret", 1)
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&challenge.id).unwrap();
    let player_id = Uuid::new_v4();
    ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player_id, 0)
        .await
        .unwrap();
    for attempt in 1..=3 {
        let id = format!("stored-model-{attempt}");
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES ('placeholder','p','Placeholder','placeholder','2024-01-01',2024,'unknown','unknown','unavailable',0,'test','test',0,0)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE models SET id = ?, name = ?, slug = ? WHERE id = 'placeholder'")
            .bind(&id)
            .bind(&id)
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,?,0,'{}',0)")
            .bind(Uuid::new_v4().to_string())
            .bind(Uuid::new_v4().to_string())
            .bind(challenge_id.to_string())
            .bind(player_id.to_string())
            .bind(id)
            .bind(i64::from(attempt))
            .execute(&pool)
            .await
            .unwrap();
    }
    assert!(matches!(
        process_guess(
            &pool,
            GuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: challenge.answer_model_id,
                attempt_number: 4,
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));

    sqlx::query("INSERT INTO model_game_metadata (model_id,category_details_json,updated_at) VALUES ('model-1','not-json',0)")
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        load_model(&mut pool.acquire().await.unwrap(), "model-1", false).await,
        Err(AppError::Json(_))
    ));
}

#[tokio::test]
async fn classic_multiple_completions_and_older_games_preserve_stats_dates() {
    let pool = pool().await;
    let newer = ensure_daily_challenge(&pool, "2026-09-12", "classic", "secret", 1)
        .await
        .unwrap();
    let newer_id = Uuid::parse_str(&newer.id).unwrap();
    for expected_completion_count in 1..=2 {
        let outcome = process_guess(
            &pool,
            GuessInput {
                challenge_id: newer_id,
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: newer.answer_model_id.clone(),
                attempt_number: 1,
            },
        )
        .await
        .unwrap();
        assert_eq!(outcome.completion_count, expected_completion_count);
    }

    let player = Uuid::new_v4();
    process_guess(
        &pool,
        GuessInput {
            challenge_id: newer_id,
            player_id: player,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: newer.answer_model_id,
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    let older = ensure_daily_challenge(&pool, "2026-09-11", "classic", "secret", 1)
        .await
        .unwrap();
    let older_outcome = process_guess(
        &pool,
        GuessInput {
            challenge_id: Uuid::parse_str(&older.id).unwrap(),
            player_id: player,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: older.answer_model_id,
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        older_outcome.player_stats.last_played_date.as_deref(),
        Some("2026-09-12")
    );
}
