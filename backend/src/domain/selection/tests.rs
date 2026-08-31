use super::*;

#[test]
fn selection_is_deterministic_and_excludes_recent_models() {
    let models = vec!["b".to_owned(), "a".to_owned(), "c".to_owned()];
    let selected = select_daily_model(
        "2026-08-15",
        "classic",
        1,
        "a sufficiently long test secret",
        &models,
        &[],
        60,
    )
    .expect("selection succeeds");
    assert_eq!(
        selected,
        select_daily_model(
            "2026-08-15",
            "classic",
            1,
            "a sufficiently long test secret",
            &models,
            &[],
            60
        )
        .expect("selection succeeds")
    );
    let recent = vec![RecentAnswer {
        model_id: selected,
        challenge_date: "2026-08-14".to_owned(),
    }];
    assert_ne!(
        select_daily_model(
            "2026-08-15",
            "classic",
            1,
            "a sufficiently long test secret",
            &models,
            &recent,
            60
        )
        .expect("selection succeeds"),
        recent[0].model_id
    );
}

#[test]
fn selection_rejects_an_empty_model_pool() {
    assert!(select_daily_model("2026-08-15", "classic", 1, "secret", &[], &[], 60).is_err());
}

#[test]
fn duplicate_models_do_not_change_selection() {
    let unique = vec!["a".to_owned(), "b".to_owned()];
    let duplicates = vec!["b".to_owned(), "a".to_owned(), "b".to_owned()];
    let select = |models: &[String]| {
        select_daily_model("2026-08-15", "classic", 1, "secret", models, &[], 0)
            .expect("selection succeeds")
    };

    assert_eq!(select(&unique), select(&duplicates));
}

#[test]
fn exhausted_cooldown_falls_back_to_the_least_recently_used_model() {
    let models = vec!["newer".to_owned(), "oldest".to_owned()];
    let recent = vec![
        RecentAnswer {
            model_id: "newer".to_owned(),
            challenge_date: "2026-08-14".to_owned(),
        },
        RecentAnswer {
            model_id: "oldest".to_owned(),
            challenge_date: "2026-08-01".to_owned(),
        },
        RecentAnswer {
            model_id: "oldest".to_owned(),
            challenge_date: "2026-07-01".to_owned(),
        },
    ];

    assert_eq!(
        select_daily_model("2026-08-15", "classic", 1, "secret", &models, &recent, 2)
            .expect("fallback selection succeeds"),
        "oldest"
    );
}

#[test]
fn cooldown_ignores_out_of_pool_answers_and_honors_the_requested_window() {
    let models = vec!["available".to_owned(), "recent".to_owned()];
    let recent = vec![
        RecentAnswer {
            model_id: "not-in-pool".to_owned(),
            challenge_date: "2026-08-14".to_owned(),
        },
        RecentAnswer {
            model_id: "recent".to_owned(),
            challenge_date: "2026-08-13".to_owned(),
        },
    ];

    let selected = select_daily_model("2026-08-15", "classic", 1, "secret", &models, &recent, 2)
        .expect("selection succeeds");
    assert_eq!(selected, "available");

    let without_cooldown =
        select_daily_model("2026-08-15", "classic", 1, "secret", &models, &recent, 0)
            .expect("selection succeeds without a cooldown");
    assert!(models.contains(&without_cooldown));
}

#[test]
fn exhausted_cooldown_deduplicates_models_tied_for_oldest_use() {
    let models = vec!["b".to_owned(), "a".to_owned(), "a".to_owned()];
    let recent = vec![
        RecentAnswer {
            model_id: "a".to_owned(),
            challenge_date: "2026-08-01".to_owned(),
        },
        RecentAnswer {
            model_id: "b".to_owned(),
            challenge_date: "2026-08-01".to_owned(),
        },
    ];

    let selected = select_daily_model(
        "2026-08-15",
        "classic",
        1,
        "secret",
        &models,
        &recent,
        recent.len(),
    )
    .expect("tied fallback selection succeeds");
    assert!(matches!(selected.as_str(), "a" | "b"));
}
