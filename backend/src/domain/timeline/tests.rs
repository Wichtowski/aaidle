use super::*;

fn candidates(count: usize) -> Vec<TimelineCandidate> {
    (0..count)
        .map(|index| TimelineCandidate {
            id: format!("model-{index:02}"),
            name: format!("Model {index}"),
            item_kind: "model".to_owned(),
            provider_id: format!("provider-{}", index % 6),
            release_date: format!("{}-01-01", 1900 + index),
            year_annotation: None,
            min_pool_rank: 0,
            categories: vec![
                match index % 3 {
                    0 => "language-model",
                    1 => "filters",
                    _ => "computer-vision",
                }
                .to_owned(),
            ],
        })
        .collect()
}

#[test]
fn difficulty_configuration_is_exact() {
    assert_eq!(TimelineDifficulty::Normal.config().locked_anchor_count, 2);
    assert_eq!(TimelineDifficulty::Normal.config().total_model_count, 6);
    assert_eq!(
        TimelineDifficulty::Challenge.config().locked_anchor_count,
        4
    );
    assert_eq!(TimelineDifficulty::Challenge.config().total_model_count, 12);
    assert_eq!(TimelineDifficulty::Hardcore.config().locked_anchor_count, 6);
    assert_eq!(TimelineDifficulty::Hardcore.config().total_model_count, 18);
    assert_eq!(
        TimelineDifficulty::Hardcore.config().attempt_limit,
        Some(TIMELINE_HARDCORE_ATTEMPT_LIMIT)
    );
}

#[test]
fn selection_is_deterministic_balanced_and_uses_distinct_years() {
    let candidates = candidates(30);
    let first = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Challenge,
        "test secret that is longer than thirty two bytes",
        &candidates,
    )
    .expect("select puzzle");
    let second = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Challenge,
        "test secret that is longer than thirty two bytes",
        &candidates,
    )
    .expect("select puzzle");

    assert_eq!(first, second);
    assert_eq!(first.model_order.len(), 12);
    assert_eq!(first.anchor_positions.len(), 4);
    assert_eq!(first.tray_order.len(), 8);
    assert!(
        first
            .anchor_positions
            .windows(2)
            .all(|positions| positions[1] > positions[0] + 1)
    );
    assert_eq!(
        first
            .model_order
            .iter()
            .map(|model| model.release_date.get(..4).expect("release year"))
            .collect::<BTreeSet<_>>()
            .len(),
        first.model_order.len()
    );

    let providers = first
        .model_order
        .iter()
        .map(|model| {
            candidates
                .iter()
                .find(|candidate| candidate.id == model.id)
                .expect("selected candidate")
                .provider_id
                .as_str()
        })
        .collect::<BTreeSet<_>>();
    assert_eq!(providers.len(), 6);
}

#[test]
fn invalid_dates_are_excluded_without_narrowing_classic_categories() {
    let mut candidates = candidates(30);
    candidates[0].release_date = "2025".to_owned();
    candidates[1].release_date = "unknown".to_owned();
    for candidate in &mut candidates[2..14] {
        candidate.categories = vec!["object-detection".to_owned()];
    }

    let normal = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Normal,
        "test secret that is longer than thirty two bytes",
        &candidates,
    )
    .expect("select normal puzzle");
    assert!(
        normal
            .model_order
            .iter()
            .all(|model| model.id != "model-00" && model.id != "model-01")
    );
    assert!(is_candidate_eligible(
        &candidates[2],
        TimelineDifficulty::Normal
    ));
}

