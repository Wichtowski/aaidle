use std::collections::{BTreeMap, BTreeSet};

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use time::{Date, format_description::FormatItem, macros::format_description};

use crate::{
    domain::difficulty::Difficulty,
    error::{AppError, AppResult},
};

type HmacSha256 = Hmac<Sha256>;

const DATE_FORMAT: &[FormatItem<'static>] = format_description!("[year]-[month]-[day]");
const PROVIDER_REPEAT_WEIGHT: u64 = 4;
const CATEGORY_REPEAT_WEIGHT: u64 = 2;

pub const TIMELINE_SELECTION_VERSION: i64 = 1;
pub const TIMELINE_HARDCORE_ATTEMPT_LIMIT: u16 = 8;
pub const TIMELINE_MAX_MODEL_COUNT: usize = 18;

pub use crate::domain::difficulty::Difficulty as TimelineDifficulty;

impl Difficulty {
    pub fn config(self) -> TimelineDifficultyConfig {
        match self {
            Self::Normal => TimelineDifficultyConfig {
                locked_anchor_count: 2,
                total_model_count: 6,
                pool_rank: 0,
                attempt_limit: None,
            },
            Self::Challenge => TimelineDifficultyConfig {
                locked_anchor_count: 4,
                total_model_count: 12,
                pool_rank: 1,
                attempt_limit: None,
            },
            Self::Hardcore => TimelineDifficultyConfig {
                locked_anchor_count: 6,
                total_model_count: 18,
                pool_rank: 2,
                attempt_limit: Some(TIMELINE_HARDCORE_ATTEMPT_LIMIT),
            },
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimelineDifficultyConfig {
    pub locked_anchor_count: usize,
    pub total_model_count: usize,
    pub pool_rank: u8,
    pub attempt_limit: Option<u16>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelineCandidate {
    pub id: String,
    pub name: String,
    pub item_kind: String,
    pub provider_id: String,
    pub release_date: String,
    pub year_annotation: Option<String>,
    pub min_pool_rank: u8,
    pub categories: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineModelSnapshot {
    pub id: String,
    pub name: String,
    pub item_kind: String,
    pub release_date: String,
    #[serde(default)]
    pub year_annotation: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelinePuzzle {
    pub model_order: Vec<TimelineModelSnapshot>,
    pub anchor_positions: Vec<usize>,
    pub tray_order: Vec<String>,
}

pub fn select_timeline_puzzle(
    date: &str,
    difficulty: TimelineDifficulty,
    secret: &str,
    candidates: &[TimelineCandidate],
) -> AppResult<TimelinePuzzle> {
    let config = difficulty.config();
    let mut eligible = candidates
        .iter()
        .filter(|candidate| is_candidate_eligible(candidate, difficulty))
        .filter(|candidate| is_release_date(&candidate.release_date))
        .cloned()
        .collect::<Vec<_>>();
    eligible.sort_by(|left, right| left.id.cmp(&right.id));
    eligible.dedup_by(|left, right| left.id == right.id);

    let mut selected: Vec<TimelineCandidate> = Vec::with_capacity(config.total_model_count);
    let mut selected_years = BTreeSet::<String>::new();
    let mut provider_counts = BTreeMap::<String, u64>::new();
    let mut category_counts = BTreeMap::<String, u64>::new();

    for step in 0..config.total_model_count {
        let mut ranked = eligible
            .iter()
            .filter(|candidate| {
                let Some(year) = release_year(&candidate.release_date) else {
                    return false;
                };
                if difficulty != TimelineDifficulty::Hardcore {
                    return !selected_years.contains(year);
                }

                let same_year = selected
                    .iter()
                    .filter(|chosen| release_year(&chosen.release_date) == Some(year))
                    .collect::<Vec<_>>();
                !selected
                    .iter()
                    .any(|chosen| chosen.release_date == candidate.release_date)
                    && (same_year.is_empty()
                        || (is_precise_release_date(&candidate.release_date)
                            && same_year
                                .iter()
                                .all(|chosen| is_precise_release_date(&chosen.release_date))))
            })
            .filter(|candidate| !selected.iter().any(|chosen| chosen.id == candidate.id))
            .map(|candidate| {
                let provider_penalty = provider_counts
                    .get(&candidate.provider_id)
                    .copied()
                    .unwrap_or_default()
                    * PROVIDER_REPEAT_WEIGHT;
                let category_penalty = relevant_categories(candidate)
                    .iter()
                    .map(|category| category_counts.get(*category).copied().unwrap_or_default())
                    .min()
                    .unwrap_or_default()
                    * CATEGORY_REPEAT_WEIGHT;
                let rank = deterministic_rank(
                    secret,
                    &format!(
                        "{date}:timeline:{}:{TIMELINE_SELECTION_VERSION}:model:{step}:{}",
                        difficulty.as_str(),
                        candidate.id
                    ),
                )?;
                Ok((provider_penalty + category_penalty, rank, candidate))
            })
            .collect::<AppResult<Vec<_>>>()?;
        ranked.sort_by_key(|(penalty, rank, candidate)| (*penalty, *rank, candidate.id.as_str()));
        let candidate = ranked
            .first()
            .map(|(_, _, candidate)| (*candidate).clone())
            .ok_or_else(|| {
                AppError::Unavailable(format!(
                    "Timeline {} needs {} eligible models with unambiguous release dates.",
                    difficulty.as_str(),
                    config.total_model_count
                ))
            })?;

        selected.push(candidate.clone());
        selected_years.insert(
            release_year(&candidate.release_date)
                .expect("eligible candidate has a release year")
                .to_owned(),
        );
        *provider_counts
            .entry(candidate.provider_id.clone())
            .or_default() += 1;
        for category in relevant_categories(&candidate) {
            *category_counts.entry(category.to_owned()).or_default() += 1;
        }
    }

    selected.sort_by(|left, right| left.release_date.cmp(&right.release_date));
    let anchor_positions = select_anchor_positions(
        date,
        difficulty,
        secret,
        config.total_model_count,
        config.locked_anchor_count,
    )?;
    let anchor_set = anchor_positions.iter().copied().collect::<BTreeSet<_>>();
    let mut tray_order = selected
        .iter()
        .enumerate()
        .filter(|(position, _)| !anchor_set.contains(position))
        .map(|(_, model)| {
            Ok((
                deterministic_rank(
                    secret,
                    &format!(
                        "{date}:timeline:{}:{TIMELINE_SELECTION_VERSION}:tray:{}",
                        difficulty.as_str(),
                        model.id
                    ),
                )?,
                model.id.clone(),
            ))
        })
        .collect::<AppResult<Vec<_>>>()?;
    tray_order.sort_unstable();

    Ok(TimelinePuzzle {
        model_order: selected
            .into_iter()
            .map(|model| TimelineModelSnapshot {
                id: model.id.clone(),
                name: model.name.clone(),
                item_kind: model.item_kind.clone(),
                release_date: model.release_date.clone(),
                year_annotation: model.year_annotation.clone(),
                categories: model.categories.clone(),
            })
            .collect(),
        anchor_positions,
        tray_order: tray_order.into_iter().map(|(_, id)| id).collect(),
    })
}

fn is_release_date(value: &str) -> bool {
    if value.len() == 4 {
        return value.as_bytes().iter().all(u8::is_ascii_digit) && value != "0000";
    }
    Date::parse(value, DATE_FORMAT).is_ok()
}

fn is_precise_release_date(value: &str) -> bool {
    value.len() == 10 && Date::parse(value, DATE_FORMAT).is_ok()
}

fn release_year(value: &str) -> Option<&str> {
    value
        .get(..4)
        .filter(|year| year.as_bytes().iter().all(u8::is_ascii_digit))
}

fn is_candidate_eligible(candidate: &TimelineCandidate, difficulty: TimelineDifficulty) -> bool {
    candidate.min_pool_rank <= difficulty.config().pool_rank && !candidate.categories.is_empty()
}

fn relevant_categories(candidate: &TimelineCandidate) -> Vec<&str> {
    candidate.categories.iter().map(String::as_str).collect()
}

fn select_anchor_positions(
    date: &str,
    difficulty: TimelineDifficulty,
    secret: &str,
    total: usize,
    count: usize,
) -> AppResult<Vec<usize>> {
    let mut positions = Vec::with_capacity(count);
    for bucket in 0..count {
        let start = bucket * total / count;
        let end = (bucket + 1) * total / count;
        let mut choices = (start..end)
            .map(|position| {
                Ok((
                    deterministic_rank(
                        secret,
                        &format!(
                            "{date}:timeline:{}:{TIMELINE_SELECTION_VERSION}:anchor:{bucket}:{position}",
                            difficulty.as_str()
                        ),
                    )?,
                    position,
                ))
            })
            .collect::<AppResult<Vec<_>>>()?;
        choices.sort_unstable();
        let separated = choices
            .iter()
            .find(|(_, position)| {
                positions
                    .last()
                    .is_none_or(|previous| position.saturating_sub(*previous) > 1)
            })
            .or_else(|| choices.first())
            .ok_or_else(|| AppError::Unavailable("Timeline anchor selection failed.".to_owned()))?;
        positions.push(separated.1);
    }
    Ok(positions)
}

fn deterministic_rank(secret: &str, input: &str) -> AppResult<u64> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::config("DAILY_SELECTION_SECRET is invalid"))?;
    mac.update(input.as_bytes());
    let digest = mac.finalize().into_bytes();
    Ok(u64::from_be_bytes(
        digest[..8].try_into().expect("SHA-256 digest has 32 bytes"),
    ))
}

#[cfg(test)]
mod tests {
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
            3
        );
        assert_eq!(TimelineDifficulty::Challenge.config().total_model_count, 12);
        assert_eq!(TimelineDifficulty::Hardcore.config().locked_anchor_count, 5);
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
        assert_eq!(first.anchor_positions.len(), 3);
        assert_eq!(first.tray_order.len(), 9);
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
            is_release_date(&candidate.release_date)
                && is_precise_release_date(&candidate.release_date)
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
}
