use super::*;
use crate::{
    domain::timeline::TimelineDifficulty,
    repository::{
        GuessInput,
        assists::tests::{fixture, timeline_fixture},
        emoji, logo, timeline,
    },
};
use sqlx::Connection;
use time::macros::{date, datetime};

fn millis(instant: OffsetDateTime) -> i64 {
    (instant.unix_timestamp_nanos() / 1_000_000) as i64
}

fn today() -> Date {
    OffsetDateTime::now_utc().date()
}

fn days_ago(days: i64) -> String {
    format_date(today() - time::Duration::days(days)).unwrap()
}

async fn day(pool: &SqlitePool, player: Uuid, family: &str, date: &str) {
    super::super::ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    sqlx::query("INSERT OR IGNORE INTO player_game_streak_days VALUES (?,?,?,0)")
        .bind(player.to_string())
        .bind(family)
        .bind(date)
        .execute(pool)
        .await
        .unwrap();
}

async fn classic_answer(pool: &SqlitePool, challenge: Uuid) -> String {
    sqlx::query_scalar("SELECT answer_model_id FROM daily_challenges WHERE id = ?")
        .bind(challenge.to_string())
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn solve_classic(pool: &SqlitePool, challenge: Uuid, player: Uuid, request: Uuid) {
    let answer = classic_answer(pool, challenge).await;
    super::super::process_guess(
        pool,
        GuessInput {
            challenge_id: challenge,
            player_id: player,
            user_id: None,
            request_id: request,
            guessed_model_id: answer,
            attempt_number: 1,
        },
    )
    .await
    .unwrap();
}

async fn solve_timeline(pool: &SqlitePool, challenge: Uuid, player: Uuid) {
    let outcome = timeline::process_timeline_attempt(
        pool,
        timeline::TimelineAttemptInput {
            challenge_id: challenge,
            player_id: player,
            user_id: None,
            hardcore_access: true,
            request_id: Uuid::new_v4(),
            model_order: (0..6).map(|index| format!("card-{index}")).collect(),
        },
    )
    .await
    .unwrap();
    assert!(outcome.placements.iter().all(|placement| *placement == 1));
}

async fn dated_timeline(pool: &SqlitePool, difficulty: TimelineDifficulty, date: &str) -> Uuid {
    let challenge = timeline_fixture(pool, difficulty).await;
    sqlx::query("UPDATE timeline_challenges SET challenge_date = ? WHERE id = ?")
        .bind(date)
        .bind(challenge.to_string())
        .execute(pool)
        .await
        .unwrap();
    challenge
}

// The assertions compare against the server clock, so a run that straddles 00:00 UTC
// would test a different day than it set up
macro_rules! skip_if_the_day_changed {
    ($today:expr) => {
        if today() != $today {
            return;
        }
    };
}

#[tokio::test]
async fn classic_completion_counts_once_per_day_and_retries_are_idempotent() {
    let (pool, challenge, player) = fixture().await;
    let today = today();
    sqlx::query("UPDATE daily_challenges SET challenge_date = ? WHERE id = ?")
        .bind(format_date(today).unwrap())
        .bind(challenge.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let request = Uuid::new_v4();
    for _ in 0..2 {
        solve_classic(&pool, challenge, player, request).await;
    }
    skip_if_the_day_changed!(today);
    let response = game_streaks(&pool, player, today).await.unwrap();
    assert_eq!(response.classic.current_streak, 1);
    assert_eq!(response.classic.longest_streak, 1);
    assert!(response.classic.secured_today);
    assert_eq!(
        response.classic.last_streak_date,
        Some(format_date(today).unwrap())
    );
    assert_eq!(response.timeline.current_streak, 0);
    assert_eq!(response.emoji.current_streak, 0);
    assert_eq!(response.logo.current_streak, 0);

    // Another category on the same day belongs to the same family streak day
    let extra = Uuid::new_v4();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) SELECT ?,challenge_date,'classic:llm:challenge',answer_model_id,1,0,'test' FROM daily_challenges WHERE id = ?")
        .bind(extra.to_string()).bind(challenge.to_string()).execute(&pool).await.unwrap();
    solve_classic(&pool, extra, player, Uuid::new_v4()).await;
    let days: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_game_streak_days")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(days, 1);
    assert_eq!(
        game_streaks(&pool, player, today)
            .await
            .unwrap()
            .classic
            .current_streak,
        1
    );
    assert_eq!(
        game_streaks(&pool, Uuid::new_v4(), today)
            .await
            .unwrap()
            .classic
            .current_streak,
        0
    );
}

#[tokio::test]
async fn a_past_classic_game_never_secures_extends_or_repairs_a_streak() {
    let (pool, challenge, player) = fixture().await;
    let today = today();
    day(&pool, player, "classic", &days_ago(3)).await;
    day(&pool, player, "classic", &days_ago(2)).await;
    // Yesterday was missed and is solved today through history
    sqlx::query("UPDATE daily_challenges SET challenge_date = ? WHERE id = ?")
        .bind(days_ago(1))
        .bind(challenge.to_string())
        .execute(&pool)
        .await
        .unwrap();
    solve_classic(&pool, challenge, player, Uuid::new_v4()).await;
    skip_if_the_day_changed!(today);
    let after_history = game_streaks(&pool, player, today).await.unwrap().classic;
    assert_eq!(after_history.current_streak, 0);
    assert_eq!(after_history.longest_streak, 2);
    assert_eq!(after_history.last_streak_date, Some(days_ago(2)));
    assert!(!after_history.secured_today);
    let completions: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM guess_events WHERE is_correct = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(completions, 1);

    // Today's real game still starts a fresh streak afterwards
    let current = Uuid::new_v4();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) SELECT ?,?,'classic:llm:challenge',answer_model_id,1,0,'test' FROM daily_challenges WHERE id = ?")
        .bind(current.to_string()).bind(format_date(today).unwrap()).bind(challenge.to_string()).execute(&pool).await.unwrap();
    solve_classic(&pool, current, player, Uuid::new_v4()).await;
    skip_if_the_day_changed!(today);
    let secured = game_streaks(&pool, player, today).await.unwrap().classic;
    assert_eq!(secured.current_streak, 1);
    assert_eq!(secured.longest_streak, 2);
    assert!(secured.secured_today);
}

