use super::*;

#[test]
fn seed_validation_and_resolution_support_image_clues() {
    let entity: VisualClueEntity = serde_json::from_str(r#"{
            "id":"nvidia", "name":"NVIDIA", "entityKind":"technology",
            "categories":["hardware"], "minPool":1, "variants":[{
              "id":"green", "weight":1, "initialRevealCount":2, "visuals":[
                {"type":"emoji", "value":"🟢"},
                {"type":"image", "src":"/emoji-visual/jacket.webp", "alt":"Jacket", "revealPriority":1}
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
              "visuals":[{"type":"image", "src":"outside.webp"}]}]
        }"#).expect("invalid semantic seed deserializes");
    assert!(validate_seed(&[invalid]).is_err());
}

#[test]
fn catalog_loads_entities_once_and_filters_by_pool() {
    let catalog = VisualClueCatalog::load().expect("catalog loads");

    let nvidia = catalog.entity("nvidia").expect("NVIDIA is seeded");
    assert_eq!(nvidia.name, "NVIDIA");
    assert!(catalog.entity("not-seeded").is_none());
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
                visuals: vec![],
            },
            VisualClueVariant {
                id: "hard".to_owned(),
                min_pool: 1,
                weight: 1,
                initial_reveal_count: None,
                visuals: vec![],
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

fn entity_with(variants: Vec<VisualClueVariant>) -> VisualClueEntity {
    VisualClueEntity {
        id: "entity".to_owned(),
        name: "Entity".to_owned(),
        aliases: vec![],
        entity_kind: EntityKind::Technology,
        categories: vec![VisualClueCategory::Technology],
        min_pool: 0,
        variants,
    }
}

fn variant(visuals: Vec<VisualClue>) -> VisualClueVariant {
    VisualClueVariant {
        id: "variant".to_owned(),
        min_pool: 0,
        weight: 1,
        initial_reveal_count: None,
        visuals,
    }
}

#[test]
fn entity_kind_names_cover_every_seed_kind() {
    assert_eq!(EntityKind::Emoji.as_str(), "emoji");
    assert_eq!(EntityKind::Architecture.as_str(), "architecture");
    assert_eq!(EntityKind::Algorithm.as_str(), "algorithm");
    assert_eq!(EntityKind::Operator.as_str(), "operator");
    assert_eq!(EntityKind::Technology.as_str(), "technology");
}

#[test]
fn resolution_orders_all_clue_types_and_uses_default_reveal_count() {
    let entity = entity_with(vec![variant(vec![
        VisualClue::Emoji {
            value: "late".to_owned(),
            action: None,
            to_value: None,
            meaning: None,
            reveal_priority: Some(3),
        },
        VisualClue::Icon {
            icon: "first".to_owned(),
            meaning: None,
            reveal_priority: Some(1),
        },
        VisualClue::Image {
            src: "/emoji-visual/default.webp".to_owned(),
            alt: None,
            reveal_priority: None,
        },
    ])]);

    let resolved = resolve_variant(&entity, "variant").expect("resolve variant");
    assert_eq!(resolved.initial_reveal_count, 1);
    assert!(matches!(resolved.clues[0], VisualClue::Icon { .. }));
    assert!(matches!(resolved.clues[1], VisualClue::Emoji { .. }));
    assert!(matches!(resolved.clues[2], VisualClue::Image { .. }));
    assert!(resolve_variant(&entity, "missing").is_err());
}

#[test]
fn validation_rejects_each_invalid_count_priority_and_image_path() {
    let emoji = |priority| VisualClue::Emoji {
        value: "clue".to_owned(),
        action: None,
        to_value: None,
        meaning: None,
        reveal_priority: priority,
    };

    let mut invalid = variant(vec![emoji(None)]);
    invalid.initial_reveal_count = Some(0);
    assert!(validate_seed(&[entity_with(vec![invalid])]).is_err());

    let mut invalid = variant(vec![emoji(None)]);
    invalid.initial_reveal_count = Some(2);
    assert!(validate_seed(&[entity_with(vec![invalid])]).is_err());

    for priority in [0, -1] {
        assert!(validate_seed(&[entity_with(vec![variant(vec![emoji(Some(priority))])])]).is_err());
    }

    for src in ["", "image.webp", " /emoji-visual/image.webp"] {
        let image = VisualClue::Image {
            src: src.to_owned(),
            alt: None,
            reveal_priority: Some(1),
        };
        assert!(validate_seed(&[entity_with(vec![variant(vec![image])])]).is_err());
    }

    let icon = VisualClue::Icon {
        icon: "check".to_owned(),
        meaning: None,
        reveal_priority: Some(1),
    };
    assert!(validate_seed(&[entity_with(vec![variant(vec![icon])])]).is_ok());
}

#[test]
fn weighted_selection_rejects_empty_weight_and_can_reach_later_variants() {
    let mut unavailable = variant(vec![]);
    unavailable.weight = 0;
    unavailable.min_pool = 1;
    assert!(weighted_variant_id(&entity_with(vec![unavailable]), 0, "seed").is_err());

    let variants = vec![
        VisualClueVariant {
            id: "disabled".to_owned(),
            weight: 0,
            ..variant(vec![])
        },
        VisualClueVariant {
            id: "first".to_owned(),
            weight: 1,
            ..variant(vec![])
        },
        VisualClueVariant {
            id: "second".to_owned(),
            weight: 1,
            ..variant(vec![])
        },
    ];
    let entity = entity_with(variants);
    let seed = (0..100)
        .map(|value| value.to_string())
        .find(|seed| stable_hash(seed) % 2 == 1)
        .expect("a seed selecting the second variant");
    assert_eq!(
        weighted_variant_id(&entity, 0, &seed).expect("variant"),
        "second"
    );
    assert_eq!(stable_hash("emoji"), stable_hash("emoji"));
    assert_ne!(stable_hash("emoji"), stable_hash("Emoji"));
}
