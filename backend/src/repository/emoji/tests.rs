use super::*;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};

async fn pool_and_catalog() -> (SqlitePool, VisualClueCatalog) {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect test database");
    crate::db::migrate(&pool)
        .await
        .expect("migrate test database");
    let catalog = VisualClueCatalog::load().expect("load catalog");
    for entity in catalog.eligible(2) {
        sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES (?,?,?,?,?,?,?,0)")
            .bind(&entity.id)
            .bind(&entity.name)
            .bind(serde_json::to_string(&entity.aliases).unwrap())
            .bind(entity.entity_kind.as_str())
            .bind(serde_json::to_string(&entity.categories).unwrap())
            .bind(i64::from(entity.min_pool))
            .bind(serde_json::to_string(entity).unwrap())
            .execute(&pool).await.expect("entity");
    }
    (pool, catalog)
}

#[test]
fn difficulty_and_reveal_helpers_cover_boundaries() {
    assert_eq!(difficulty_pool("normal"), Some(0));
    assert_eq!(difficulty_pool("challenge"), Some(1));
    assert_eq!(difficulty_pool("hardcore"), Some(2));
    assert_eq!(difficulty_pool("unknown"), None);
    let catalog = VisualClueCatalog::load().unwrap();
    let entity = catalog.eligible(0).next().unwrap();
    let resolved = resolve_variant(entity, &entity.variants[0].id).unwrap();
    assert_eq!(
        initial_clues(&resolved).len(),
        resolved.initial_reveal_count.min(resolved.clues.len())
    );
    assert_eq!(
        revealed_clues(&resolved, usize::MAX).len(),
        resolved.clues.len()
    );
}

#[tokio::test]
async fn visual_game_guess_hints_history_and_conflicts() {
    let (pool, catalog) = pool_and_catalog().await;
    assert!(
        game(&pool, &catalog, "2026-03-01", "unknown", "secret")
            .await
            .is_err()
    );
    let data = game(&pool, &catalog, "2026-03-01", "normal", "secret")
        .await
        .unwrap();
    assert_eq!(data.entities.len(), catalog.eligible(0).count());
    assert_eq!(data.completion_count, 0);
    assert_eq!(
        game(&pool, &catalog, "2026-03-01", "normal", "other")
            .await
            .unwrap()
            .challenge
            .id,
        data.challenge.id
    );
    let challenge_id = Uuid::parse_str(&data.challenge.id).unwrap();
    let player_id = Uuid::new_v4();
    assert!(
        hints(&pool, &catalog, Uuid::new_v4(), player_id)
            .await
            .is_err()
    );
    assert!(
        guess_history(&pool, &catalog, Uuid::new_v4(), player_id)
            .await
            .is_err()
    );
    let wrong = catalog
        .eligible(0)
        .find(|entity| entity.id != data.challenge.answer_entity_id)
        .unwrap();
    let bad_attempt = process_guess(
        &pool,
        &catalog,
        VisualGuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_entity_id: wrong.id.clone(),
            attempt_number: 2,
        },
    )
    .await;
    assert!(matches!(bad_attempt, Err(AppError::Validation(_))));
    let request = Uuid::new_v4();
    let first = process_guess(
        &pool,
        &catalog,
        VisualGuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: request,
            guessed_entity_id: wrong.id.clone(),
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
    assert!(!first.is_correct);
    assert!(
        !hints(&pool, &catalog, challenge_id, player_id)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: request,
                guessed_entity_id: data.challenge.answer_entity_id.clone(),
                attempt_number: 2
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: wrong.id.clone(),
                attempt_number: 2
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
    let solved = process_guess(
        &pool,
        &catalog,
        VisualGuessInput {
            challenge_id,
            player_id,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_entity_id: data.challenge.answer_entity_id.clone(),
            attempt_number: 2,
        },
    )
    .await
    .unwrap();
    assert!(solved.is_correct);
    assert_eq!(solved.completion_count, 1);
    assert_eq!(solved.clues.len(), data.maximum_clues);
    assert_eq!(
        hints(&pool, &catalog, challenge_id, player_id)
            .await
            .unwrap()
            .len(),
        data.maximum_clues
    );
    assert_eq!(
        guess_history(&pool, &catalog, challenge_id, player_id)
            .await
            .unwrap()
            .len(),
        2
    );
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: catalog
                    .eligible(0)
                    .find(|e| e.id != wrong.id && e.id != data.challenge.answer_entity_id)
                    .unwrap()
                    .id
                    .clone(),
                attempt_number: 3
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
}

#[tokio::test]
async fn rejects_missing_and_out_of_pool_entities() {
    let (pool, catalog) = pool_and_catalog().await;
    let data = game(&pool, &catalog, "2026-03-02", "normal", "secret")
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&data.challenge.id).unwrap();
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id,
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: "missing".into(),
                attempt_number: 1
            }
        )
        .await,
        Err(AppError::Validation(_))
    ));
    if let Some(entity) = catalog.eligible(2).find(|entity| entity.min_pool > 0) {
        assert!(matches!(
            process_guess(
                &pool,
                &catalog,
                VisualGuessInput {
                    challenge_id,
                    player_id: Uuid::new_v4(),
                    user_id: None,
                    request_id: Uuid::new_v4(),
                    guessed_entity_id: entity.id.clone(),
                    attempt_number: 1
                }
            )
            .await,
            Err(AppError::Validation(_))
        ));
    }
}

