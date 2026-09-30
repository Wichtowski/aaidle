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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DailyGameRequirement {
    pub id: String,
    pub group: String,
    pub category: Option<String>,
    pub label: String,
    pub tier_aware: bool,
    pub supported_tiers: Vec<Difficulty>,
    pub required_from_tier: Difficulty,
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

fn needed_tier(requirement: &DailyGameRequirement, target: Difficulty) -> Option<Difficulty> {
    requirement
        .supported_tiers
        .iter()
        .copied()
        .filter(|tier| tier_rank(Some(*tier)) <= tier_rank(Some(target)))
        .max_by_key(|tier| tier_rank(Some(*tier)))
}

fn result_for<'a>(
    r: &DailyGameRequirement,
    tier: Difficulty,
    results: &'a [VerifiedResult],
) -> Option<&'a VerifiedResult> {
    results
        .iter()
        .filter(|v| {
            v.group == r.group
                && v.category == r.category
                && (!r.tier_aware || v.tier == needed_tier(r, tier))
        })
        .min_by_key(|v| v.metric)
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
    let hardcore_entries = registry
        .requirements
        .iter()
        .filter(|r| r.supported_tiers.contains(&Difficulty::Hardcore))
        .collect::<Vec<_>>();
    let hardcore_sweep = highest == Some(Difficulty::Hardcore)
        && !hardcore_entries.is_empty()
        && hardcore_entries
            .iter()
            .all(|r| result_for(r, Difficulty::Hardcore, results).is_some());
    let display_tier = highest.unwrap_or(Difficulty::Normal);
    let mut groups: Vec<DailyGroup> = vec![];
    for requirement in required(display_tier) {
        let result = result_for(requirement, display_tier, results);
        let row = DailyResult {
            id: requirement.id.clone(),
            label: requirement.label.clone(),
            completed: result.is_some(),
            result: result.map_or_else(|| "—".into(), |result| result.metric.to_string()),
            modifiers: vec![],
        };
        if let Some(group) = groups.iter_mut().find(|g| g.id == requirement.group) {
            group.results.push(row);
        } else {
            groups.push(DailyGroup {
                id: requirement.group.clone(),
                label: match requirement.group.as_str() {
                    "classic" => "Classic",
                    "emoji" => "Emoji",
                    "timeline" => "Timeline",
                    "logo" => "Logo",
                    _ => &requirement.label,
                }
                .into(),
                completed: false,
                result: String::new(),
                modifiers: vec![],
                results: vec![row],
            });
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
