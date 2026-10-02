use serde::{Deserialize, Serialize};

use super::difficulty::Difficulty;

pub fn tier_rank(tier: Option<Difficulty>) -> u8 {
    match tier {
        None => 0,
        Some(Difficulty::Normal) => 1,
        Some(Difficulty::Challenge) => 2,
        Some(Difficulty::Hardcore) => 3,
    }
}

// Stored per challenge date as a snapshot, so the shape has to stay readable: a field
// added later needs a default, and unknown fields are ignored instead of rejected
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyGameRequirement {
    pub id: String,
    pub group: String,
    pub category: Option<String>,
    pub label: String,
    pub tier_aware: bool,
    pub supported_tiers: Vec<Difficulty>,
    pub required_from_tier: Difficulty,
    /// The difficulty that counts as this game's highest for the GOAT award. `None`
    /// means the entry adds nothing beyond what the Hardcore set already requires
    #[serde(default)]
    pub highest_tier: Option<Difficulty>,
    pub active_from: String,
    pub active_until: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementRegistry {
    pub version: i64,
    pub active_from: String,
    pub requirements: Vec<DailyGameRequirement>,
}

/// Changes require a new dated version; never mutate an already deployed version.
pub fn registries() -> Vec<RequirementRegistry> {
    let mut requirements = [
        ("llm", "LLM"),
        ("cv", "CV"),
        ("nlp", "NLP"),
        ("od", "Object Detection"),
        ("classical-ml", "Classical ML"),
        ("filters", "Filters"),
    ]
    .into_iter()
    .map(|(id, label)| DailyGameRequirement {
        id: format!("classic-{id}"),
        group: "classic".into(),
        category: Some(id.into()),
        label: label.into(),
        tier_aware: true,
        supported_tiers: vec![Difficulty::Normal, Difficulty::Challenge],
        required_from_tier: Difficulty::Normal,
        highest_tier: None,
        active_from: "2026-08-11".into(),
        active_until: None,
    })
    .collect::<Vec<_>>();
    requirements.extend([
        DailyGameRequirement {
            id: "classic-hardcore".into(),
            group: "classic".into(),
            category: Some("hardcore".into()),
            label: "Combined Hardcore".into(),
            tier_aware: true,
            supported_tiers: vec![Difficulty::Hardcore],
            required_from_tier: Difficulty::Hardcore,
            highest_tier: Some(Difficulty::Hardcore),
            active_from: "2026-08-11".into(),
            active_until: None,
        },
        DailyGameRequirement {
            id: "emoji".into(),
            group: "emoji".into(),
            category: None,
            label: "Emoji".into(),
            tier_aware: false,
            supported_tiers: vec![],
            required_from_tier: Difficulty::Normal,
            // Emoji never decides the tier. Challenge is the highest Emoji difficulty
            // the GOAT award asks for
            highest_tier: Some(Difficulty::Challenge),
            active_from: "2026-08-11".into(),
            active_until: None,
        },
        DailyGameRequirement {
            id: "timeline".into(),
            group: "timeline".into(),
            category: None,
            label: "Timeline".into(),
            tier_aware: true,
            supported_tiers: Difficulty::ALL.to_vec(),
            required_from_tier: Difficulty::Normal,
            highest_tier: Some(Difficulty::Hardcore),
            active_from: "2026-08-11".into(),
            active_until: None,
        },
    ]);
    vec![RequirementRegistry {
        version: 1,
        active_from: "2026-08-11".into(),
        requirements,
    }]
}

pub fn applicable_registry(
    date: &str,
    versions: &[RequirementRegistry],
) -> Option<RequirementRegistry> {
    let mut registry = versions
        .iter()
        .filter(|v| v.active_from.as_str() <= date)
        .max_by_key(|v| &v.active_from)?
        .clone();
    registry.requirements.retain(|r| {
        r.active_from.as_str() <= date && r.active_until.as_deref().is_none_or(|end| date < end)
    });
    Some(registry)
}

#[derive(Clone, Debug)]
pub struct VerifiedResult {
    pub group: String,
    pub category: Option<String>,
    pub tier: Option<Difficulty>,
    pub metric: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyResult {
    pub id: String,
    pub label: String,
    pub completed: bool,
    pub result: String,
    pub modifiers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyGroup {
    pub id: String,
    pub label: String,
    pub completed: bool,
    pub result: String,
    pub modifiers: Vec<String>,
    pub results: Vec<DailyResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyCompletionSummary {
    pub challenge_date: String,
    pub sequence_number: Option<i64>,
    pub requirement_version: i64,
    pub groups: Vec<DailyGroup>,
    pub highest_completed_tier: Option<Difficulty>,
    pub all_required_games_complete: bool,
    pub hardcore_sweep: bool,
    pub highest_celebrated_tier: Option<Difficulty>,
    pub goat_seen: bool,
}

/// The text shown for a required game that has no verified result yet
pub const MISSING_RESULT: &str = "-";

fn needed_tier(requirement: &DailyGameRequirement, target: Difficulty) -> Option<Difficulty> {
    requirement
        .supported_tiers
        .iter()
        .copied()
        .filter(|tier| tier_rank(Some(*tier)) <= tier_rank(Some(target)))
        .max_by_key(|tier| tier_rank(Some(*tier)))
}

fn belongs_to(result: &VerifiedResult, requirement: &DailyGameRequirement) -> bool {
    result.group == requirement.group && result.category == requirement.category
}

/// The verified result that satisfies a requirement for a target tier.
///
/// A harder completion also satisfies an easier requirement, so a player who only played
/// Challenge is not treated as having skipped Normal. The result closest to the needed
/// difficulty is the one shown
fn result_for<'a>(
    requirement: &DailyGameRequirement,
    tier: Difficulty,
    results: &'a [VerifiedResult],
) -> Option<&'a VerifiedResult> {
    let needed = needed_tier(requirement, tier);
    results
        .iter()
        .filter(|result| {
            belongs_to(result, requirement)
                && (!requirement.tier_aware
                    || (needed.is_some()
                        && result.tier.is_some()
                        && tier_rank(result.tier) >= tier_rank(needed)))
        })
        // A game without tiers shows its best result; a tiered one the result closest
        // to the needed difficulty
        .min_by_key(|result| {
            (
                if requirement.tier_aware {
                    tier_rank(result.tier)
                } else {
                    0
                },
                result.metric,
            )
        })
}

/// The best verified result at one exact difficulty
fn result_at<'a>(
    requirement: &DailyGameRequirement,
    tier: Difficulty,
    results: &'a [VerifiedResult],
) -> Option<&'a VerifiedResult> {
    results
        .iter()
        .filter(|result| belongs_to(result, requirement) && result.tier == Some(tier))
        .min_by_key(|result| result.metric)
}

