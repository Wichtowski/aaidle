use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualClueEntity {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub entity_kind: EntityKind,
    pub categories: Vec<VisualClueCategory>,
    pub min_pool: u8,
    pub variants: Vec<VisualClueVariant>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EntityKind {
    Emoji,
    Architecture,
    Algorithm,
    Operator,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum VisualClueCategory {
    LanguageModel,
    ComputerVision,
    Nlp,
    ObjectDetection,
    ClassicalMl,
    ImageProcessing,
    NeuralNetwork,
    Other,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualClueVariant {
    pub id: String,
    #[serde(default)]
    pub min_pool: u8,
    pub weight: u32,
    #[serde(default)]
    pub reveal_mode: RevealMode,
    pub clues: Vec<VisualClue>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RevealMode {
    #[default]
    Progressive,
    AllAtOnce,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum VisualClue {
    Emoji {
        value: String,
        #[serde(skip_serializing)]
        meaning: Option<String>,
        #[serde(default)]
        reveal_priority: i32,
    },
    Icon {
        icon: String,
        #[serde(skip_serializing)]
        meaning: Option<String>,
        #[serde(default)]
        reveal_priority: i32,
    },
}

impl VisualClue {
    fn priority(&self) -> i32 {
        match self {
            Self::Emoji {
                reveal_priority, ..
            }
            | Self::Icon {
                reveal_priority, ..
            } => *reveal_priority,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedVisualClueVariant {
    pub variant_id: String,
    pub reveal_mode: RevealMode,
    pub clues: Vec<VisualClue>,
}

pub fn resolve_variant(
    entity: &VisualClueEntity,
    variant_id: &str,
) -> AppResult<ResolvedVisualClueVariant> {
    let variant = entity
        .variants
        .iter()
        .find(|variant| variant.id == variant_id)
        .ok_or_else(|| AppError::Unavailable("Visual Clue variant is unavailable.".to_owned()))?;
    let mut clues = variant.clues.clone();
    clues.sort_by_key(VisualClue::priority);
    Ok(ResolvedVisualClueVariant {
        variant_id: variant.id.clone(),
        reveal_mode: variant.reveal_mode.clone(),
        clues,
    })
}

pub fn weighted_variant_id(entity: &VisualClueEntity, pool: u8, seed: &str) -> AppResult<String> {
    let variants = entity
        .variants
        .iter()
        .filter(|variant| variant.min_pool <= pool)
        .collect::<Vec<_>>();
    let total = variants
        .iter()
        .map(|variant| variant.weight as u64)
        .sum::<u64>();
    if total == 0 {
        return Err(AppError::Unavailable(
            "No Visual Clue variant is available for this difficulty.".to_owned(),
        ));
    }
    let mut selected = stable_hash(seed) as u64 % total;
    for variant in variants {
        if selected < variant.weight as u64 {
            return Ok(variant.id.clone());
        }
        selected -= variant.weight as u64;
    }
    unreachable!("positive weighted variants always select an item")
}

pub fn stable_hash(value: &str) -> u32 {
    value.chars().fold(2_166_136_261_u32, |hash, character| {
        (hash ^ character as u32).wrapping_mul(16_777_619)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weighted_variant_selection_is_deterministic_and_respects_the_pool() {
        let entity = VisualClueEntity {
            id: "test".to_owned(),
            name: "Test".to_owned(),
            aliases: vec![],
            entity_kind: EntityKind::Emoji,
            categories: vec![VisualClueCategory::LanguageModel],
            min_pool: 0,
            variants: vec![
                VisualClueVariant {
                    id: "normal".to_owned(),
                    min_pool: 0,
                    weight: 4,
                    reveal_mode: RevealMode::Progressive,
                    clues: vec![],
                },
                VisualClueVariant {
                    id: "hard".to_owned(),
                    min_pool: 1,
                    weight: 1,
                    reveal_mode: RevealMode::Progressive,
                    clues: vec![],
                },
            ],
        };
        assert_eq!(
            weighted_variant_id(&entity, 0, "seed").expect("variant"),
            weighted_variant_id(&entity, 0, "seed").expect("variant")
        );
        assert_eq!(
            weighted_variant_id(&entity, 0, "seed").expect("variant"),
            "normal"
        );
    }
}
