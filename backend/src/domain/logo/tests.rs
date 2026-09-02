use super::*;

#[test]
fn bundled_catalog_is_valid_and_has_reachable_clues() {
    let catalog = LogoCatalog::load().unwrap();
    assert!(catalog.entries().count() >= 6);
    for entry in catalog.entries() {
        assert!(!revealed_clues(entry, 5).is_empty());
    }
}

#[test]
fn reveal_revision_is_monotonic_and_bounded() {
    assert_eq!(reveal_revision(0), 0);
    assert_eq!(reveal_revision(3), 3);
    assert_eq!(reveal_revision(usize::MAX), MAX_REVEAL_REVISION);
}

#[test]
fn zoom_levels_end_at_the_full_image() {
    assert_eq!(zoom_for_revision(0), 4.2);
    assert_eq!(zoom_for_revision(MAX_REVEAL_REVISION), 1.0);
}

#[test]
fn validation_rejects_duplicate_and_incomplete_entries() {
    let catalog = LogoCatalog::load().unwrap();
    let mut entries = catalog.entries().cloned().collect::<Vec<_>>();
    entries.push(entries[0].clone());
    assert!(validate_seed(&entries).is_err());

    let mut entries = catalog.entries().cloned().collect::<Vec<_>>();
    entries[0].clues.clear();
    assert!(validate_seed(&entries).is_err());
}

#[test]
fn portraits_require_an_educational_three_miss_clue() {
    let catalog = LogoCatalog::load().unwrap();
    let mut entries = catalog.entries().cloned().collect::<Vec<_>>();
    entries[0].visual_type = VisualType::DiscovererPortrait;
    entries[0].people.push(LogoPerson {
        name: "Researcher".to_owned(),
        source_url: "https://example.com/researcher".to_owned(),
        license: "test".to_owned(),
        attribution: "Test portrait".to_owned(),
    });
    assert!(validate_seed(&entries).is_err());

    entries[0].clues.insert(
        0,
        LogoTextClue {
            after_incorrect_guesses: 3,
            kind: "educational".to_owned(),
            text: "A formula, proof, discovery, or contribution.".to_owned(),
        },
    );
    assert!(validate_seed(&entries).is_ok());
}

#[test]
fn renderer_returns_only_the_authorized_crop_until_solved() {
    use image::GenericImageView;

    let focal_point = FocalPoint { x: 164.0, y: 174.0 };
    let cropped = render_logo_image("/logo-visual/company-logo-1.png", focal_point, 0, false)
        .expect("render initial crop");
    let solved = render_logo_image("/logo-visual/company-logo-1.png", focal_point, 0, true)
        .expect("render solved image");

    assert_eq!(
        image::load_from_memory(&cropped).unwrap().dimensions(),
        (512, 512)
    );
    assert_eq!(
        image::load_from_memory(&solved).unwrap().dimensions(),
        (512, 384)
    );
    assert_ne!(cropped, solved);
}

#[test]
fn image_cache_reuses_variants_until_the_challenge_changes() {
    let cache = LogoImageCache::default();
    let focal_point = FocalPoint { x: 164.0, y: 174.0 };
    let rendered = cache
        .image(
            "challenge-one",
            "/logo-visual/company-logo-1.png",
            focal_point,
            0,
            false,
        )
        .expect("render cached image");
    let cached = cache
        .image(
            "challenge-one",
            "/logo-visual/company-logo-1.png",
            focal_point,
            0,
            false,
        )
        .expect("reuse cached image without reading the source again");

    assert_eq!(cached, rendered);
    assert!(
        cache
            .image("challenge-two", "/missing.png", focal_point, 0, false)
            .is_err()
    );
}