#[tokio::test]
async fn timeline_streak_follows_real_attempts_in_any_mode() {
    let (pool, _, player) = fixture().await;
    let today = today();
    let today_text = format_date(today).unwrap();
    day(&pool, player, "timeline", &days_ago(1)).await;

    let old = dated_timeline(&pool, TimelineDifficulty::Normal, &days_ago(5)).await;
    solve_timeline(&pool, old, player).await;
    skip_if_the_day_changed!(today);
    let before = game_streaks(&pool, player, today).await.unwrap().timeline;
    assert_eq!(before.current_streak, 1);
    assert!(!before.secured_today);

    // Speedrun alone keeps the Timeline streak alive
    let speedrun = dated_timeline(&pool, TimelineDifficulty::Speedrun, &today_text).await;
    timeline::start_speedrun(&pool, speedrun, player)
        .await
        .unwrap();
    solve_timeline(&pool, speedrun, player).await;
    let hardcore = dated_timeline(&pool, TimelineDifficulty::Hardcore, &today_text).await;
    solve_timeline(&pool, hardcore, player).await;
    skip_if_the_day_changed!(today);
    let state = game_streaks(&pool, player, today).await.unwrap();
    assert_eq!(state.timeline.current_streak, 2);
    assert!(state.timeline.secured_today);
    assert_eq!(state.classic.current_streak, 0);
    let days: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM player_game_streak_days WHERE game_type = 'timeline'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(days, 2);
}

