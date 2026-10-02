use super::*;
use crate::{
    domain::daily_completion::{VerifiedResult, registries, summarize},
    repository::assists::tests::fixture,
};

#[tokio::test]
async fn normalized_summary_requires_verified_rows_for_all_six_categories_and_standalone_games() {
    let (pool, _, player) = fixture().await;
    sqlx::query("INSERT INTO anonymous_players(id,created_at,last_seen_at) VALUES(?,0,0)")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();
    for category in ["llm", "cv", "nlp", "od", "classical-ml", "filters"] {
        let mode = format!("classic:{category}:normal");
        sqlx::query("INSERT OR IGNORE INTO daily_challenges(id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES(?,'2026-09-30',?,'model-1',1,0,'test')")
            .bind(Uuid::new_v4().to_string()).bind(&mode).execute(&pool).await.unwrap();
        let (id, answer)=sqlx::query_as::<_,(String,String)>("SELECT id,answer_model_id FROM daily_challenges WHERE mode=? AND challenge_date='2026-09-30'").bind(&mode).fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO guess_events(id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES(?,?,?,?,?,1,1,'{}',0)")
            .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(id).bind(player.to_string()).bind(answer).execute(&pool).await.unwrap();
    }
    assert!(
        !summary(&pool, "2026-09-30", player, None)
            .await
            .unwrap()
            .all_required_games_complete
    );
    sqlx::query("INSERT INTO visual_clue_entities(id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES('emoji','Emoji','[]','emoji','[]',0,'{}',0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO visual_clue_challenges(id,challenge_date,mode,answer_entity_id,variant_id,selection_version,generated_at) VALUES('emoji-challenge','2026-09-30','emoji:normal','emoji','v',1,0)").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO visual_clue_guess_events(id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES('emoji-guess','emoji-request','emoji-challenge',?,'emoji',1,1,0)").bind(player.to_string()).execute(&pool).await.unwrap();
    assert!(
        !summary(&pool, "2026-09-30", player, None)
            .await
            .unwrap()
            .all_required_games_complete
    );
    let timeline = crate::repository::assists::tests::timeline_fixture(
        &pool,
        crate::domain::timeline::TimelineDifficulty::Normal,
    )
    .await;
    crate::repository::timeline::process_timeline_attempt(
        &pool,
        crate::repository::timeline::TimelineAttemptInput {
            challenge_id: timeline,
            player_id: player,
            user_id: None,
            hardcore_access: false,
            request_id: Uuid::new_v4(),
            model_order: (0..6).map(|n| format!("card-{n}")).collect(),
        },
    )
    .await
    .unwrap();
    let normalized = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert_eq!(normalized.highest_completed_tier, Some(Difficulty::Normal));
    assert_eq!(normalized.groups[0].results.len(), 6);
    assert!(normalized.groups.iter().all(|g| g.completed));
    assert!(
        normalized
            .groups
            .iter()
            .flat_map(|g| &g.results)
            .all(|r| r.result == "1")
    );
    assert!(
        !summary(&pool, "2026-09-29", player, None)
            .await
            .unwrap()
            .all_required_games_complete
    );
    assert!(
        !summary(&pool, "2026-09-30", Uuid::new_v4(), None)
            .await
            .unwrap()
            .all_required_games_complete
    );
    sqlx::query("UPDATE guess_events SET is_correct=0 WHERE challenge_id IN (SELECT id FROM daily_challenges WHERE mode='classic:filters:normal')").execute(&pool).await.unwrap();
    assert!(
        !summary(&pool, "2026-09-30", player, None)
            .await
            .unwrap()
            .all_required_games_complete
    );
}

fn full(tier: Difficulty) -> DailyCompletionSummary {
    let registry = registries().remove(0);
    let records = registry
        .requirements
        .iter()
        .filter(|r| tier_rank(Some(r.required_from_tier)) <= tier_rank(Some(tier)))
        .map(|r| VerifiedResult {
            group: r.group.clone(),
            category: r.category.clone(),
            tier: if r.category.as_deref() == Some("hardcore") {
                Some(Difficulty::Hardcore)
            } else if r.group == "classic" && tier == Difficulty::Hardcore {
                Some(Difficulty::Challenge)
            } else {
                Some(tier)
            },
            metric: 2,
        })
        .collect::<Vec<_>>();
    summarize("2026-09-30", &registry, &records)
}

#[tokio::test]
async fn snapshots_are_immutable_and_reads_use_only_confirmed_records() {
    let (pool, _, player) = fixture().await;
    let empty = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert!(!empty.all_required_games_complete);
    sqlx::query("UPDATE daily_completion_requirement_snapshots SET requirements_json=json_set(requirements_json,'$.version',99)").execute(&pool).await.unwrap();
    assert_eq!(
        summary(&pool, "2026-09-30", player, None)
            .await
            .unwrap()
            .requirement_version,
        99
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM daily_completion_requirement_snapshots")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    assert!(summary(&pool, "2026-08-10", player, None).await.is_err());
    sqlx::query("UPDATE daily_completion_requirement_snapshots SET requirements_json='broken'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(summary(&pool, "2026-09-30", player, None).await.is_err());
}

#[tokio::test]
async fn seen_cannot_grant_completion_and_merges_monotonically_across_retries_and_guest_sign_in() {
    let (pool, _, player) = fixture().await;
    sqlx::query("INSERT INTO users(id,email,email_normalized,created_at,updated_at) VALUES('u','u@test.test','u@test.test',0,0)").execute(&pool).await.unwrap();
    let empty = summary(&pool, "2026-09-30", player, Some("u"))
        .await
        .unwrap();
    assert!(
        mark_seen(
            &pool,
            &empty,
            Some("u"),
            Some(Difficulty::Hardcore),
            false,
            1
        )
        .await
        .is_err()
    );
    assert!(mark_seen(&pool, &empty, None, None, true, 1).await.is_err());
    let normal = full(Difficulty::Normal);
    mark_seen(&pool, &normal, None, Some(Difficulty::Normal), false, 1)
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_daily_completion_milestones")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    for (tier, goat) in [
        (Difficulty::Normal, false),
        (Difficulty::Challenge, false),
        (Difficulty::Hardcore, true),
        (Difficulty::Normal, false),
        (Difficulty::Hardcore, true),
    ] {
        mark_seen(
            &pool,
            &full(Difficulty::Hardcore),
            Some("u"),
            Some(tier),
            goat,
            2,
        )
        .await
        .unwrap();
    }
    let loaded = summary(&pool, "2026-09-30", player, Some("u"))
        .await
        .unwrap();
    assert_eq!(loaded.highest_celebrated_tier, Some(Difficulty::Hardcore));
    assert!(loaded.goat_seen);
    assert_eq!(loaded.highest_completed_tier, None);
    mark_seen(&pool, &empty, Some("u"), None, false, 3)
        .await
        .unwrap();
    assert_eq!(
        summary(&pool, "2026-09-30", player, Some("u"))
            .await
            .unwrap()
            .highest_celebrated_tier,
        Some(Difficulty::Hardcore)
    );
    pool.close().await;
    assert!(summary(&pool, "2026-09-30", player, None).await.is_err());
    assert!(
        mark_seen(
            &pool,
            &normal,
            Some("u"),
            Some(Difficulty::Normal),
            false,
            4
        )
        .await
        .is_err()
    );
}

// Every stored mode has to map to the difficulty the summary reasons about
#[tokio::test]
async fn stored_completions_of_every_mode_map_to_their_tier_and_later_reads_do_not_write() {
    use crate::{
        domain::timeline::TimelineDifficulty, repository::assists::tests::timeline_fixture,
    };
    let (pool, _, player) = fixture().await;
    sqlx::query("INSERT INTO anonymous_players(id,created_at,last_seen_at) VALUES(?,0,0)")
        .bind(player.to_string())
        .execute(&pool)
        .await
        .unwrap();
    let win_classic = |mode: String| {
        let pool = pool.clone();
        async move {
            sqlx::query("INSERT OR IGNORE INTO daily_challenges(id,challenge_date,mode,answer_model_id,selection_version,generated_at,generation_source) VALUES(?,'2026-09-30',?,'model-1',1,0,'test')")
                .bind(Uuid::new_v4().to_string()).bind(&mode).execute(&pool).await.unwrap();
            let id: String = sqlx::query_scalar(
                "SELECT id FROM daily_challenges WHERE mode=? AND challenge_date='2026-09-30'",
            )
            .bind(&mode)
            .fetch_one(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO guess_events(id,request_id,challenge_id,player_id,guessed_model_id,attempt_number,is_correct,comparison_json,created_at) VALUES(?,?,?,?,'model-1',2,1,'{}',0)")
                .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(id).bind(player.to_string()).execute(&pool).await.unwrap();
        }
    };
    for category in ["llm", "cv", "nlp", "od", "classical-ml", "filters"] {
        win_classic(format!("classic:{category}:challenge")).await;
    }
    sqlx::query("INSERT INTO visual_clue_entities(id,name,aliases_json,entity_kind,categories_json,min_pool,entity_json,updated_at) VALUES('emoji','Emoji','[]','emoji','[]',0,'{}',0)").execute(&pool).await.unwrap();
    let win_emoji = |difficulty: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query("INSERT INTO visual_clue_challenges(id,challenge_date,mode,answer_entity_id,variant_id,selection_version,generated_at) VALUES(?,'2026-09-30',?,'emoji','v',1,0)")
                .bind(difficulty).bind(format!("emoji:{difficulty}")).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO visual_clue_guess_events(id,request_id,challenge_id,player_id,guessed_entity_id,attempt_number,is_correct,created_at) VALUES(?,?,?,?,'emoji',4,1,0)")
                .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(difficulty).bind(player.to_string()).execute(&pool).await.unwrap();
        }
    };
    let win_timeline = |difficulty: TimelineDifficulty, attempt: i64| {
        let pool = pool.clone();
        async move {
            let challenge = timeline_fixture(&pool, difficulty).await;
            sqlx::query("INSERT INTO timeline_attempts (id,request_id,challenge_id,player_id,model_order_json,placements_json,attempt_number,is_correct,created_at) VALUES (?,?,?,?,'[]','[]',?,1,0)")
                .bind(Uuid::new_v4().to_string()).bind(Uuid::new_v4().to_string()).bind(challenge.to_string()).bind(player.to_string()).bind(attempt).execute(&pool).await.unwrap();
        }
    };
    win_emoji("normal").await;
    // A Speedrun is not a tier and never completes the Timeline requirement
    win_timeline(TimelineDifficulty::Speedrun, 1).await;
    let without_timeline = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert_eq!(without_timeline.highest_completed_tier, None);

    win_timeline(TimelineDifficulty::Challenge, 3).await;
    let challenge = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert_eq!(
        challenge.highest_completed_tier,
        Some(Difficulty::Challenge)
    );
    assert_eq!(challenge.groups[0].result, "2 / 2 / 2 / 2 / 2 / 2");
    assert_eq!(challenge.groups[2].result, "3");

    // Classic Hardcore alone shows its row without changing the tier
    win_classic("classic:hardcore:hardcore".to_owned()).await;
    let partial = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert_eq!(partial.highest_completed_tier, Some(Difficulty::Challenge));
    assert_eq!(partial.groups[0].results.len(), 7);
    assert_eq!(partial.groups[0].results[6].id, "classic-hardcore");

    win_timeline(TimelineDifficulty::Hardcore, 5).await;
    let crown = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert_eq!(crown.highest_completed_tier, Some(Difficulty::Hardcore));
    assert_eq!(crown.groups[2].result, "5");
    // Emoji was only solved on Normal, so the goat is not earned yet
    assert!(!crown.hardcore_sweep);
    win_emoji("challenge").await;

    // Reading an already snapshotted day performs no write at all
    let mut connection = pool.acquire().await.unwrap();
    sqlx::query("PRAGMA query_only = ON")
        .execute(&mut *connection)
        .await
        .unwrap();
    drop(connection);
    let goat = summary(&pool, "2026-09-30", player, None).await.unwrap();
    assert_eq!(goat.highest_completed_tier, Some(Difficulty::Hardcore));
    assert!(goat.hardcore_sweep);
    // A day that was never read still needs its first snapshot
    assert!(summary(&pool, "2026-09-29", player, None).await.is_err());
}