#[tokio::test]
async fn malformed_visual_challenges_and_history_are_unavailable() {
    let (pool, catalog) = pool_and_catalog().await;
    let entity = catalog.eligible(0).next().unwrap();
    let player = Uuid::new_v4();
    sqlx::query("INSERT INTO anonymous_players (id,created_at,last_seen_at) VALUES (?,0,0)")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();

    let bad_variant = Uuid::new_v4();
    sqlx::query("INSERT INTO visual_clue_challenges (id,challenge_date,mode,answer_entity_id,variant_id,selection_version,generated_at) VALUES (?,'2026-04-01','emoji:normal',?,'missing',1,0)")
        .bind(bad_variant.to_string()).bind(&entity.id).execute(&pool).await.unwrap();
    assert!(
        game(&pool, &catalog, "2026-04-01", "normal", "secret")
            .await
            .is_err()
    );
    assert!(hints(&pool, &catalog, bad_variant, player).await.is_err());

    sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES ('orphan','Orphan','[]','emoji','[]',0,'{}',0)")
        .execute(&pool).await.unwrap();
    let missing_answer = Uuid::new_v4();
    sqlx::query("INSERT INTO visual_clue_challenges (id,challenge_date,mode,answer_entity_id,variant_id,selection_version,generated_at) VALUES (?,'2026-04-02','emoji:normal','orphan','variant',1,0)")
        .bind(missing_answer.to_string()).execute(&pool).await.unwrap();
    assert!(
        game(&pool, &catalog, "2026-04-02", "normal", "secret")
            .await
            .is_err()
    );

    let valid = game(&pool, &catalog, "2026-04-03", "normal", "secret")
        .await
        .unwrap();
    let valid_id = Uuid::parse_str(&valid.challenge.id).unwrap();
    sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?,?,?,?, 'orphan',1,0,0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string())
        .bind(valid_id.to_string()).bind(player.to_string()).execute(&pool).await.unwrap();
    assert!(matches!(
        guess_history(&pool, &catalog, valid_id, player).await,
        Err(AppError::Unavailable(_))
    ));

    sqlx::query("UPDATE visual_clue_challenges SET mode = 'invalid' WHERE id = ?")
        .bind(valid_id.to_string())
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id: valid_id,
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: entity.id.clone(),
                attempt_number: 1,
            }
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn visual_completion_counts_stats_and_malformed_answers() {
    let (pool, catalog) = pool_and_catalog().await;
    let data = game(&pool, &catalog, "2026-04-10", "normal", "secret")
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&data.challenge.id).unwrap();
    let answer = data.challenge.answer_entity_id.clone();

    for expected_completion_count in 1..=2 {
        let outcome = process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id,
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: answer.clone(),
                attempt_number: 1,
            },
        )
        .await
        .unwrap();
        assert_eq!(outcome.completion_count, expected_completion_count);
        assert_eq!(
            (
                outcome.player_stats.games_played,
                outcome.player_stats.games_won
            ),
            (1, 1)
        );
        assert_eq!(outcome.player_stats.guess_distribution.get("1"), Some(&1));
    }
    assert_eq!(
        game(&pool, &catalog, "2026-04-10", "normal", "different")
            .await
            .unwrap()
            .completion_count,
        2
    );

    let malformed = game(&pool, &catalog, "2026-04-11", "normal", "secret")
        .await
        .unwrap();
    let malformed_id = Uuid::parse_str(&malformed.challenge.id).unwrap();
    sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES ('malformed-answer','Malformed','[]','emoji','[]',0,'{}',0)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE visual_clue_challenges SET answer_entity_id = 'malformed-answer' WHERE id = ?",
    )
    .bind(malformed_id.to_string())
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        hints(&pool, &catalog, malformed_id, Uuid::new_v4()).await,
        Err(AppError::Unavailable(_))
    ));
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id: malformed_id,
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: catalog.eligible(0).next().unwrap().id.clone(),
                attempt_number: 1,
            }
        )
        .await,
        Err(AppError::Unavailable(_))
    ));
}

