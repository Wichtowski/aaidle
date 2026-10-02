use super::*;

fn completed(tier: Difficulty) -> Vec<VerifiedResult> {
    let registry = registries().remove(0);
    registry
        .requirements
        .iter()
        .filter(|r| tier_rank(Some(r.required_from_tier)) <= tier_rank(Some(tier)))
        .map(|r| VerifiedResult {
            group: r.group.clone(),
            category: r.category.clone(),
            tier: needed_tier(r, tier),
            metric: 3,
        })
        .collect()
}

#[test]
fn six_categories_emoji_and_timeline_are_required_and_logo_is_not() {
    let registry = registries().remove(0);
    assert_eq!(
        registry
            .requirements
            .iter()
            .filter(|r| r.group == "classic" && r.category.as_deref() != Some("hardcore"))
            .count(),
        6
    );
    let records = completed(Difficulty::Normal);
    assert_eq!(
        summarize("2026-09-30", &registry, &records).highest_completed_tier,
        Some(Difficulty::Normal)
    );
    for index in 0..records.len() {
        let mut partial = records.clone();
        partial.remove(index);
        let summary = summarize("2026-09-30", &registry, &partial);
        assert!(!summary.all_required_games_complete);
        assert!(!summary.hardcore_sweep);
    }
    assert!(!registry.requirements.iter().any(|r| r.group == "logo"));
}

fn result(
    group: &str,
    category: Option<&str>,
    tier: Option<Difficulty>,
    metric: i64,
) -> VerifiedResult {
    VerifiedResult {
        group: group.into(),
        category: category.map(Into::into),
        tier,
        metric,
    }
}

fn rows(summary: &DailyCompletionSummary) -> Vec<(String, String, bool)> {
    summary
        .groups
        .iter()
        .flat_map(|group| &group.results)
        .map(|row| (row.id.clone(), row.result.clone(), row.completed))
        .collect()
}

#[test]
fn every_tier_uses_only_playable_modes() {
    let registry = registries().remove(0);
    for tier in Difficulty::ALL {
        let result = summarize("2026-09-30", &registry, &completed(tier));
        assert_eq!(result.highest_completed_tier, Some(tier));
        // The Emoji result in this fixture has no difficulty, so GOAT is never earned
        assert!(!result.hardcore_sweep);
        assert_eq!(
            result
                .groups
                .iter()
                .map(|g| g.id.as_str())
                .collect::<Vec<_>>(),
            ["classic", "emoji", "timeline"]
        );
        assert_eq!(result.sequence_number, None);
        assert_eq!(
            rows(&result).len(),
            if tier == Difficulty::Hardcore { 9 } else { 8 }
        );
    }
    let mut partial = completed(Difficulty::Hardcore);
    partial.retain(|r| r.category.as_deref() != Some("hardcore"));
    let result = summarize("2026-09-30", &registry, &partial);
    assert!(!result.hardcore_sweep);
    assert_eq!(result.highest_completed_tier, Some(Difficulty::Challenge));
}

#[test]
fn goat_needs_the_hardcore_set_and_every_game_at_its_highest_difficulty() {
    let registry = registries().remove(0);
    let with_emoji = |tier: Difficulty| {
        let mut records = completed(Difficulty::Hardcore);
        records.retain(|r| r.group != "emoji");
        records.push(result("emoji", None, Some(tier), 4));
        summarize("2026-09-30", &registry, &records)
    };
    // The crown is earned either way; the goat needs Emoji on Challenge or harder
    let normal_emoji = with_emoji(Difficulty::Normal);
    assert_eq!(
        normal_emoji.highest_completed_tier,
        Some(Difficulty::Hardcore)
    );
    assert!(!normal_emoji.hardcore_sweep);
    assert!(with_emoji(Difficulty::Challenge).hardcore_sweep);
    assert!(with_emoji(Difficulty::Hardcore).hardcore_sweep);

    // Emoji on Challenge alone is not enough without the complete Hardcore set
    let mut challenge = completed(Difficulty::Challenge);
    challenge.push(result("emoji", None, Some(Difficulty::Challenge), 2));
    let challenge = summarize("2026-09-30", &registry, &challenge);
    assert_eq!(
        challenge.highest_completed_tier,
        Some(Difficulty::Challenge)
    );
    assert!(!challenge.hardcore_sweep);

    // A registry without any highest difficulty can never award it
    let mut plain = registry.clone();
    for requirement in &mut plain.requirements {
        requirement.highest_tier = None;
    }
    let mut records = completed(Difficulty::Hardcore);
    records.push(result("emoji", None, Some(Difficulty::Hardcore), 1));
    assert!(!summarize("2026-09-30", &plain, &records).hardcore_sweep);
}

