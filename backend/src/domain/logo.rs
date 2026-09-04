use serde::{Deserialize, Serialize};
use std::{collections::HashSet, io::Cursor};

use image::{ImageFormat, imageops::FilterType};

use crate::error::{AppError, AppResult};

pub const MAX_REVEAL_REVISION: usize = 7;
const ZOOM_LEVELS: [f32; MAX_REVEAL_REVISION + 1] = [4.2, 3.5, 2.9, 2.4, 2.0, 1.65, 1.3, 1.0];
const RENDER_SIZE: u32 = 512;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoCatalogEntry {
    pub answer_id: String,
    pub min_pool: u8,
    pub visual_type: VisualType,
    pub asset_name: String,
    #[serde(default, rename = "assetUrl", alias = "assetPath", alias = "asset")]
    pub asset_path: String,
    #[serde(flatten)]
    pub reveal: RevealProfile,
    pub clues: Vec<LogoTextClue>,
    #[serde(default)]
    pub source_url: String,
    #[serde(default)]
    pub license: String,
    #[serde(default)]
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

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct FocalPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "revealProfile",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum RevealProfile {
    ProgressiveZoom {
        focal_point: FocalPoint,
    },
    GaussianBlur {
        blur_start_strength: f32,
        blur_step_strength: f32,
    },
}

impl RevealProfile {
    pub fn is_valid(self) -> bool {
        match self {
            Self::ProgressiveZoom { focal_point } => {
                (0.0..=512.0).contains(&focal_point.x) && (0.0..=512.0).contains(&focal_point.y)
            }
            Self::GaussianBlur {
                blur_start_strength,
                blur_step_strength,
            } => {
                blur_start_strength.is_finite()
                    && blur_start_strength > 0.0
                    && blur_start_strength <= 64.0
                    && blur_step_strength.is_finite()
                    && blur_step_strength > 0.0
                    && blur_step_strength <= 64.0
            }
        }
    }

    pub fn blur_strength(self, revision: usize) -> f32 {
        match self {
            Self::GaussianBlur {
                blur_start_strength,
                blur_step_strength,
            } => (blur_start_strength
                - revision.min(MAX_REVEAL_REVISION) as f32 * blur_step_strength)
                .max(0.0),
            Self::ProgressiveZoom { .. } => 0.0,
        }
    }

    pub fn cache_key(self) -> (u8, u32, u32) {
        match self {
            Self::ProgressiveZoom { focal_point } => {
                (0, focal_point.x.to_bits(), focal_point.y.to_bits())
            }
            Self::GaussianBlur {
                blur_start_strength,
                blur_step_strength,
            } => (
                1,
                blur_start_strength.to_bits(),
                blur_step_strength.to_bits(),
            ),
        }
    }
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
    #[serde(default)]
    pub text: String,
    #[serde(default, rename = "assetUrl", alias = "asset", skip_serializing)]
    pub asset: Option<String>,
}

#[derive(Clone, Debug)]
pub struct LogoCatalog {
    entries: Vec<LogoCatalogEntry>,
}

impl LogoCatalog {
    pub fn load() -> AppResult<Self> {
        let entries = serde_json::from_str(include_str!("../../../data/logo.seed.json"))?;
        Self::from_entries(entries)
    }

    pub(crate) fn from_entries(mut entries: Vec<LogoCatalogEntry>) -> AppResult<Self> {
        for entry in &mut entries {
            if !entry.asset_path.starts_with('/') {
                entry.asset_path = format!("/logo-visual/{}", entry.asset_path);
            }
        }
        for entry in &mut entries {
            for clue in &mut entry.clues {
                if let Some(asset) = &mut clue.asset
                    && !asset.starts_with('/')
                {
                    *asset = format!("/logo-visual/{asset}");
                }
            }
        }
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
        if !entry.reveal.is_valid() {
            return Err(AppError::config(format!(
                "{} has invalid Logo revealProfile settings",
                entry.answer_id
            )));
        }
        if entry.clues.is_empty() {
            return Err(AppError::config(format!(
                "{} needs at least one Logo clue",
                entry.answer_id
            )));
        }
        if (!entry.source_url.is_empty() && !entry.source_url.starts_with("https://"))
            || entry.asset_name.trim().is_empty()
            || !valid_asset_url(&entry.asset_path)
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
        for clue in &entry.clues {
            if clue.after_incorrect_guesses < previous_threshold
                || clue.kind.trim().is_empty()
                || (clue.kind != "image" && clue.text.trim().is_empty())
                || (clue.kind == "image"
                    && clue
                        .asset
                        .as_deref()
                        .is_none_or(|asset| !valid_asset_url(asset)))
            {
                return Err(AppError::config(format!(
                    "{} has an invalid Logo clue",
                    entry.answer_id
                )));
            }
            previous_threshold = clue.after_incorrect_guesses;
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

/// Seed URLs identify public images on APP_ORIGIN, never arbitrary download hosts.
pub fn valid_asset_url(value: &str) -> bool {
    value.starts_with('/')
        && !value.starts_with("//")
        && !value.contains("..")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"/-_.".contains(&byte))
        && (value.ends_with(".png") || value.ends_with(".webp"))
}

pub fn render_logo_image(
    bytes: &[u8],
    profile: RevealProfile,
    revision: usize,
    solved: bool,
) -> AppResult<Vec<u8>> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::Unavailable("Logo image could not be decoded.".to_owned()))?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let source = reader
        .decode()
        .map_err(|_| AppError::Unavailable("Logo image could not be decoded.".to_owned()))?;
    let rendered = if solved {
        source.resize(RENDER_SIZE, RENDER_SIZE, FilterType::Lanczos3)
    } else if let RevealProfile::ProgressiveZoom { focal_point } = profile {
        let normalized = source.resize_to_fill(RENDER_SIZE, RENDER_SIZE, FilterType::Lanczos3);
        let zoom = zoom_for_revision(revision);
        let crop_size = ((RENDER_SIZE as f32 / zoom).round() as u32).clamp(1, RENDER_SIZE);
        let maximum_offset = RENDER_SIZE - crop_size;
        let offset_factor = 1.0 - (1.0 / zoom);
        let left = (focal_point.x * offset_factor)
            .round()
            .clamp(0.0, maximum_offset as f32) as u32;
        let top = (focal_point.y * offset_factor)
            .round()
            .clamp(0.0, maximum_offset as f32) as u32;
        normalized
            .crop_imm(left, top, crop_size, crop_size)
            .resize_exact(RENDER_SIZE, RENDER_SIZE, FilterType::Lanczos3)
    } else {
        let normalized = source.resize(RENDER_SIZE, RENDER_SIZE, FilterType::Lanczos3);
        let strength = profile.blur_strength(revision);
        // image::blur(0) still applies a small blur, so bypass it at zero.
        if strength > 0.0 {
            normalized.blur(strength)
        } else {
            normalized
        }
    };
    let mut encoded = Cursor::new(Vec::new());
    rendered
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|_| AppError::Unavailable("Logo image could not be rendered.".to_owned()))?;
    Ok(encoded.into_inner())
}

#[cfg(test)]
mod tests;
