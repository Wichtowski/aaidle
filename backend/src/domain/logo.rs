use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    sync::Mutex,
};

use image::{ImageFormat, imageops::FilterType};
use include_dir::{Dir, include_dir};

use crate::error::{AppError, AppResult};

pub const MAX_REVEAL_REVISION: usize = 7;
const ZOOM_LEVELS: [f32; MAX_REVEAL_REVISION + 1] = [4.2, 3.5, 2.9, 2.4, 2.0, 1.65, 1.3, 1.0];
const RENDER_SIZE: u32 = 512;
static LOGO_ASSETS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../data/logo-visual");

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoCatalogEntry {
    pub answer_id: String,
    pub min_pool: u8,
    pub visual_type: VisualType,
    pub asset_name: String,
    #[serde(default, alias = "asset")]
    pub asset_path: String,
    pub reveal_profile: String,
    pub focal_point: FocalPoint,
    pub clues: Vec<LogoTextClue>,
    #[serde(default)]
    pub source_url: String,
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
    #[serde(default)]
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct LogoCatalog {
    entries: Vec<LogoCatalogEntry>,
}

#[derive(Debug, Default)]
pub struct LogoImageCache {
    inner: Mutex<CachedLogoImages>,
}

#[derive(Debug, Default)]
struct CachedLogoImages {
    challenge_id: Option<String>,
    asset_path: Option<String>,
    images: HashMap<(usize, bool), Vec<u8>>,
}

impl LogoImageCache {
    pub fn image(
        &self,
        challenge_id: &str,
        asset_path: &str,
        focal_point: FocalPoint,
        revision: usize,
        solved: bool,
    ) -> AppResult<Vec<u8>> {
        let mut cache = self
            .inner
            .lock()
            .map_err(|_| AppError::Unavailable("Logo image cache is unavailable.".to_owned()))?;
        if cache.challenge_id.as_deref() != Some(challenge_id)
            || cache.asset_path.as_deref() != Some(asset_path)
        {
            cache.challenge_id = Some(challenge_id.to_owned());
            cache.asset_path = Some(asset_path.to_owned());
            cache.images.clear();
        }
        let key = (revision.min(MAX_REVEAL_REVISION), solved);
        if let Some(image) = cache.images.get(&key) {
            return Ok(image.clone());
        }
        let image = render_logo_image(asset_path, focal_point, revision, solved)?;
        cache.images.insert(key, image.clone());
        Ok(image)
    }
}

impl LogoCatalog {
    pub fn load() -> AppResult<Self> {
        let mut entries: Vec<LogoCatalogEntry> =
            serde_json::from_str(include_str!("../../../data/logo.seed.json"))?;
        for entry in &mut entries {
            if !entry.asset_path.starts_with('/') {
                entry.asset_path = format!("/logo-visual/{}", entry.asset_path);
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
        if entry.reveal_profile != "progressive-zoom" {
            return Err(AppError::config(format!(
                "{} has an unsupported Logo revealProfile",
                entry.answer_id
            )));
        }
        if entry.clues.is_empty() {
            return Err(AppError::config(format!(
                "{} needs at least one Logo clue",
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
        if (!entry.source_url.is_empty() && !entry.source_url.starts_with("https://"))
            || entry.license.trim().is_empty()
            || entry.asset_name.trim().is_empty()
            || (!entry.asset_path.starts_with("/logo-assets/")
                && !entry.asset_path.starts_with("/logo-visual/"))
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
        for clue in &entry.clues {
            if clue.after_incorrect_guesses == 0
                || clue.after_incorrect_guesses < previous_threshold
                || clue.kind.trim().is_empty()
                || (clue.kind != "image" && clue.text.trim().is_empty())
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

fn logo_asset(asset_path: &str) -> AppResult<&'static [u8]> {
    let relative_path = asset_path
        .strip_prefix("/logo-visual/")
        .ok_or_else(|| AppError::Unavailable("Logo image asset is unavailable.".to_owned()))?;
    LOGO_ASSETS
        .get_file(relative_path)
        .map(|file| file.contents())
        .ok_or_else(|| AppError::Unavailable("Logo image asset is unavailable.".to_owned()))
}

pub fn render_logo_image(
    asset_path: &str,
    focal_point: FocalPoint,
    revision: usize,
    solved: bool,
) -> AppResult<Vec<u8>> {
    let source = image::load_from_memory(logo_asset(asset_path)?)
        .map_err(|_| AppError::Unavailable("Logo image asset could not be decoded.".to_owned()))?;
    let rendered = if solved {
        source.resize(RENDER_SIZE, RENDER_SIZE, FilterType::Lanczos3)
    } else {
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
    };
    let mut encoded = Cursor::new(Vec::new());
    rendered
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|_| AppError::Unavailable("Logo image could not be rendered.".to_owned()))?;
    Ok(encoded.into_inner())
}

#[cfg(test)]
mod tests;