#[test]
fn a_harder_completion_also_satisfies_an_easier_requirement() {
    let registry = registries().remove(0);
    // Timeline was only played on Challenge, everything else on Normal
    let mut records = completed(Difficulty::Normal);
    records.retain(|r| r.group != "timeline");
    records.push(result("timeline", None, Some(Difficulty::Challenge), 5));
    let summary = summarize("2026-09-30", &registry, &records);
    assert_eq!(summary.highest_completed_tier, Some(Difficulty::Normal));
    assert!(rows(&summary).contains(&("timeline".into(), "5".into(), true)));

    // One category only on Challenge still completes the Normal set
    let mut records = completed(Difficulty::Normal);
    records.retain(|r| r.category.as_deref() != Some("llm"));
    records.push(result(
        "classic",
        Some("llm"),
        Some(Difficulty::Challenge),
        7,
    ));
    let summary = summarize("2026-09-30", &registry, &records);
    assert_eq!(summary.highest_completed_tier, Some(Difficulty::Normal));
    assert!(rows(&summary).contains(&("classic-llm".into(), "7".into(), true)));

    // Five of six categories on Challenge is still the Normal tier
    let mut records = completed(Difficulty::Challenge);
    records.retain(|r| r.category.as_deref() != Some("filters"));
    records.push(result(
        "classic",
        Some("filters"),
        Some(Difficulty::Normal),
        3,
    ));
    assert_eq!(
        summarize("2026-09-30", &registry, &records).highest_completed_tier,
        Some(Difficulty::Normal)
    );

    // An easier completion never satisfies a harder requirement
    let mut records = completed(Difficulty::Challenge);
    records.retain(|r| r.group != "timeline");
    records.push(result("timeline", None, Some(Difficulty::Normal), 1));
    assert_eq!(
        summarize("2026-09-30", &registry, &records).highest_completed_tier,
        Some(Difficulty::Normal)
    );

    // When both were played, the result of the needed difficulty is the one shown
    let mut records = completed(Difficulty::Normal);
    records.push(result("timeline", None, Some(Difficulty::Challenge), 1));
    let summary = summarize("2026-09-30", &registry, &records);
    assert!(rows(&summary).contains(&("timeline".into(), "3".into(), true)));
}

#[test]
fn a_solved_hardcore_game_is_always_shown_and_never_listed_as_missing() {
    let registry = registries().remove(0);
    // No Hardcore played: no Hardcore row, nothing pending
    let normal = summarize("2026-09-30", &registry, &completed(Difficulty::Normal));
    assert_eq!(rows(&normal).len(), 8);
    assert!(
        rows(&normal)
            .iter()
            .all(|(id, _, completed)| { *completed && !id.contains("hardcore") })
    );

    // Classic Hardcore solved, Timeline Hardcore not: the Hardcore row appears
    let mut records = completed(Difficulty::Challenge);
    records.push(result(
        "classic",
        Some("hardcore"),
        Some(Difficulty::Hardcore),
        6,
    ));
    let summary = summarize("2026-09-30", &registry, &records);
    assert_eq!(summary.highest_completed_tier, Some(Difficulty::Challenge));
    assert_eq!(rows(&summary).len(), 9);
    assert!(rows(&summary).contains(&("classic-hardcore".into(), "6".into(), true)));
    assert!(rows(&summary).iter().all(|(_, _, completed)| *completed));
    assert_eq!(
        summary.groups[0].results.last().unwrap().label,
        "Combined Hardcore"
    );

    // Timeline solved on Normal and on Hardcore: both results are shown
    let mut records = completed(Difficulty::Normal);
    records.push(result("timeline", None, Some(Difficulty::Hardcore), 2));
    let summary = summarize("2026-09-30", &registry, &records);
    assert!(rows(&summary).contains(&("timeline".into(), "3".into(), true)));
    assert!(rows(&summary).contains(&("timeline-hardcore".into(), "2".into(), true)));
    assert_eq!(summary.groups[2].results[1].label, "Timeline Hardcore");

    // Timeline solved only on Hardcore: one row, not a duplicate
    let mut records = completed(Difficulty::Normal);
    records.retain(|r| r.group != "timeline");
    records.push(result("timeline", None, Some(Difficulty::Hardcore), 2));
    let summary = summarize("2026-09-30", &registry, &records);
    assert_eq!(summary.highest_completed_tier, Some(Difficulty::Normal));
    assert_eq!(
        rows(&summary)
            .iter()
            .filter(|(id, _, _)| id.starts_with("timeline"))
            .collect::<Vec<_>>(),
        [&("timeline".to_owned(), "2".to_owned(), true)]
    );

    // An unfinished day lists what is missing with a plain dash, never Hardcore
    let mut records = completed(Difficulty::Normal);
    records.retain(|r| r.group != "emoji");
    let summary = summarize("2026-09-30", &registry, &records);
    assert_eq!(summary.highest_completed_tier, None);
    assert!(rows(&summary).contains(&("emoji".into(), MISSING_RESULT.into(), false)));
    assert_eq!(MISSING_RESULT, "-");
    assert!(
        !rows(&summary)
            .iter()
            .any(|(id, _, _)| id.contains("hardcore"))
    );
}