#[tokio::test]
async fn emoji_streak_follows_real_guesses_in_any_mode() {
    let (pool, catalog) = emoji::tests::pool_and_catalog().await;
    let player = Uuid::new_v4();
    let today = today();
    for (date, difficulty) in [
        (days_ago(4), "normal"),
        (format_date(today).unwrap(), "challenge"),
    ] {
        let data = emoji::game(&pool, &catalog, &date, difficulty, "secret")
            .await
            .unwrap();
        let wrong = catalog
            .eligible(0)
            .find(|entity| entity.id != data.challenge.answer_entity_id)
            .unwrap()
            .id
            .clone();
        for (attempt, guess, correct) in [
            (1, wrong, false),
            (2, data.challenge.answer_entity_id.clone(), true),
        ] {
            let outcome = emoji::process_guess(
                &pool,
                &catalog,
                emoji::VisualGuessInput {
                    challenge_id: Uuid::parse_str(&data.challenge.id).unwrap(),
                    player_id: player,
                    user_id: None,
                    request_id: Uuid::new_v4(),
                    guessed_entity_id: guess,
                    attempt_number: attempt,
                },
            )
            .await
            .unwrap();
            assert_eq!(outcome.is_correct, correct);
        }
        skip_if_the_day_changed!(today);
        let streak = game_streaks(&pool, player, today).await.unwrap().emoji;
        let is_today = date == format_date(today).unwrap();
        assert_eq!(streak.current_streak, i64::from(is_today));
        assert_eq!(streak.secured_today, is_today);
    }
    let state = game_streaks(&pool, player, today).await.unwrap();
    assert_eq!(state.classic.current_streak, 0);
    assert_eq!(state.logo.current_streak, 0);
}

#[tokio::test]
async fn logo_streak_follows_real_guesses() {
    let (pool, catalog) = logo::tests::pool_and_catalog().await;
    let player = Uuid::new_v4();
    let today = today();
    for date in [days_ago(2), format_date(today).unwrap()] {
        let data = logo::game(&pool, &catalog, &date, "normal", "secret", player)
            .await
            .unwrap();
        let outcome = logo::process_guess(
            &pool,
            &catalog,
            logo::LogoGuessInput {
                challenge_id: Uuid::parse_str(&data.challenge.id).unwrap(),
                player_id: player,
                user_id: None,
                request_id: Uuid::new_v4(),
                guessed_model_id: data.challenge.answer_model_id.clone(),
                attempt_number: 1,
            },
        )
        .await
        .unwrap();
        assert!(outcome.is_correct);
        skip_if_the_day_changed!(today);
        let streak = game_streaks(&pool, player, today).await.unwrap().logo;
        let is_today = date == format_date(today).unwrap();
        assert_eq!(streak.current_streak, i64::from(is_today));
        assert_eq!(streak.secured_today, is_today);
    }
    assert_eq!(
        game_streaks(&pool, player, today)
            .await
            .unwrap()
            .emoji
            .current_streak,
        0
    );
}