#[tokio::test]
async fn visual_attempt_limit_uses_the_eligible_pool_size() {
    let (pool, catalog) = pool_and_catalog().await;
    let data = game(&pool, &catalog, "2026-04-19", "normal", "secret")
        .await
        .unwrap();
    let challenge_id = Uuid::parse_str(&data.challenge.id).unwrap();
    let player_id = Uuid::new_v4();
    ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player_id, 0)
        .await
        .unwrap();
    for attempt in 1..=catalog.eligible(0).count() {
        let id = format!("stored-{attempt}");
        sqlx::query("INSERT INTO visual_clue_entities (id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES (?,?,'[]','emoji','[]',0,'{}',0)")
            .bind(&id)
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?,?,?,?,?,?,0,0)")
            .bind(Uuid::new_v4().to_string())
            .bind(Uuid::new_v4().to_string())
            .bind(challenge_id.to_string())
            .bind(player_id.to_string())
            .bind(id)
            .bind(attempt as i64)
            .execute(&pool)
            .await
            .unwrap();
    }
    assert!(matches!(
        process_guess(
            &pool,
            &catalog,
            VisualGuessInput {
                challenge_id,
                player_id,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: catalog.eligible(0).next().unwrap().id.clone(),
                attempt_number: 1,
            }
        )
        .await,
        Err(AppError::Conflict(_))
    ));
}

#[tokio::test]
async fn visual_repository_database_errors_are_propagated() {
    let (closed, catalog) = pool_and_catalog().await;
    closed.close().await;
    assert!(
        game(&closed, &catalog, "2026-04-20", "normal", "secret")
            .await
            .is_err()
    );
    assert!(
        hints(&closed, &catalog, Uuid::new_v4(), Uuid::new_v4())
            .await
            .is_err()
    );
    assert!(
        guess_history(&closed, &catalog, Uuid::new_v4(), Uuid::new_v4())
            .await
            .is_err()
    );
    assert!(
        process_guess(
            &closed,
            &catalog,
            VisualGuessInput {
                challenge_id: Uuid::new_v4(),
                player_id: Uuid::new_v4(),
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_entity_id: "missing".into(),
                attempt_number: 1,
            }
        )
        .await
        .is_err()
    );

    let (pool, catalog) = pool_and_catalog().await;
    game(&pool, &catalog, "2026-04-21", "normal", "secret")
        .await
        .unwrap();
    sqlx::query("DROP TABLE visual_clue_completion_counts")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        game(&pool, &catalog, "2026-04-21", "normal", "secret")
            .await
            .is_err()
    );
}
