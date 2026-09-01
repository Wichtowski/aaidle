use super::*;

#[test]
fn bundled_catalog_is_valid_and_has_reachable_five_miss_clues() {
    let catalog = LogoCatalog::load().unwrap();
    assert!(catalog.entries().count() >= 6);
    for entry in catalog.entries() {
        assert!(revealed_clues(entry, 4).is_empty());
        assert_eq!(revealed_clues(entry, 5).len(), 1);
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
