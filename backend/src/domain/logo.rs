use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::error::{AppError, AppResult};

pub const MAX_REVEAL_REVISION: usize = 7;
const ZOOM_LEVELS: [f32; MAX_REVEAL_REVISION + 1] = [4.2, 3.5, 2.9, 2.4, 2.0, 1.65, 1.3, 1.0];

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoCatalogEntry {
    pub answer_id: String,
    pub min_pool: u8,
    pub visual_type: VisualType,
    pub asset_name: String,
    pub asset_path: String,
    pub reveal_profile: String,
    pub focal_point: FocalPoint,
    pub clues: Vec<LogoTextClue>,
    pub source_url: String,
    pub license: String,
    pub attribution: String,
    #[serde(default)]
    pub people: Vec<LogoPerson>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum VisualType {
    Logo,
    DiscovererPortrait,
    Technology,
    Other,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct FocalPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoPerson {
    pub name: String,
    pub source_url: String,
    pub license: String,
    pub attribution: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogoTextClue {
    pub after_incorrect_guesses: usize,
    pub kind: String,
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct LogoCatalog {
    entries: Vec<LogoCatalogEntry>,
}

impl LogoCatalog {
    pub fn load() -> AppResult<Self> {
        let entries: Vec<LogoCatalogEntry> =
            serde_json::from_str(include_str!("../../../data/logo.seed.json"))?;
        validate_seed(&entries)?;
        Ok(Self { entries })
    }

    pub fn entries(&self) -> impl Iterator<Item = &LogoCatalogEntry> {
        self.entries.iter()
    }

    pub fn eligible(&self, pool_rank: u8) -> impl Iterator<Item = &LogoCatalogEntry> {
        self.entries
            .iter()
            .filter(move |entry| entry.min_pool <= pool_rank)
    }

    pub fn entry(&self, answer_id: &str) -> Option<&LogoCatalogEntry> {
        self.entries
            .iter()
            .find(|entry| entry.answer_id == answer_id)
    }
}

pub fn validate_seed(entries: &[LogoCatalogEntry]) -> AppResult<()> {
    if entries.len() < 6 {
        return Err(AppError::config(
            "Logo seed needs at least six entries so the five-miss clue is reachable",
        ));
    }
    let mut answer_ids = HashSet::new();
    let mut asset_paths = HashSet::new();
    for entry in entries {
        if !answer_ids.insert(entry.answer_id.as_str()) {
            return Err(AppError::config(format!(
                "Duplicate Logo answer ID: {}",
                entry.answer_id
            )));
        }
        if !asset_paths.insert(entry.asset_path.as_str()) {
            return Err(AppError::config(format!(
                "Duplicate Logo asset path: {}",
                entry.asset_path
            )));
        }
        if entry.min_pool > 2 {
            return Err(AppError::config(format!(
                "{} has an invalid Logo minPool",
                entry.answer_id
            )));
        }
        if entry.reveal_profile != "progressive-zoom" {
            return Err(AppError::config(format!(
                "{} has an unsupported Logo revealProfile",
                entry.answer_id
            )));
        }
        if !(0.0..=512.0).contains(&entry.focal_point.x)
            || !(0.0..=512.0).contains(&entry.focal_point.y)
        {
            return Err(AppError::config(format!(
                "{} has an invalid Logo focalPoint",
                entry.answer_id
            )));
        }
        if !entry.source_url.starts_with("https://")
            || entry.license.trim().is_empty()
            || entry.attribution.trim().is_empty()
            || entry.asset_name.trim().is_empty()
            || !entry.asset_path.starts_with("/logo-assets/")
            || entry.asset_path.contains("..")
        {
            return Err(AppError::config(format!(
                "{} has incomplete Logo asset provenance",
                entry.answer_id
            )));
        }
        if entry.visual_type == VisualType::DiscovererPortrait {
            if entry.people.is_empty() {
                return Err(AppError::config(format!(
                    "{} portrait requires at least one person",
                    entry.answer_id
                )));
            }
            if !entry
                .clues
                .iter()
                .any(|clue| clue.kind == "educational" && clue.after_incorrect_guesses == 3)
            {
                return Err(AppError::config(format!(
                    "{} portrait requires an educational clue after three misses",
                    entry.answer_id
                )));
            }
        }
        let mut previous_threshold = 0;
        let mut has_general_five = false;
        for clue in &entry.clues {
            if clue.after_incorrect_guesses == 0
                || clue.after_incorrect_guesses < previous_threshold
                || clue.kind.trim().is_empty()
                || clue.text.trim().is_empty()
            {
                return Err(AppError::config(format!(
                    "{} has an invalid Logo clue",
                    entry.answer_id
                )));
            }
            if clue.kind == "general" && clue.after_incorrect_guesses == 5 {
                has_general_five = true;
            }
            previous_threshold = clue.after_incorrect_guesses;
        }
        if !has_general_five {
            return Err(AppError::config(format!(
                "{} needs a general Logo clue after five misses",
                entry.answer_id
            )));
        }
    }
    Ok(())
}

pub fn reveal_revision(incorrect_guesses: usize) -> usize {
    incorrect_guesses.min(MAX_REVEAL_REVISION)
}

pub fn revealed_clues(entry: &LogoCatalogEntry, incorrect_guesses: usize) -> Vec<LogoTextClue> {
    entry
        .clues
        .iter()
        .filter(|clue| clue.after_incorrect_guesses <= incorrect_guesses)
        .cloned()
        .collect()
}

pub fn zoom_for_revision(revision: usize) -> f32 {
    ZOOM_LEVELS[revision.min(MAX_REVEAL_REVISION)]
}

#[cfg(test)]
mod tests;