// The day boundary is exercised with explicit server timestamps for every family
#[tokio::test]
async fn every_family_applies_the_same_rollover_rule() {
    let (pool, classic, _) = fixture().await;
    for entity in ["entity-1", "entity-2", "entity-3"] {
        sqlx::query(
            "INSERT INTO visual_clue_entities VALUES (?,'Entity','[]','emoji','[]',0,'{}',0)",
        )
        .bind(entity)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query("INSERT INTO visual_clue_challenges VALUES ('emoji','2026-09-30','emoji:challenge','entity-1','v',1,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO logo_challenges VALUES ('logo','2026-09-30','logo:normal','model','asset',1,0)").execute(&pool).await.unwrap();
    let timeline = timeline_fixture(&pool, TimelineDifficulty::Speedrun)
        .await
        .to_string();
    let classic = classic.to_string();

    let last_instant = millis(datetime!(2026-09-30 23:59:59.999 UTC));
    let midnight = millis(datetime!(2026-10-01 00:00 UTC));
    let in_grace = millis(datetime!(2026-10-01 00:59:59.999 UTC));
    let grace_over = millis(datetime!(2026-10-01 01:00 UTC));
    let on_day = Some(millis(datetime!(2026-09-30 23:50 UTC)));
    for (family, challenge) in [
        (GameFamily::Classic, classic.as_str()),
        (GameFamily::Emoji, "emoji"),
        (GameFamily::Logo, "logo"),
        (GameFamily::Timeline, timeline.as_str()),
    ] {
        for (started_at, completed_at, expected) in [
            (None, last_instant, true),
            (None, midnight, false),
            (on_day, midnight, true),
            (on_day, in_grace, true),
            (on_day, grace_over, false),
            (Some(midnight), in_grace, false),
            (on_day, millis(datetime!(2026-10-03 12:00 UTC)), false),
        ] {
            let player = Uuid::new_v4();
            let mut connection = pool.acquire().await.unwrap();
            super::super::ensure_anonymous_player(&mut connection, player, 0)
                .await
                .unwrap();
            // The earlier miss proves when the player started; the win is stored last,
            // exactly like the completion paths do before recording the day
            for (created_at, correct) in started_at
                .map(|started| (started, 0))
                .into_iter()
                .chain([(completed_at, 1)])
            {
                let id = Uuid::new_v4().to_string();
                let insert = match family {
                    GameFamily::Classic => {
                        "INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?1,?1,?2,?3,'model-' || ?4,?4,?5,'{}',?6)"
                    }
                    GameFamily::Emoji => {
                        "INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?1,?1,?2,?3,'entity-' || ?4,?4,?5,?6)"
                    }
                    GameFamily::Logo => {
                        "INSERT INTO logo_guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,created_at) VALUES (?1,?1,?2,?3,?1,?4,?5,?6)"
                    }
                    GameFamily::Timeline => {
                        "INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?1,?1,?2,?3,'[]','[]',?4,?5,?6)"
                    }
                };
                sqlx::query(insert)
                    .bind(&id)
                    .bind(challenge)
                    .bind(player.to_string())
                    .bind(correct + 1)
                    .bind(correct)
                    .bind(created_at)
                    .execute(&mut *connection)
                    .await
                    .unwrap();
            }
            for _ in 0..2 {
                record_completion(
                    &mut connection,
                    family,
                    player,
                    challenge,
                    "2026-09-30",
                    completed_at,
                )
                .await
                .unwrap();
            }
            drop(connection);
            let state = game_streaks(&pool, player, date!(2026 - 10 - 01))
                .await
                .unwrap();
            let streak = match family {
                GameFamily::Classic => state.classic,
                GameFamily::Emoji => state.emoji,
                GameFamily::Logo => state.logo,
                GameFamily::Timeline => state.timeline,
            };
            assert_eq!(
                streak.last_streak_date.as_deref(),
                expected.then_some("2026-09-30"),
                "{family:?} started {started_at:?} completed {completed_at}"
            );
            assert_eq!(streak.current_streak, i64::from(expected));
            // A day earned through the grace window never secures the next day
            assert!(!streak.secured_today);
        }
    }

    // A Speedrun started on its day and finished just after midnight still counts
    let player = Uuid::new_v4();
    let mut connection = pool.acquire().await.unwrap();
    super::super::ensure_anonymous_player(&mut connection, player, 0)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO timeline_speedrun_starts (challenge_id, player_id, started_at) VALUES (?, ?, ?)",
    )
    .bind(&timeline)
    .bind(player.to_string())
    .bind(on_day)
    .execute(&mut *connection)
    .await
    .unwrap();
    record_completion(
        &mut connection,
        GameFamily::Timeline,
        player,
        &timeline,
        "2026-09-30",
        midnight,
    )
    .await
    .unwrap();
    drop(connection);
    assert_eq!(
        game_streaks(&pool, player, date!(2026 - 10 - 01))
            .await
            .unwrap()
            .timeline
            .current_streak,
        1
    );
}