fn reached(
    requirement: &DailyGameRequirement,
    tier: Difficulty,
    results: &[VerifiedResult],
) -> bool {
    results.iter().any(|result| {
        belongs_to(result, requirement) && tier_rank(result.tier) >= tier_rank(Some(tier))
    })
}

fn group_label(requirement: &DailyGameRequirement) -> String {
    match requirement.group.as_str() {
        "classic" => "Classic",
        "emoji" => "Emoji",
        "timeline" => "Timeline",
        "logo" => "Logo",
        _ => &requirement.label,
    }
    .into()
}

fn push_row(groups: &mut Vec<DailyGroup>, requirement: &DailyGameRequirement, row: DailyResult) {
    if let Some(group) = groups.iter_mut().find(|g| g.id == requirement.group) {
        group.results.push(row);
    } else {
        groups.push(DailyGroup {
            id: requirement.group.clone(),
            label: group_label(requirement),
            completed: false,
            result: String::new(),
            modifiers: vec![],
            results: vec![row],
        });
    }
}

pub fn summarize(
    date: &str,
    registry: &RequirementRegistry,
    results: &[VerifiedResult],
) -> DailyCompletionSummary {
    let required = |tier| {
        registry
            .requirements
            .iter()
            .filter(move |r| tier_rank(Some(r.required_from_tier)) <= tier_rank(Some(tier)))
    };
    let highest = Difficulty::ALL
        .into_iter()
        .filter(|tier| {
            let entries = required(*tier).collect::<Vec<_>>();
            !entries.is_empty()
                && entries
                    .iter()
                    .all(|r| result_for(r, *tier, results).is_some())
        })
        .max_by_key(|tier| tier_rank(Some(*tier)));
    // GOAT: the Hardcore set is complete and every game was also solved at its own
    // highest difficulty
    let highest_entries = registry
        .requirements
        .iter()
        .filter_map(|r| r.highest_tier.map(|tier| (r, tier)))
        .collect::<Vec<_>>();
    let hardcore_sweep = highest == Some(Difficulty::Hardcore)
        && !highest_entries.is_empty()
        && highest_entries
            .iter()
            .all(|(requirement, tier)| reached(requirement, *tier, results));
    let display_tier = highest.unwrap_or(Difficulty::Normal);
    let mut groups: Vec<DailyGroup> = vec![];
    for requirement in required(display_tier) {
        let result = result_for(requirement, display_tier, results);
        push_row(
            &mut groups,
            requirement,
            DailyResult {
                id: requirement.id.clone(),
                label: requirement.label.clone(),
                completed: result.is_some(),
                result: result
                    .map_or_else(|| MISSING_RESULT.into(), |result| result.metric.to_string()),
                modifiers: vec![],
            },
        );
    }
    // A Hardcore game the player actually solved is always shown, also while the
    // complete Hardcore set is not finished. It never appears as a missing requirement
    if display_tier != Difficulty::Hardcore {
        for requirement in &registry.requirements {
            let Some(hardcore) = result_at(requirement, Difficulty::Hardcore, results) else {
                continue;
            };
            if !requirement.tier_aware
                || !requirement.supported_tiers.contains(&Difficulty::Hardcore)
            {
                continue;
            }
            let displayed = required(display_tier).any(|shown| shown.id == requirement.id);
            let shown_result = displayed
                .then(|| result_for(requirement, display_tier, results))
                .flatten();
            if shown_result.is_some_and(|shown| shown.tier == Some(Difficulty::Hardcore)) {
                continue;
            }
            push_row(
                &mut groups,
                requirement,
                DailyResult {
                    id: if displayed {
                        format!("{}-hardcore", requirement.id)
                    } else {
                        requirement.id.clone()
                    },
                    label: if displayed {
                        format!("{} Hardcore", requirement.label)
                    } else {
                        requirement.label.clone()
                    },
                    completed: true,
                    result: hardcore.metric.to_string(),
                    modifiers: vec![],
                },
            );
        }
    }
    for group in &mut groups {
        group.completed = group.results.iter().all(|r| r.completed);
        group.result = group
            .results
            .iter()
            .map(|r| r.result.as_str())
            .collect::<Vec<_>>()
            .join(" / ");
    }
    DailyCompletionSummary {
        challenge_date: date.into(),
        sequence_number: None,
        requirement_version: registry.version,
        groups,
        highest_completed_tier: highest,
        all_required_games_complete: highest.is_some(),
        hardcore_sweep,
        highest_celebrated_tier: None,
        goat_seen: false,
    }
}

#[cfg(test)]
mod tests;
