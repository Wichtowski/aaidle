use std::collections::{BTreeMap, BTreeSet};

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use time::{Date, format_description::FormatItem, macros::format_description};

use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

const DATE_FORMAT: &[FormatItem<'static>] = format_description!("[year]-[month]-[day]");
const PROVIDER_REPEAT_WEIGHT: u64 = 4;
const CATEGORY_REPEAT_WEIGHT: u64 = 2;

pub const TIMELINE_SELECTION_VERSION: i64 = 1;
pub const TIMELINE_HARDCORE_ATTEMPT_LIMIT: u16 = 8;
pub const TIMELINE_MAX_MODEL_COUNT: usize = 18;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TimelineDifficulty {
    Normal,
    Challenge,
    Speedrun,
    Hardcore,
}

impl TimelineDifficulty {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "normal" => Some(Self::Normal),
            "challenge" => Some(Self::Challenge),
            "speedrun" => Some(Self::Speedrun),
            "hardcore" => Some(Self::Hardcore),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Challenge => "challenge",
            Self::Speedrun => "speedrun",
            Self::Hardcore => "hardcore",
        }
    }
}

impl TimelineDifficulty {
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
            Self::Speedrun => TimelineDifficultyConfig {
                locked_anchor_count: 4,
                total_model_count: 18,
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
                if matches!(
                    difficulty,
                    TimelineDifficulty::Normal
                        | TimelineDifficulty::Challenge
                        | TimelineDifficulty::Speedrun
                ) {
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
    let anchor_positions = if difficulty == TimelineDifficulty::Speedrun {
        vec![0, 5, 11, 17]
    } else {
        select_anchor_positions(
            date,
            difficulty,
            secret,
            config.total_model_count,
            config.locked_anchor_count,
        )?
    };
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
mod tests;