#[tokio::test]
async fn streak_migration_backfills_only_original_on_day_completions() {
    let (pool, classic, player) = fixture().await;
    super::super::ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    sqlx::raw_sql("DROP TABLE player_game_streak_days;")
        .execute(&pool)
        .await
        .unwrap();
    for entity in ["entity-1", "entity-2", "entity-3"] {
        sqlx::query(
            "INSERT INTO visual_clue_entities VALUES (?,'Entity','[]','emoji','[]',0,'{}',0)",
        )
        .bind(entity)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query("INSERT INTO visual_clue_challenges VALUES ('emoji','2026-09-30','emoji:challenge','entity-1','v',1,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO logo_challenges VALUES ('logo','2026-09-30','logo:normal','model','asset',1,0)").execute(&pool).await.unwrap();
    let timeline = timeline_fixture(&pool, TimelineDifficulty::Normal).await;
    let on_day = millis(datetime!(2026-09-30 00:00 UTC));
    // A second on-day win in another category and a win one day late
    let other_category = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) SELECT ?,challenge_date,'classic:cv:challenge',answer_model_id,1,0,'test' FROM daily_challenges WHERE id = ?")
        .bind(&other_category).bind(classic.to_string()).execute(&pool).await.unwrap();
    for (challenge, model, timestamp) in [
        (classic.to_string(), "model-1", on_day + 5_000),
        (other_category, "model-1", on_day + 1_000),
        (classic.to_string(), "model-2", on_day + 86_400_000),
    ] {
        let event = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,1,'{}',?)")
            .bind(&event).bind(&event).bind(challenge).bind(player.to_string()).bind(model).bind(timestamp).execute(&pool).await.unwrap();
    }
    for (offset, correct, entity) in [
        (0, 1, "entity-1"),
        (86_400_000, 1, "entity-2"),
        (10, 0, "entity-3"),
    ] {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?1,?1,'emoji',?2,?5,1,?3,?4)")
            .bind(&id).bind(player.to_string()).bind(correct).bind(on_day + offset).bind(entity).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO logo_guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,created_at) VALUES (?1,?1,'logo',?2,?1,1,?3,?4)")
            .bind(&id).bind(player.to_string()).bind(correct).bind(on_day + offset).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?1,?1,?2,?3,'[]','[]',?4,?5,?6)")
            .bind(&id).bind(timeline.to_string()).bind(player.to_string()).bind(offset + 1).bind(correct).bind(on_day + offset).execute(&pool).await.unwrap();
    }
    for _ in 0..2 {
        sqlx::raw_sql("DROP TABLE IF EXISTS player_game_streak_days;")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../../../migrations/0025_game_streak_days.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
    }
    let rows = sqlx::query_as::<_, (String, String, i64)>(
        "SELECT game_type, game_date, completed_at FROM player_game_streak_days ORDER BY game_type",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        rows,
        [
            (
                "classic".to_owned(),
                "2026-09-30".to_owned(),
                on_day + 1_000
            ),
            ("emoji".to_owned(), "2026-09-30".to_owned(), on_day),
            ("logo".to_owned(), "2026-09-30".to_owned(), on_day),
            ("timeline".to_owned(), "2026-09-30".to_owned(), on_day),
        ]
    );
    let state = game_streaks(&pool, player, date!(2026 - 09 - 30))
        .await
        .unwrap();
    assert_eq!(state.classic.current_streak, 1);
    // The migration no longer installs triggers; Rust owns the rule for new events
    let triggers: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%streak%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(triggers, 0);
}