#[test]
fn pool_ranks_match_classic_difficulty_access() {
    let mut candidates = candidates(36);
    for (index, candidate) in candidates.iter_mut().enumerate() {
        candidate.min_pool_rank = (index % 3) as u8;
        candidate.categories = vec!["language-model".to_owned()];
    }
    let secret = "test secret that is longer than thirty two bytes";

    let normal = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Normal,
        secret,
        &candidates,
    )
    .expect("select normal puzzle");
    assert!(normal.model_order.iter().all(|model| {
        candidates
            .iter()
            .find(|candidate| candidate.id == model.id)
            .is_some_and(|candidate| candidate.min_pool_rank == 0)
    }));

    let challenge = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Challenge,
        secret,
        &candidates,
    )
    .expect("select Challenge puzzle");
    assert!(challenge.model_order.iter().all(|model| {
        candidates
            .iter()
            .find(|candidate| candidate.id == model.id)
            .is_some_and(|candidate| candidate.min_pool_rank <= 1)
    }));
}

#[test]
fn hardcore_allows_overlapping_years_when_dates_are_precise() {
    let mut candidates = candidates(18);
    for (index, candidate) in candidates.iter_mut().enumerate() {
        candidate.release_date = format!("2020-01-{:02}", index + 1);
    }
    assert!(candidates.iter().all(|candidate| {
        is_release_date(&candidate.release_date) && is_precise_release_date(&candidate.release_date)
    }));

    let puzzle = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Hardcore,
        "test secret that is longer than thirty two bytes",
        &candidates,
    )
    .expect("select Hardcore puzzle");

    assert_eq!(puzzle.model_order.len(), 18);
    assert!(
        puzzle
            .model_order
            .iter()
            .all(|model| is_precise_release_date(&model.release_date))
    );
}

#[test]
fn hardcore_rejects_ambiguous_overlapping_years() {
    let mut candidates = candidates(18);
    candidates[0].release_date = "2020".to_owned();
    candidates[1].release_date = "2020-01-01".to_owned();

    let result = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Hardcore,
        "test secret that is longer than thirty two bytes",
        &candidates,
    );

    assert!(result.is_err());
}

#[test]
fn hardcore_keeps_only_one_ambiguous_same_year_candidate_regardless_of_selection_order() {
    let mut candidates = candidates(19);
    candidates[0].release_date = "2020".to_owned();
    candidates[1].release_date = "2020-01-01".to_owned();
    let secret = "test secret that is longer than thirty two bytes";
    let mut selected_year_only = false;
    let mut selected_precise = false;

    for day in 1..=31 {
        let puzzle = select_timeline_puzzle(
            &format!("2026-08-{day:02}"),
            TimelineDifficulty::Hardcore,
            secret,
            &candidates,
        )
        .expect("the spare candidate permits a full puzzle");
        let has_year_only = puzzle
            .model_order
            .iter()
            .any(|model| model.id == "model-00");
        let has_precise = puzzle
            .model_order
            .iter()
            .any(|model| model.id == "model-01");
        assert_ne!(has_year_only, has_precise);
        selected_year_only |= has_year_only;
        selected_precise |= has_precise;
    }

    assert!(selected_year_only && selected_precise);
}

#[test]
fn hardcore_rejects_duplicate_precise_dates() {
    let mut candidates = candidates(18);
    candidates[1].release_date = candidates[0].release_date.clone();

    let result = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Hardcore,
        "test secret that is longer than thirty two bytes",
        &candidates,
    );

    assert!(result.is_err());
}

#[test]
fn difficulty_names_parse_strictly_and_round_trip() {
    let difficulties = [
        (TimelineDifficulty::Normal, "normal"),
        (TimelineDifficulty::Challenge, "challenge"),
        (TimelineDifficulty::Speedrun, "speedrun"),
        (TimelineDifficulty::Hardcore, "hardcore"),
    ];
    for (difficulty, name) in difficulties {
        assert_eq!(TimelineDifficulty::parse(name), Some(difficulty));
        assert_eq!(difficulty.as_str(), name);
    }
    for invalid in ["", "Normal", "speed-run", "hardcore ", "unknown"] {
        assert_eq!(TimelineDifficulty::parse(invalid), None);
    }
}

