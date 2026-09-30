use super::*;
use crate::repository::{
    GuessInput,
    assists::tests::{fixture, timeline_fixture},
};
use sqlx::Connection;
use time::macros::date;

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

#[tokio::test]
async fn classic_completion_trigger_uses_server_timestamp_and_retries_are_idempotent() {
    let (pool, challenge, player) = fixture().await;
    let today = time::OffsetDateTime::now_utc().date();
    sqlx::query("UPDATE daily_challenges SET challenge_date = ? WHERE id = ?")
        .bind(format_date(today).unwrap())
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
    let request = Uuid::new_v4();
    for _ in 0..2 {
        super::super::process_guess(
            &pool,
            GuessInput {
                challenge_id: challenge,
                player_id: player,
                user_id: None,
                request_id: request,
                guessed_model_id: answer.clone(),
                attempt_number: 1,
            },
        )
        .await
        .unwrap();
    }
    let response = game_streaks(&pool, player, today).await.unwrap();
    assert_eq!(response.classic.current_streak, 1);
    assert!(response.classic.secured_today);
    assert_eq!(response.classic.qualifying_dates.len(), 1);
    // A different mode/category on the same day must not award a second streak day.
    let extra = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO daily_challenges (id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) SELECT ?,challenge_date,'classic:cv:challenge',answer_model_id,1,0,'test' FROM daily_challenges WHERE id = ?")
        .bind(&extra).bind(challenge.to_string()).execute(&pool).await.unwrap();
    let event = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,1,'{}',?)")
        .bind(&event).bind(&event).bind(&extra).bind(player.to_string()).bind(&answer).bind(super::super::now_unix_millis()).execute(&pool).await.unwrap();
    assert_eq!(
        game_streaks(&pool, player, today)
            .await
            .unwrap()
            .classic
            .current_streak,
        1
    );
    assert_eq!(response.timeline.current_streak, 0);
    assert_eq!(response.emoji.current_streak, 0);
    assert_eq!(response.logo.current_streak, 0);
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
async fn streak_migration_backfills_only_original_on_day_completions() {
    let (pool, classic, player) = fixture().await;
    super::super::ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    sqlx::raw_sql("DROP TRIGGER classic_streak_completion; DROP TRIGGER emoji_streak_completion; DROP TRIGGER logo_streak_completion; DROP TRIGGER timeline_streak_completion; DROP TABLE player_game_streak_days;").execute(&pool).await.unwrap();
    let on_day = date!(2026 - 09 - 30)
        .midnight()
        .assume_utc()
        .unix_timestamp()
        * 1000;
    for (model, timestamp) in [("model-1", on_day), ("model-2", on_day + 86400000)] {
        let event = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,?,?,1,1,'{}',?)")
            .bind(&event).bind(&event).bind(classic.to_string()).bind(player.to_string()).bind(model).bind(timestamp).execute(&pool).await.unwrap();
    }
    sqlx::raw_sql(include_str!(
        "../../../migrations/0025_game_streak_days.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let state = game_streaks(&pool, player, date!(2026 - 09 - 30))
        .await
        .unwrap();
    assert_eq!(state.classic.qualifying_dates, ["2026-09-30"]);
    assert_eq!(state.classic.current_streak, 1);
}

#[tokio::test]
async fn all_families_qualify_only_on_the_challenge_day_across_utc_midnight() {
    let (pool, classic, player) = fixture().await;
    super::super::ensure_anonymous_player(&mut pool.acquire().await.unwrap(), player, 0)
        .await
        .unwrap();
    let timestamp = date!(2026 - 09 - 30)
        .with_hms(23, 59, 59)
        .unwrap()
        .assume_utc()
        .unix_timestamp()
        * 1000
        + 999;
    sqlx::query(
        "INSERT INTO visual_clue_entities VALUES ('entity','Entity','[]','emoji','[]',0,'{}',0)",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO visual_clue_challenges VALUES ('emoji','2026-09-30','emoji:challenge','entity','v',1,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO logo_challenges VALUES ('logo','2026-09-30','logo:normal','model','asset',1,0)").execute(&pool).await.unwrap();
    let timeline =
        timeline_fixture(&pool, crate::domain::timeline::TimelineDifficulty::Speedrun).await;
    for (offset, correct) in [(1, 1), (0, 0), (0, 1)] {
        // A next-day completion and a wrong guess must not count, then an on-day win does.
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES (?,?,?,? ,?,1,?,'{}',?)")
            .bind(&id).bind(&id).bind(classic.to_string()).bind(player.to_string()).bind(format!("model-{}", offset + correct + 1)).bind(correct).bind(timestamp + offset).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO visual_clue_guess_events (id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES (?,?,'emoji',?,'entity',1,?,?)")
            .bind(&id).bind(&id).bind(player.to_string()).bind(correct).bind(timestamp + offset).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO logo_guess_events (id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,created_at) VALUES (?,?,'logo',?,?,1,?,?)")
            .bind(&id).bind(&id).bind(player.to_string()).bind(&id).bind(correct).bind(timestamp + offset).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?,'[]','[]',?,?,?)")
            .bind(&id).bind(&id).bind(timeline.to_string()).bind(player.to_string()).bind(offset + correct + 1).bind(correct).bind(timestamp + offset).execute(&pool).await.unwrap();
        let state = game_streaks(&pool, player, date!(2026 - 09 - 30))
            .await
            .unwrap();
        for family in [state.classic, state.timeline, state.emoji, state.logo] {
            assert_eq!(
                family.current_streak,
                if offset == 0 && correct == 1 { 1 } else { 0 }
            );
        }
        // Keep independent attempted-guess identities for the next synthetic event.
        sqlx::query("DELETE FROM visual_clue_guess_events")
            .execute(&pool)
            .await
            .unwrap();
    }
    let tomorrow = game_streaks(&pool, player, date!(2026 - 10 - 01))
        .await
        .unwrap();
    assert!(!tomorrow.emoji.secured_today);
    assert_eq!(tomorrow.emoji.current_streak, 1);
    assert_eq!(
        game_streaks(&pool, player, date!(2026 - 10 - 02))
            .await
            .unwrap()
            .emoji
            .current_streak,
        0
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
    assert!(
        game_streaks(&pool, guest, date!(2026 - 09 - 01))
            .await
            .unwrap()
            .classic
            .qualifying_dates
            .is_empty()
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
    day(&pool, remote, "timeline", "bad").await;
    assert!(
        game_streaks(&pool, remote, date!(2026 - 09 - 01))
            .await
            .is_ok()
    ); // future strings are excluded
    sqlx::query(
        "UPDATE player_game_streak_days SET game_date = '2000-bad' WHERE game_type = 'timeline'",
    )
    .execute(&pool)
    .await
    .unwrap();
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