#[test]
fn stored_requirement_snapshots_stay_readable_when_the_shape_evolves() {
    // A snapshot written before `highestTier` existed, with a field a later version added
    let stored = r#"{"version":1,"activeFrom":"2026-08-11","requirements":[
        {"id":"timeline","group":"timeline","category":null,"label":"Timeline","tierAware":true,
         "supportedTiers":["normal","challenge","hardcore"],"requiredFromTier":"normal",
         "activeFrom":"2026-08-11","activeUntil":null,"addedLater":true}]}"#;
    let registry: RequirementRegistry = serde_json::from_str(stored).unwrap();
    assert_eq!(registry.requirements[0].highest_tier, None);
    let summary = summarize(
        "2026-09-30",
        &registry,
        &[result("timeline", None, Some(Difficulty::Hardcore), 1)],
    );
    assert_eq!(summary.highest_completed_tier, Some(Difficulty::Hardcore));
    assert!(!summary.hardcore_sweep);
    let current = serde_json::to_string(&registries().remove(0)).unwrap();
    assert!(current.contains(r#""highestTier":"hardcore""#));
    assert!(serde_json::from_str::<RequirementRegistry>(&current).is_ok());
}

#[test]
fn versioned_activation_and_expiry_do_not_change_prior_dates() {
    let original = registries().remove(0);
    let mut next = original.clone();
    next.version = 2;
    next.active_from = "2026-10-01".into();
    next.requirements[0].active_until = Some("2026-10-02".into());
    let mut logo = next.requirements[7].clone();
    logo.id = "logo".into();
    logo.group = "logo".into();
    logo.active_from = "2026-10-03".into();
    next.requirements.push(logo);
    let versions = [original, next];
    assert!(applicable_registry("2026-08-10", &versions).is_none());
    assert_eq!(
        applicable_registry("2026-09-30", &versions)
            .unwrap()
            .version,
        1
    );
    assert_eq!(
        applicable_registry("2026-10-01", &versions)
            .unwrap()
            .requirements
            .len(),
        9
    );
    assert_eq!(
        applicable_registry("2026-10-02", &versions)
            .unwrap()
            .requirements
            .len(),
        8
    );
    assert_eq!(
        applicable_registry("2026-10-03", &versions)
            .unwrap()
            .requirements
            .len(),
        9
    );
    assert!(
        !summarize(
            "2026-09-30",
            &RequirementRegistry {
                version: 3,
                active_from: "2026-08-11".into(),
                requirements: vec![]
            },
            &[]
        )
        .all_required_games_complete
    );
}

#[test]
fn metrics_are_spoiler_free_minimal_and_unsupported_modes_do_not_raise_the_tier() {
    let mut records = completed(Difficulty::Normal);
    records.push(VerifiedResult {
        group: "timeline".into(),
        category: None,
        tier: None,
        metric: 1,
    });
    records.push(VerifiedResult {
        group: "emoji".into(),
        category: None,
        tier: Some(Difficulty::Hardcore),
        metric: 2,
    });
    let result = summarize("2026-09-30", &registries().remove(0), &records);
    assert_eq!(result.highest_completed_tier, Some(Difficulty::Normal));
    assert_eq!(result.groups[1].result, "2");
    let json = serde_json::to_string(&result).unwrap();
    for secret in ["answerModelId", "modelOrder", "releaseDate", "modelId"] {
        assert!(!json.contains(secret));
    }
}