#[tokio::test]
async fn deleting_the_winning_guess_revokes_a_day_no_other_completion_earned() {
    let (pool, challenge, player) = fixture().await;
    let today = today();
    let date = format_date(today).unwrap();
    sqlx::query("UPDATE daily_challenges SET challenge_date = ? WHERE id = ?")
        .bind(&date)
        .bind(challenge.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let other = Uuid::new_v4();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) SELECT ?,challenge_date,'classic:llm:challenge',answer_model_id,1,0,'test' FROM daily_challenges WHERE id = ?")
        .bind(other.to_string()).bind(challenge.to_string()).execute(&pool).await.unwrap();
    solve_classic(&pool, challenge, player, Uuid::new_v4()).await;
    solve_classic(&pool, other, player, Uuid::new_v4()).await;
    skip_if_the_day_changed!(today);
    let mut connection = pool.acquire().await.unwrap();
    for (deleted, remaining_days) in [(challenge, 1), (other, 0)] {
        sqlx::query("DELETE FROM guess_events WHERE challenge_id = ?")
            .bind(deleted.to_string())
            .execute(&mut *connection)
            .await
            .unwrap();
        revoke_unearned_classic_day(&mut connection, &player.to_string(), &date)
            .await
            .unwrap();
        let days: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_game_streak_days")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        assert_eq!(days, remaining_days);
    }
    assert!(
        revoke_unearned_classic_day(&mut connection, &player.to_string(), "not-a-date")
            .await
            .is_err()
    );
}

#[tokio::test]
async fn merging_qualifying_dates_reconstructs_contiguous_history_and_preserves_gaps() {
    let (pool, _, remote) = fixture().await;
    let guest = Uuid::new_v4();
    for date in ["2026-08-28", "2026-08-29"] {
        day(&pool, remote, "classic", date).await;
    }
    for date in ["2026-08-30", "2026-08-31", "2026-09-01"] {
        day(&pool, guest, "classic", date).await;
    }
    for date in ["2026-08-25", "2026-08-26", "2026-08-27"] {
        day(&pool, remote, "emoji", date).await;
    }
    for date in ["2026-08-30", "2026-08-31", "2026-09-01"] {
        day(&pool, guest, "emoji", date).await;
    }
    for _ in 0..2 {
        merge_streak_days(
            &mut pool.acquire().await.unwrap(),
            &guest.to_string(),
            &remote.to_string(),
        )
        .await
        .unwrap();
    }
    let state = game_streaks(&pool, remote, date!(2026 - 09 - 01))
        .await
        .unwrap();
    assert_eq!(state.classic.current_streak, 5);
    assert_eq!(state.emoji.current_streak, 3);
    assert_eq!(state.emoji.longest_streak, 3);
    assert_eq!(
        game_streaks(&pool, guest, date!(2026 - 09 - 01))
            .await
            .unwrap()
            .classic
            .last_streak_date,
        None
    );
    sqlx::query("INSERT INTO users (id,email,email_normalized,created_at,updated_at) VALUES ('user','streak@example.test','streak@example.test',0,0)").execute(&pool).await.unwrap();
    crate::progress::canonical_player_id(&pool, "user", remote, 0)
        .await
        .unwrap();
    day(&pool, guest, "classic", "2026-09-02").await;
    let request = serde_json::from_value(serde_json::json!({
        "version":1, "playerId":guest,
        "preferences":{"hasSeenClassicHowToPlay":true,"innerCircleActive":false,"hellMode":false,"hasAutoplayedHardcoreSoundtrack":false}
    })).unwrap();
    for now in [1, 2] {
        crate::progress::synchronize(&pool, "user", &request, now)
            .await
            .unwrap();
    }
    assert_eq!(
        game_streaks(&pool, remote, date!(2026 - 09 - 02))
            .await
            .unwrap()
            .classic
            .current_streak,
        6
    );
    // The column only accepts date-shaped values
    assert!(
        sqlx::query("INSERT INTO player_game_streak_days VALUES (?,'timeline','bad',0)")
            .bind(remote.to_string())
            .execute(&pool)
            .await
            .is_err()
    );
    // A date-shaped value that is not a calendar date is reported, never skipped
    day(&pool, remote, "timeline", "2000-99-99").await;
    assert!(
        game_streaks(&pool, remote, date!(2026 - 09 - 01))
            .await
            .is_err()
    );
    pool.close().await;
    assert!(
        game_streaks(&pool, remote, date!(2026 - 09 - 01))
            .await
            .is_err()
    );
    assert!(
        merge_streak_days(
            &mut sqlx::SqliteConnection::connect("sqlite::memory:")
                .await
                .unwrap(),
            "a",
            "b"
        )
        .await
        .is_err()
    );
}
