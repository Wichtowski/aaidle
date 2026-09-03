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
            asset: None,
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

    let profile = RevealProfile::ProgressiveZoom {
        focal_point: FocalPoint { x: 164.0, y: 174.0 },
    };
    let source = crate::logo_images::tests::source_image();
    let cropped = render_logo_image(&source, profile, 0, false).expect("render initial crop");
    let solved = render_logo_image(&source, profile, 0, true).expect("render solved image");

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
fn zero_threshold_clues_are_available_without_guesses_and_assets_stay_private() {
    let mut entries = LogoCatalog::load()
        .unwrap()
        .entries()
        .cloned()
        .collect::<Vec<_>>();
    let entry = entries
        .iter_mut()
        .find(|entry| entry.answer_id == "alexnet")
        .unwrap();
    entry.clues[0].after_incorrect_guesses = 0;
    entry.clues[1].after_incorrect_guesses = 0;
    entry.clues[1].asset = Some("model_architecture_2_timeline.png".to_owned());
    entry.asset_path = "model_architecture_2.png".to_owned();
    let catalog = LogoCatalog::from_entries(entries).unwrap();
    let entry = catalog.entry("alexnet").unwrap();
    let clues = revealed_clues(entry, 0);
    assert_eq!(clues.len(), 2);
    assert_eq!(entry.asset_path, "/logo-visual/model_architecture_2.png");
    assert_eq!(
        clues[1].asset.as_deref(),
        Some("/logo-visual/model_architecture_2_timeline.png")
    );
    let public = serde_json::to_value(&clues[1]).unwrap();
    assert!(public.get("asset").is_none());
    assert!(
        serde_json::from_value::<LogoTextClue>(serde_json::json!({
            "afterIncorrectGuesses": -1, "kind": "general", "text": "Invalid"
        }))
        .is_err()
    );
}

#[test]
fn clue_validation_rejects_unordered_thresholds_and_invalid_image_assets() {
    let original = LogoCatalog::load()
        .unwrap()
        .entries()
        .cloned()
        .collect::<Vec<_>>();
    for asset in [
        None,
        Some("/logo-visual/../secret.png"),
        Some("//example.com/image.png"),
        Some("/logo-visual/image.png?token=secret"),
        Some("https://example.com/image.png"),
    ] {
        let mut entries = original.clone();
        let entry = entries
            .iter_mut()
            .find(|entry| entry.answer_id == "alexnet")
            .unwrap();
        entry.clues[1].asset = asset.map(str::to_owned);
        assert!(validate_seed(&entries).is_err());
    }
    let mut entries = original;
    let entry = entries
        .iter_mut()
        .find(|entry| entry.answer_id == "alexnet")
        .unwrap();
    entry.clues[1].after_incorrect_guesses = 0;
    assert!(validate_seed(&entries).is_err());
}

#[test]
fn public_asset_urls_are_local_png_or_webp_paths() {
    for url in [
        "/logo-visual/edge/output.png",
        "/emoji-visual/rtx.webp",
        "/visuals/shared.png",
    ] {
        assert!(valid_asset_url(url));
    }
    for url in [
        "",
        "https://example.com/a.png",
        "//example.com/a.png",
        "/logo-visual/../a.png",
        "/a%2f.png",
        "/a.png?x=1",
        "/a.png#x",
        "/a.svg",
        "/a\\b.png",
    ] {
        assert!(!valid_asset_url(url));
    }
}

#[test]
fn renderer_rejects_non_image_downloads() {
    assert!(
        render_logo_image(
            b"<!doctype html>",
            RevealProfile::ProgressiveZoom {
                focal_point: FocalPoint { x: 0.0, y: 0.0 }
            },
            0,
            false
        )
        .is_err()
    );
}

#[test]
fn renderer_rejects_images_larger_than_the_decode_limit() {
    let image = image::DynamicImage::new_rgba8(8193, 1);
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, ImageFormat::Png).unwrap();
    assert!(
        render_logo_image(
            bytes.get_ref(),
            RevealProfile::ProgressiveZoom {
                focal_point: FocalPoint { x: 0.0, y: 0.0 }
            },
            0,
            false
        )
        .is_err()
    );
}

#[test]
fn gaussian_profile_deserializes_without_a_focal_point_and_validates_strengths() {
    let profile: RevealProfile = serde_json::from_value(serde_json::json!({
        "revealProfile": "gaussian-blur", "blurStartStrength": 28, "blurStepStrength": 4
    }))
    .unwrap();
    assert!(profile.is_valid());
    let value = serde_json::to_value(profile).unwrap();
    assert!(value.get("focalPoint").is_none());
    assert_eq!(profile.blur_strength(0), 28.0);
    assert_eq!(profile.blur_strength(1), 24.0);
    assert_eq!(profile.blur_strength(7), 0.0);
    assert_eq!(profile.blur_strength(usize::MAX), 0.0);
    let overshoot = RevealProfile::GaussianBlur {
        blur_start_strength: 5.0,
        blur_step_strength: 3.0,
    };
    assert_eq!(overshoot.blur_strength(2), 0.0);
    for bad in [0.0, -1.0, 65.0, f32::NAN, f32::INFINITY] {
        assert!(
            !RevealProfile::GaussianBlur {
                blur_start_strength: bad,
                blur_step_strength: 4.0
            }
            .is_valid()
        );
        assert!(
            !RevealProfile::GaussianBlur {
                blur_start_strength: 28.0,
                blur_step_strength: bad
            }
            .is_valid()
        );
    }
    for invalid in [
        serde_json::json!({"revealProfile": "gaussian-blur", "blurStartStrength": 28}),
        serde_json::json!({"revealProfile": "gaussian-blur", "blurStepStrength": 4}),
        serde_json::json!({"revealProfile": "progressive-zoom"}),
        serde_json::json!({"revealProfile": "unknown"}),
    ] {
        assert!(serde_json::from_value::<RevealProfile>(invalid).is_err());
    }
    let mut entries = LogoCatalog::load()
        .unwrap()
        .entries()
        .cloned()
        .collect::<Vec<_>>();
    entries[0].reveal = RevealProfile::GaussianBlur {
        blur_start_strength: 0.0,
        blur_step_strength: 4.0,
    };
    assert!(validate_seed(&entries).is_err());
}

#[test]
fn gaussian_renderer_preserves_the_full_frame_and_clears_blur_at_zero_or_on_solve() {
    use image::GenericImageView;
    let source = crate::logo_images::tests::source_image();
    let profile = RevealProfile::GaussianBlur {
        blur_start_strength: 4.0,
        blur_step_strength: 2.0,
    };
    let initial = render_logo_image(&source, profile, 0, false).unwrap();
    let next = render_logo_image(&source, profile, 1, false).unwrap();
    let clear = render_logo_image(&source, profile, 2, false).unwrap();
    let solved = render_logo_image(&source, profile, 0, true).unwrap();
    assert_ne!(initial, next);
    assert_ne!(next, clear);
    assert_eq!(clear, solved);
    for bytes in [&initial, &next, &clear] {
        assert_eq!(
            image::load_from_memory(bytes).unwrap().dimensions(),
            (512, 384)
        );
    }
    let zoom = RevealProfile::ProgressiveZoom {
        focal_point: FocalPoint { x: 164.0, y: 174.0 },
    };
    assert_eq!(zoom.blur_strength(0), 0.0);
    assert_ne!(zoom.cache_key(), profile.cache_key());
}
