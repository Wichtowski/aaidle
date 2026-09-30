use super::*;
use crate::{
    domain::timeline::TimelineModelSnapshot,
    repository::{ClassicCategory, ClassicDifficulty, GuessInput},
};

pub(crate) async fn fixture() -> (SqlitePool, Uuid, Uuid) {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::db::migrate(&pool).await.unwrap();
    sqlx::query("INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES ('p','Provider','provider','US',1,0,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO categories (id,name,slug) VALUES ('language-model','Language model','language-model')").execute(&pool).await.unwrap();
    for number in 1..=4 {
        let id = format!("model-{number}");
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (?,'p',?,?,?,2024,'unknown','yes','active',1,'test','test',0,0)")
            .bind(&id).bind(&id).bind(&id).bind(format!("2024-{:02}-01", number * 3)).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO model_categories (model_id,category_id) VALUES (?,'language-model')",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    }
    let challenge = super::super::classic_game(
        &pool,
        "2026-09-30",
        ClassicCategory::Llm,
        ClassicDifficulty::Normal,
        "secret",
        7,
    )
    .await
    .unwrap();
    (
        pool,
        Uuid::parse_str(&challenge.challenge.id).unwrap(),
        Uuid::new_v4(),
    )
}

pub(crate) async fn miss(pool: &SqlitePool, challenge: Uuid, player: Uuid) {
    let answer: String =
        sqlx::query_scalar("SELECT answer_model_id FROM daily_challenges WHERE id = ?")
            .bind(challenge.to_string())
            .fetch_one(pool)
            .await
            .unwrap();
    let wrong = (1..=4)
        .map(|i| format!("model-{i}"))
        .find(|id| *id != answer)
        .unwrap();
    super::super::process_guess(
        pool,
        GuessInput {
            challenge_id: challenge,
            player_id: player,
            user_id: None,
            request_id: Uuid::new_v4(),
            guessed_model_id: wrong,
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
}

pub(crate) async fn timeline_fixture(pool: &SqlitePool, difficulty: TimelineDifficulty) -> Uuid {
    let id = Uuid::new_v4();
    let models = (0..6)
        .map(|i| TimelineModelSnapshot {
            id: format!("card-{i}"),
            name: format!("Card {i}"),
            item_kind: "model".into(),
            release_date: format!("{}-01-01", 2000 + i),
            year_annotation: None,
            categories: vec!["llm".into()],
        })
        .collect::<Vec<_>>();
    let tray = ["card-3", "card-5", "card-1", "card-2", "card-4"];
    sqlx::query("INSERT INTO timeline_challenges (id,challenge_date,difficulty,model_order_json,anchor_positions_json,tray_order_json,selection_version,generated_at,generation_source) VALUES (?,'2026-09-30',?,?,'[0]',?,1,0,'test')")
        .bind(id.to_string()).bind(difficulty.as_str()).bind(serde_json::to_string(&models).unwrap()).bind(serde_json::to_string(&tray).unwrap()).execute(pool).await.unwrap();
    id
}

pub(crate) async fn timeline_miss(pool: &SqlitePool, challenge: Uuid, player: Uuid) {
    super::super::timeline::process_timeline_attempt(
        pool,
        super::super::timeline::TimelineAttemptInput {
            challenge_id: challenge,
            player_id: player,
            user_id: None,
            hardcore_access: true,
            request_id: Uuid::new_v4(),
            model_order: ["card-0", "card-2", "card-3", "card-4", "card-5", "card-1"]
                .map(str::to_owned)
                .to_vec(),
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn classic_eligibility_selected_values_replays_and_errors() {
    let (pool, challenge, player) = fixture().await;
    let initial = classic_assists(&pool, challenge, player, None)
        .await
        .unwrap();
    assert_eq!(initial.remaining_hints, 0);
    assert!(initial.hints.is_empty());
    for column in ["name", "id", "answerModelId", "missing", "categories"] {
        assert!(matches!(
            classic_assists(&pool, challenge, player, Some(column)).await,
            Err(AppError::Validation(_))
        ));
    }
    assert!(matches!(
        classic_assists(&pool, challenge, player, Some("release")).await,
        Err(AppError::Conflict(_))
    ));
    miss(&pool, challenge, player).await;
    assert!(matches!(
        classic_assists(&pool, challenge, player, Some("provider")).await,
        Err(AppError::Conflict(_))
    ));
    let next = classic_assists(&pool, challenge, player, Some("release"))
        .await
        .unwrap();
    assert_eq!(next.hints.len(), 1);
    assert_eq!(next.hints[0].value, serde_json::json!(2024));
    assert_eq!(next.remaining_hints, 0);
    assert!(!next.available_columns.contains(&"release".to_owned()));
    let (first, second) = tokio::join!(
        classic_assists(&pool, challenge, player, Some("release")),
        classic_assists(&pool, challenge, player, Some("release"))
    );
    assert_eq!(first.unwrap().hints.len(), 1);
    assert_eq!(second.unwrap().hints.len(), 1);
    assert!(matches!(
        classic_assists(&pool, challenge, player, Some("contextWindowTokens")).await,
        Err(AppError::Conflict(_))
    ));
    let other = classic_assists(&pool, challenge, Uuid::new_v4(), None)
        .await
        .unwrap();
    assert!(other.hints.is_empty());
    assert!(matches!(
        classic_assists(&pool, Uuid::new_v4(), player, None).await,
        Err(AppError::NotFound(_))
    ));
    for mode in [
        "classic:llm:challenge",
        "classic:hardcore:hardcore",
        "emoji:normal",
    ] {
        sqlx::query("UPDATE daily_challenges SET mode = ? WHERE id = ?")
            .bind(mode)
            .bind(challenge.to_string())
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            classic_assists(&pool, challenge, player, None)
                .await
                .is_err()
        );
    }
}

#[tokio::test]
async fn classic_all_supported_column_value_types_and_solved_replay() {
    for (column, expected) in [
        ("provider", serde_json::json!("Provider")),
        ("family", serde_json::json!([])),
        ("release", serde_json::json!(2024)),
        ("toolUse", serde_json::json!(true)),
        ("architecture", serde_json::json!(["Transformer"])),
        ("contextWindowTokens", Value::Null),
    ] {
        let (pool, challenge, player) = fixture().await;
        if column == "architecture" {
            sqlx::query("INSERT INTO categories (id,name,slug) VALUES ('nlp','NLP','nlp')")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("UPDATE daily_challenges SET mode = 'classic:nlp:normal' WHERE id = ?")
                .bind(challenge.to_string())
                .execute(&pool)
                .await
                .unwrap();
        }
        let answer: String =
            sqlx::query_scalar("SELECT answer_model_id FROM daily_challenges WHERE id = ?")
                .bind(challenge.to_string())
                .fetch_one(&pool)
                .await
                .unwrap();
        sqlx::query(
            "INSERT INTO model_game_metadata (model_id,category_details_json,updated_at) VALUES (?,?,0)",
        )
        .bind(&answer)
        .bind(r#"{"language-model":{"toolUse":true},"nlp":{"architecture":["Transformer"]}}"#)
        .execute(&pool)
        .await
        .unwrap();
        super::super::ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
            .await
            .unwrap();
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,0,'{}',0)")
            .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(challenge.to_string()).bind(player.to_string()).bind("model-1").execute(&pool).await.unwrap();
        let hint = classic_assists(&pool, challenge, player, Some(column))
            .await
            .unwrap();
        assert_eq!(hint.hints[0].value, expected, "{column}");
        sqlx::query("UPDATE guess_events SET is_correct = 1 WHERE challenge_id = ?")
            .bind(challenge.to_string())
            .execute(&pool)
            .await
            .unwrap();
        let solved = classic_assists(&pool, challenge, player, Some(column))
            .await
            .unwrap();
        assert!(solved.available_columns.is_empty());
        assert_eq!(solved.remaining_hints, 0);
        assert!(matches!(
            classic_assists(&pool, challenge, player, Some("country")).await,
            Err(AppError::Conflict(_))
        ));
    }
}

#[tokio::test]
async fn timeline_thresholds_selected_positions_locking_replays_and_secrecy() {
    for (difficulty, threshold) in [
        (TimelineDifficulty::Normal, 3),
        (TimelineDifficulty::Challenge, 5),
    ] {
        let (pool, _, player) = fixture().await;
        let challenge = timeline_fixture(&pool, difficulty).await;
        assert!(matches!(
            timeline_assists(&pool, challenge, player, Some("unknown")).await,
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            timeline_assists(&pool, challenge, player, Some("card-0")).await,
            Err(AppError::Conflict(_))
        ));
        for i in 1..=threshold * 3 {
            timeline_miss(&pool, challenge, player).await;
            let state = timeline_assists(&pool, challenge, player, None)
                .await
                .unwrap();
            assert_eq!(state.remaining_auto_placements, i / threshold);
            assert_eq!(state.incorrect_submissions, i);
            assert!(state.auto_placements.is_empty());
            assert_eq!(
                state.available_card_ids,
                ["card-3", "card-5", "card-1", "card-2", "card-4"]
            );
            if i < threshold {
                assert!(matches!(
                    timeline_assists(&pool, challenge, player, Some("card-3")).await,
                    Err(AppError::Conflict(_))
                ));
            }
        }
        let placed = timeline_assists(&pool, challenge, player, Some("card-3"))
            .await
            .unwrap();
        assert_eq!(placed.auto_placements.len(), 1);
        assert_eq!(placed.auto_placements[0].position, 3);
        assert_eq!(placed.remaining_auto_placements, 2);
        assert!(!placed.available_card_ids.contains(&"card-3".into()));
        let (a, b) = tokio::join!(
            timeline_assists(&pool, challenge, player, Some("card-3")),
            timeline_assists(&pool, challenge, player, Some("card-3"))
        );
        assert_eq!(a.unwrap().remaining_auto_placements, 2);
        assert_eq!(b.unwrap().remaining_auto_placements, 2);
        let illegal = super::super::timeline::process_timeline_attempt(
            &pool,
            super::super::timeline::TimelineAttemptInput {
                challenge_id: challenge,
                player_id: player,
                user_id: None,
                hardcore_access: false,
                request_id: Uuid::new_v4(),
                model_order: ["card-0", "card-2", "card-3", "card-4", "card-5", "card-1"]
                    .map(str::to_owned)
                    .to_vec(),
            },
        )
        .await;
        assert!(matches!(illegal, Err(AppError::Validation(_))));
        let other = timeline_assists(&pool, challenge, Uuid::new_v4(), None)
            .await
            .unwrap();
        assert!(other.auto_placements.is_empty());
        sqlx::query("UPDATE timeline_attempts SET is_correct = 1 WHERE challenge_id = ?")
            .bind(challenge.to_string())
            .execute(&pool)
            .await
            .unwrap();
        let solved = timeline_assists(&pool, challenge, player, Some("card-3"))
            .await
            .unwrap();
        assert_eq!(solved.remaining_auto_placements, 0);
        assert!(solved.available_card_ids.is_empty());
        assert!(matches!(
            timeline_assists(&pool, challenge, player, Some("card-1")).await,
            Err(AppError::Conflict(_))
        ));
    }
    let (pool, _, player) = fixture().await;
    for difficulty in [TimelineDifficulty::Hardcore, TimelineDifficulty::Speedrun] {
        let challenge = timeline_fixture(&pool, difficulty).await;
        assert!(matches!(
            timeline_assists(&pool, challenge, player, None).await,
            Err(AppError::Forbidden(_))
        ));
    }
    assert!(matches!(
        timeline_assists(&pool, Uuid::new_v4(), player, None).await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn player_assistance_merge_deduplicates_and_retains_remaining_credits() {
    let (pool, challenge, player) = fixture().await;
    let canonical = Uuid::new_v4();
    miss(&pool, challenge, player).await;
    miss(&pool, challenge, canonical).await;
    classic_assists(&pool, challenge, player, Some("release"))
        .await
        .unwrap();
    classic_assists(&pool, challenge, canonical, Some("release"))
        .await
        .unwrap();
    let timeline = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    for _ in 0..3 {
        timeline_miss(&pool, timeline, player).await;
        timeline_miss(&pool, timeline, canonical).await;
    }
    timeline_assists(&pool, timeline, player, Some("card-1"))
        .await
        .unwrap();
    timeline_assists(&pool, timeline, canonical, Some("card-2"))
        .await
        .unwrap();
    let mut connection = pool.acquire().await.unwrap();
    merge_player_assists(&mut connection, &player.to_string(), &canonical.to_string())
        .await
        .unwrap();
    merge_player_assists(&mut connection, &player.to_string(), &canonical.to_string())
        .await
        .unwrap();
    drop(connection);
    assert_eq!(
        classic_assists(&pool, challenge, canonical, None)
            .await
            .unwrap()
            .hints
            .len(),
        1
    );
    assert_eq!(
        timeline_assists(&pool, timeline, canonical, None)
            .await
            .unwrap()
            .auto_placements
            .len(),
        2
    );
    assert!(
        classic_assists(&pool, challenge, player, None)
            .await
            .unwrap()
            .hints
            .is_empty()
    );
}

#[tokio::test]
async fn sign_in_reconciliation_transfers_server_earned_assists_idempotently() {
    let (pool, classic, guest) = fixture().await;
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('user','one@example.test','one@example.test',0,0)").execute(&pool).await.unwrap();
    let canonical = Uuid::new_v4();
    crate::progress::canonical_player_id(&pool, "user", canonical, 0)
        .await
        .unwrap();
    miss(&pool, classic, guest).await;
    classic_assists(&pool, classic, guest, Some("release"))
        .await
        .unwrap();
    let timeline = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    for _ in 0..9 {
        timeline_miss(&pool, timeline, guest).await;
    }
    for card in ["card-1", "card-2", "card-3"] {
        timeline_assists(&pool, timeline, guest, Some(card))
            .await
            .unwrap();
    }
    let request = serde_json::from_value(serde_json::json!({
        "version": 1, "playerId": guest,
        "preferences": { "hasSeenClassicHowToPlay": true, "innerCircleActive": false, "hellMode": false, "hasAutoplayedHardcoreSoundtrack": false }
    })).unwrap();
    crate::progress::synchronize(&pool, "user", &request, 1)
        .await
        .unwrap();
    crate::progress::synchronize(&pool, "user", &request, 2)
        .await
        .unwrap();
    assert_eq!(
        classic_assists(&pool, classic, canonical, None)
            .await
            .unwrap()
            .hints
            .len(),
        1
    );
    assert_eq!(
        timeline_assists(&pool, timeline, canonical, None)
            .await
            .unwrap()
            .auto_placements
            .len(),
        3
    );
    assert!(
        timeline_assists(&pool, timeline, guest, None)
            .await
            .unwrap()
            .auto_placements
            .is_empty()
    );
    let indices: Vec<i64> = sqlx::query_scalar("SELECT unlock_index FROM player_timeline_auto_placements WHERE player_id = ? ORDER BY unlock_index")
        .bind(canonical.to_string()).fetch_all(&pool).await.unwrap();
    assert_eq!(indices, [1, 2, 3]);
}
