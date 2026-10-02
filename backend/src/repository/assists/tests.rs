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
    let (challenge, player) = seed(&pool).await;
    (pool, challenge, player)
}

// A file database with several connections, so writers really contend for the lock
struct ContendedDatabase {
    pool: SqlitePool,
    path: std::path::PathBuf,
}

impl ContendedDatabase {
    async fn new() -> Self {
        let path = std::env::temp_dir().join(format!("aidle-assists-{}.db", Uuid::new_v4()));
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .busy_timeout(std::time::Duration::from_millis(50));
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await
            .unwrap();
        Self { pool, path }
    }
}

impl Drop for ContendedDatabase {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", self.path.display()));
        }
    }
}

async fn seed(pool: &SqlitePool) -> (Uuid, Uuid) {
    crate::db::migrate(pool).await.unwrap();
    sqlx::query("INSERT INTO providers (id,name,slug,country_code,is_active,created_at,updated_at) VALUES ('p','Provider','provider','US',1,0,0)").execute(pool).await.unwrap();
    sqlx::query("INSERT INTO categories (id,name,slug) VALUES ('language-model','Language model','language-model')").execute(pool).await.unwrap();
    for number in 1..=4 {
        let id = format!("model-{number}");
        sqlx::query("INSERT INTO models (id,provider_id,name,slug,release_date,release_year,local_execution,reasoning_support,status,is_guessable,verified_at,source_label,created_at,updated_at) VALUES (?,'p',?,?,?,2024,'unknown','yes','active',1,'test','test',0,0)")
            .bind(&id).bind(&id).bind(&id).bind(format!("2024-{:02}-01", number * 3)).execute(pool).await.unwrap();
        sqlx::query(
            "INSERT INTO model_categories (model_id,category_id) VALUES (?,'language-model')",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }
    let challenge = super::super::classic_game(
        pool,
        "2026-09-30",
        ClassicCategory::Llm,
        ClassicDifficulty::Normal,
        "secret",
        7,
    )
    .await
    .unwrap();
    (
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

fn assert_conflict<T: std::fmt::Debug>(result: AppResult<T>, expected: &str) {
    match result {
        Err(AppError::Conflict(code)) => assert_eq!(code, expected),
        other => panic!("expected {expected}, got {other:?}"),
    }
}

async fn seed_miss(pool: &SqlitePool, challenge: Uuid, player: Uuid) {
    super::super::ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,0,'{}',0)")
        .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(challenge.to_string()).bind(player.to_string()).bind("model-1").execute(pool).await.unwrap();
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
    assert_conflict(
        classic_assists(&pool, challenge, player, Some("release")).await,
        "HINT_NOT_AVAILABLE",
    );
    miss(&pool, challenge, player).await;
    assert_conflict(
        classic_assists(&pool, challenge, player, Some("provider")).await,
        "COLUMN_ALREADY_SOLVED",
    );
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
    assert_conflict(
        classic_assists(&pool, challenge, player, Some("contextWindowTokens")).await,
        "COLUMN_ALREADY_SOLVED",
    );
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
        .bind(if column == "architecture" {
            r#"{"nlp":{"architecture":["Transformer"]}}"#
        } else {
            r#"{"language-model":{"toolUse":true}}"#
        })
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
        assert_conflict(
            classic_assists(&pool, challenge, player, Some("country")).await,
            "COLUMN_ALREADY_SOLVED",
        );
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
        assert_conflict(
            timeline_assists(&pool, challenge, player, Some("card-0")).await,
            "CARD_ALREADY_RESOLVED",
        );
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
                assert_conflict(
                    timeline_assists(&pool, challenge, player, Some("card-3")).await,
                    "AUTO_PLACE_NOT_AVAILABLE",
                );
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
        assert_conflict(
            timeline_assists(&pool, challenge, player, Some("card-1")).await,
            "CARD_ALREADY_RESOLVED",
        );
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

// A model can carry details for several categories. The board and the comparison read
// shared columns through one fallback chain, so the hint has to follow the same chain
#[tokio::test]
async fn classic_hint_matches_the_value_the_comparison_reads_for_multi_category_models() {
    for (mode, details, column, expected) in [
        (
            "classic:object-detection:normal",
            r#"{"computer-vision":{"architecture":["detr","resnet-50"],"trainingDatasets":["imagenet-1k","coco-2017"]},"object-detection":{"architecture":["detr"],"trainingDatasets":["coco"]}}"#,
            "architecture",
            serde_json::json!(["detr", "resnet-50"]),
        ),
        (
            "classic:object-detection:normal",
            r#"{"computer-vision":{"architecture":["detr","resnet-50"],"trainingDatasets":["imagenet-1k","coco-2017"]},"object-detection":{"architecture":["detr"],"trainingDatasets":["coco"]}}"#,
            "trainingDatasets",
            serde_json::json!(["imagenet-1k", "coco-2017"]),
        ),
        (
            "classic:nlp:normal",
            r#"{"language-model":{"toolUse":true},"nlp":{"architecture":["encoder"],"supportedLanguages":["English"]}}"#,
            "architecture",
            serde_json::json!([]),
        ),
        (
            "classic:nlp:normal",
            r#"{"language-model":{"supportedLanguages":["Polish"]},"nlp":{"supportedLanguages":["English"]}}"#,
            "supportedLanguages",
            serde_json::json!(["Polish"]),
        ),
        (
            "classic:llm:normal",
            r#"{"language-model":{"multimodal":true}}"#,
            "toolUse",
            serde_json::json!(false),
        ),
        (
            "classic:llm:normal",
            r#"{"nlp":{"nlpTasks":["ner"]}}"#,
            "toolUse",
            serde_json::json!(false),
        ),
    ] {
        let (pool, challenge, player) = fixture().await;
        sqlx::query("UPDATE daily_challenges SET mode = ? WHERE id = ?")
            .bind(mode)
            .bind(challenge.to_string())
            .execute(&pool)
            .await
            .unwrap();
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
        .bind(details)
        .execute(&pool)
        .await
        .unwrap();
        seed_miss(&pool, challenge, player).await;
        let hint = classic_assists(&pool, challenge, player, Some(column))
            .await
            .unwrap();
        assert_eq!(hint.hints[0].value, expected, "{mode} {column}");

        // A guess whose column holds exactly the hinted value must compare as correct
        let mut connection = pool.acquire().await.unwrap();
        let answer = super::super::load_model(&mut connection, &answer, false)
            .await
            .unwrap()
            .unwrap()
            .comparable;
        let comparison = crate::domain::comparison::compare_models(&answer, &answer);
        assert_eq!(
            comparison.selected(&[column])[column],
            ComparisonResult::Correct
        );
        assert_eq!(
            category_detail_value(&answer.category_details, column),
            Some(expected)
        );
    }
}

// Two different columns compete for a single earned hint on separate connections
#[tokio::test]
async fn concurrent_reveals_of_different_targets_spend_one_credit() {
    let database = ContendedDatabase::new().await;
    let pool = database.pool.clone();
    let (challenge, player) = seed(&pool).await;
    seed_miss(&pool, challenge, player).await;
    let (release, country) = tokio::join!(
        classic_assists(&pool, challenge, player, Some("release")),
        classic_assists(&pool, challenge, player, Some("country"))
    );
    assert_eq!(
        [release.is_ok(), country.is_ok()]
            .iter()
            .filter(|ok| **ok)
            .count(),
        1
    );
    for result in [release, country] {
        if result.is_err() {
            assert_conflict(result, "HINT_NOT_AVAILABLE");
        }
    }
    let state = classic_assists(&pool, challenge, player, None)
        .await
        .unwrap();
    assert_eq!(state.hints.len(), 1);
    assert_eq!(state.remaining_hints, 0);

    let timeline = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    for _ in 0..3 {
        timeline_miss(&pool, timeline, player).await;
    }
    let (first, second) = tokio::join!(
        timeline_assists(&pool, timeline, player, Some("card-1")),
        timeline_assists(&pool, timeline, player, Some("card-2"))
    );
    assert_eq!(
        [first.is_ok(), second.is_ok()]
            .iter()
            .filter(|ok| **ok)
            .count(),
        1
    );
    for result in [first, second] {
        if result.is_err() {
            assert_conflict(result, "AUTO_PLACE_NOT_AVAILABLE");
        }
    }
    let state = timeline_assists(&pool, timeline, player, None)
        .await
        .unwrap();
    assert_eq!(state.auto_placements.len(), 1);
    assert_eq!(state.remaining_auto_placements, 0);
}

// Polling the state must never block on, or be blocked by, the single SQLite writer
#[tokio::test]
async fn reading_assist_state_does_not_take_the_writer_lock() {
    let database = ContendedDatabase::new().await;
    let pool = database.pool.clone();
    let (challenge, player) = seed(&pool).await;
    let timeline = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    let writer = pool.begin_with("BEGIN IMMEDIATE").await.unwrap();
    let started = std::time::Instant::now();
    classic_assists(&pool, challenge, player, None)
        .await
        .unwrap();
    timeline_assists(&pool, timeline, player, None)
        .await
        .unwrap();
    assert!(started.elapsed() < std::time::Duration::from_millis(40));
    drop(writer);
}

#[tokio::test]
async fn a_movable_card_already_placed_correctly_cannot_consume_a_credit() {
    let (pool, _, player) = fixture().await;
    let challenge = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    for _ in 0..3 {
        // card-1 is the only movable card on its own position
        let outcome = super::super::timeline::process_timeline_attempt(
            &pool,
            super::super::timeline::TimelineAttemptInput {
                challenge_id: challenge,
                player_id: player,
                user_id: None,
                hardcore_access: false,
                request_id: Uuid::new_v4(),
                model_order: ["card-0", "card-1", "card-3", "card-2", "card-5", "card-4"]
                    .map(str::to_owned)
                    .to_vec(),
            },
        )
        .await
        .unwrap();
        assert_eq!(outcome.placements, [1, 1, 0, 0, 0, 0]);
    }
    let state = timeline_assists(&pool, challenge, player, None)
        .await
        .unwrap();
    assert_eq!(state.remaining_auto_placements, 1);
    assert!(!state.available_card_ids.contains(&"card-1".to_owned()));
    assert_conflict(
        timeline_assists(&pool, challenge, player, Some("card-1")).await,
        "CARD_ALREADY_RESOLVED",
    );
    let after = timeline_assists(&pool, challenge, player, None)
        .await
        .unwrap();
    assert_eq!(after.remaining_auto_placements, 1);
    assert!(after.auto_placements.is_empty());
}

// A guest who only played Timeline never triggers the client progress upload, so the
// server has to adopt the guest player on the first authenticated request
#[tokio::test]
async fn first_authenticated_request_adopts_an_unlinked_guest_without_a_client_sync() {
    let (pool, classic, guest) = fixture().await;
    for (id, email) in [("user", "one@example.test"), ("other", "two@example.test")] {
        sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES (?,?,?,0,0)")
            .bind(id).bind(email).bind(email).execute(&pool).await.unwrap();
    }
    let canonical = Uuid::new_v4();
    crate::progress::canonical_player_id(&pool, "user", canonical, 0)
        .await
        .unwrap();
    let timeline = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    for _ in 0..3 {
        timeline_miss(&pool, timeline, guest).await;
    }
    timeline_assists(&pool, timeline, guest, Some("card-1"))
        .await
        .unwrap();
    miss(&pool, classic, guest).await;
    classic_assists(&pool, classic, guest, Some("release"))
        .await
        .unwrap();

    for now in [1, 2] {
        assert_eq!(
            crate::progress::canonical_player_id(&pool, "user", guest, now)
                .await
                .unwrap(),
            canonical
        );
    }
    let merged = timeline_assists(&pool, timeline, canonical, None)
        .await
        .unwrap();
    assert_eq!(merged.auto_placements.len(), 1);
    assert_eq!(merged.incorrect_submissions, 3);
    assert_eq!(
        classic_assists(&pool, classic, canonical, None)
            .await
            .unwrap()
            .hints
            .len(),
        1
    );

    // A player that belongs to one account is never pulled into another
    let other_primary = Uuid::new_v4();
    crate::progress::canonical_player_id(&pool, "other", other_primary, 3)
        .await
        .unwrap();
    assert_eq!(
        crate::progress::canonical_player_id(&pool, "other", guest, 4)
            .await
            .unwrap(),
        other_primary
    );
    assert_eq!(
        timeline_assists(&pool, timeline, canonical, None)
            .await
            .unwrap()
            .auto_placements
            .len(),
        1
    );
    assert!(
        timeline_assists(&pool, timeline, other_primary, None)
            .await
            .unwrap()
            .auto_placements
            .is_empty()
    );
}
