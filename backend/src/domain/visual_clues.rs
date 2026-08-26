use std::collections::HashMap;

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

#[derive(Clone, Debug)]
pub struct VisualClueCatalog {
    entities: Vec<VisualClueEntity>,
    entity_indexes: HashMap<String, usize>,
}

impl VisualClueCatalog {
    pub fn load() -> AppResult<Self> {
        let entities: Vec<VisualClueEntity> =
            serde_json::from_str(include_str!("../../../data/emoji.seed.json"))?;
        validate_seed(&entities)?;
        let mut entity_indexes = HashMap::with_capacity(entities.len());
        for (index, entity) in entities.iter().enumerate() {
            if entity_indexes.insert(entity.id.clone(), index).is_some() {
                return Err(AppError::config(format!(
                    "Duplicate Emoji Clues entity ID: {}",
                    entity.id
                )));
            }
        }
        Ok(Self {
            entities,
            entity_indexes,
        })
    }

    pub fn entity(&self, id: &str) -> Option<&VisualClueEntity> {
        self.entity_indexes
            .get(id)
            .and_then(|index| self.entities.get(*index))
    }

    pub fn eligible(&self, pool: u8) -> impl Iterator<Item = &VisualClueEntity> {
        self.entities
            .iter()
            .filter(move |entity| entity.min_pool <= pool)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EntityKind {
    Emoji,
    Architecture,
    Algorithm,
    Operator,
    Technology,
}

impl EntityKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Emoji => "emoji",
            Self::Architecture => "architecture",
            Self::Algorithm => "algorithm",
            Self::Operator => "operator",
            Self::Technology => "technology",
        }
    }
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
    Hardware,
    Technology,
    Creator,
    Other,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualClueVariant {
    pub id: String,
    #[serde(default)]
    pub min_pool: u8,
    pub weight: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_reveal_count: Option<usize>,
    pub clues: Vec<VisualClue>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum VisualClue {
    Emoji {
        value: String,
        #[serde(skip_serializing)]
        meaning: Option<String>,
        #[serde(rename = "revealPriority")]
        #[serde(skip_serializing_if = "Option::is_none")]
        reveal_priority: Option<i32>,
    },
    Icon {
        #[serde(alias = "value")]
        icon: String,
        #[serde(skip_serializing)]
        meaning: Option<String>,
        #[serde(rename = "revealPriority")]
        #[serde(skip_serializing_if = "Option::is_none")]
        reveal_priority: Option<i32>,
    },
    Image {
        src: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        alt: Option<String>,
        #[serde(rename = "revealPriority")]
        #[serde(skip_serializing_if = "Option::is_none")]
        reveal_priority: Option<i32>,
    },
}

impl VisualClue {
    fn reveal_priority(&self) -> Option<i32> {
        match self {
            Self::Emoji {
                reveal_priority, ..
            }
            | Self::Icon {
                reveal_priority, ..
            }
            | Self::Image {
                reveal_priority, ..
            } => *reveal_priority,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedVisualClueVariant {
    pub variant_id: String,
    pub initial_reveal_count: usize,
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
    // A missing priority falls back to its position in the seed. Stable sorting preserves ties.
    let mut indexed_clues = variant
        .clues
        .iter()
        .cloned()
        .enumerate()
        .collect::<Vec<_>>();
    indexed_clues.sort_by_key(|(index, clue)| {
        (
            clue.reveal_priority().is_none(),
            clue.reveal_priority().unwrap_or(*index as i32 + 1),
        )
    });
    let clues = indexed_clues.into_iter().map(|(_, clue)| clue).collect();
    Ok(ResolvedVisualClueVariant {
        variant_id: variant.id.clone(),
        initial_reveal_count: variant.initial_reveal_count.unwrap_or(1),
        clues,
    })
}

pub fn validate_seed(entities: &[VisualClueEntity]) -> AppResult<()> {
    for entity in entities {
        for variant in &entity.variants {
            if let Some(initial_reveal_count) = variant.initial_reveal_count {
                if initial_reveal_count == 0 {
                    return Err(AppError::config(format!(
                        "{}/{} initialRevealCount must be positive",
                        entity.id, variant.id
                    )));
                }
                if initial_reveal_count > variant.clues.len() {
                    return Err(AppError::config(format!(
                        "{}/{} initialRevealCount exceeds its clues",
                        entity.id, variant.id
                    )));
                }
            }
            for clue in &variant.clues {
                if let Some(priority) = clue.reveal_priority()
                    && priority <= 0
                {
                    return Err(AppError::config(format!(
                        "{}/{} revealPriority must be positive",
                        entity.id, variant.id
                    )));
                }
                if let VisualClue::Image { src, .. } = clue
                    && (!src.starts_with("/emoji-clues/") || src.trim().is_empty())
                {
                    return Err(AppError::config(format!(
                        "{}/{} image src must be a non-empty /emoji-clues/ path",
                        entity.id, variant.id
                    )));
                }
            }
        }
    }
    Ok(())
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
    fn seed_validation_and_resolution_support_image_clues() {
        let entity: VisualClueEntity = serde_json::from_str(r#"{
            "id":"nvidia", "name":"NVIDIA", "entityKind":"technology",
            "categories":["hardware"], "minPool":1, "variants":[{
              "id":"green", "weight":1, "initialRevealCount":2, "clues":[
                {"type":"emoji", "value":"🟢"},
                {"type":"image", "src":"/emoji-clues/jacket.webp", "alt":"Jacket", "revealPriority":1}
              ]
            }]
        }"#).expect("image seed deserializes");
        validate_seed(std::slice::from_ref(&entity)).expect("valid image seed");
        let resolved = resolve_variant(&entity, "green").expect("variant resolves");
        assert_eq!(resolved.initial_reveal_count, 2);
        assert!(matches!(resolved.clues[0], VisualClue::Image { .. }));

        let invalid: VisualClueEntity = serde_json::from_str(r#"{
            "id":"bad", "name":"Bad", "entityKind":"technology", "categories":["hardware"], "minPool":1,
            "variants":[{"id":"bad", "weight":1, "initialRevealCount":3,
              "clues":[{"type":"image", "src":"outside.webp"}]}]
        }"#).expect("invalid semantic seed deserializes");
        assert!(validate_seed(&[invalid]).is_err());
    }

    #[test]
    fn catalog_loads_entities_once_and_filters_by_pool() {
        let catalog = VisualClueCatalog::load().expect("catalog loads");

        let nvidia = catalog.entity("nvidia").expect("NVIDIA is seeded");
        assert_eq!(nvidia.name, "NVIDIA");
        let meta = catalog.entity("meta").expect("Meta is seeded");
        assert!(meta.categories.contains(&VisualClueCategory::Technology));
        assert!(catalog.eligible(0).all(|entity| entity.min_pool == 0));
        assert!(catalog.eligible(2).count() > catalog.eligible(0).count());
    }

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
                    initial_reveal_count: None,
                    clues: vec![],
                },
                VisualClueVariant {
                    id: "hard".to_owned(),
                    min_pool: 1,
                    weight: 1,
                    initial_reveal_count: None,
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
