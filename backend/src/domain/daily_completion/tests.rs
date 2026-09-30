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

#[test]
fn every_tier_uses_only_playable_modes_and_a_complete_hardcore_sweep() {
    let registry = registries().remove(0);
    for tier in Difficulty::ALL {
        let result = summarize("2026-09-30", &registry, &completed(tier));
        assert_eq!(result.highest_completed_tier, Some(tier));
        assert_eq!(result.hardcore_sweep, tier == Difficulty::Hardcore);
        assert_eq!(
            result
                .groups
                .iter()
                .map(|g| g.id.as_str())
                .collect::<Vec<_>>(),
            ["classic", "emoji", "timeline"]
        );
        assert_eq!(result.sequence_number, None);
    }
    let mut partial = completed(Difficulty::Hardcore);
    partial.retain(|r| r.category.as_deref() != Some("hardcore"));
    let result = summarize("2026-09-30", &registry, &partial);
    assert!(!result.hardcore_sweep);
    assert_ne!(result.highest_completed_tier, Some(Difficulty::Hardcore));
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