#[test]
fn speedrun_configuration_and_fixed_anchors_are_exact() {
    let config = TimelineDifficulty::Speedrun.config();
    assert_eq!(config.locked_anchor_count, 4);
    assert_eq!(config.total_model_count, TIMELINE_MAX_MODEL_COUNT);
    assert_eq!(config.pool_rank, 1);
    assert_eq!(config.attempt_limit, None);

    let puzzle = select_timeline_puzzle(
        "2026-08-25",
        TimelineDifficulty::Speedrun,
        "test secret that is longer than thirty two bytes",
        &candidates(20),
    )
    .expect("select Speedrun puzzle");
    assert_eq!(puzzle.anchor_positions, vec![0, 5, 11, 17]);
    assert_eq!(puzzle.tray_order.len(), 14);
}

#[test]
fn release_date_helpers_accept_real_dates_and_reject_ambiguous_invalid_input() {
    for valid in ["2024", "0001", "2024-02-29"] {
        assert!(is_release_date(valid), "{valid} should be valid");
    }
    for invalid in [
        "",
        "0000",
        "20a4",
        "20240",
        "2023-02-29",
        "2024-13-01",
        "2024-01-1",
    ] {
        assert!(!is_release_date(invalid), "{invalid} should be invalid");
    }

    assert!(is_precise_release_date("2024-02-29"));
    assert!(!is_precise_release_date("2024"));
    assert!(!is_precise_release_date("2023-02-29"));
    assert_eq!(release_year("2024-02-29"), Some("2024"));
    assert_eq!(release_year("2024"), Some("2024"));
    assert_eq!(release_year("20x4-01-01"), None);
    assert_eq!(release_year("123"), None);
}

#[test]
fn eligibility_requires_pool_access_and_at_least_one_category() {
    let mut candidate = candidates(1).remove(0);
    assert!(is_candidate_eligible(
        &candidate,
        TimelineDifficulty::Normal
    ));
    assert_eq!(relevant_categories(&candidate), vec!["language-model"]);

    candidate.min_pool_rank = 1;
    assert!(!is_candidate_eligible(
        &candidate,
        TimelineDifficulty::Normal
    ));
    assert!(is_candidate_eligible(
        &candidate,
        TimelineDifficulty::Challenge
    ));
    candidate.categories.clear();
    assert!(!is_candidate_eligible(
        &candidate,
        TimelineDifficulty::Hardcore
    ));
    assert!(relevant_categories(&candidate).is_empty());
}

#[test]
fn selection_rejects_insufficient_candidates_and_deduplicates_ids() {
    let secret = "test secret that is longer than thirty two bytes";
    assert!(select_timeline_puzzle("2026-08-25", TimelineDifficulty::Normal, secret, &[]).is_err());

    let mut duplicated = candidates(6);
    duplicated.push(duplicated[0].clone());
    duplicated[1].categories.clear();
    assert!(
        select_timeline_puzzle(
            "2026-08-25",
            TimelineDifficulty::Normal,
            secret,
            &duplicated
        )
        .is_err()
    );
}

#[test]
fn anchor_selection_uses_fallback_for_adjacent_singleton_buckets_and_errors_on_empty_bucket() {
    let secret = "test secret that is longer than thirty two bytes";
    assert_eq!(
        select_anchor_positions("2026-08-25", TimelineDifficulty::Normal, secret, 2, 2)
            .expect("fallback positions"),
        vec![0, 1]
    );
    assert!(
        select_anchor_positions("2026-08-25", TimelineDifficulty::Normal, secret, 0, 1).is_err()
    );
    assert!(
        select_anchor_positions("2026-08-25", TimelineDifficulty::Normal, secret, 4, 0)
            .expect("zero anchors")
            .is_empty()
    );
}

#[test]
fn deterministic_ranking_is_stable_and_input_sensitive() {
    let secret = "test secret that is longer than thirty two bytes";
    let first = deterministic_rank(secret, "first").expect("rank");
    assert_eq!(first, deterministic_rank(secret, "first").expect("rank"));
    assert_ne!(first, deterministic_rank(secret, "second").expect("rank"));
}
