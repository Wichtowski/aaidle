use super::*;

pub(crate) fn source_image() -> Vec<u8> {
    let pixels = image::RgbImage::from_fn(64, 48, |x, y| {
        image::Rgb([(x * 3) as u8, (y * 4) as u8, (x + y) as u8])
    });
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(pixels)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    bytes.into_inner()
}

const ZOOM: RevealProfile = RevealProfile::ProgressiveZoom {
    focal_point: crate::domain::logo::FocalPoint { x: 164.0, y: 174.0 },
};

pub(crate) struct ImageFixture {
    pub root: PathBuf,
}

impl Drop for ImageFixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.root).unwrap();
    }
}

pub(crate) fn image_fixture() -> ImageFixture {
    let root = std::env::temp_dir().join(format!("aaidle-logo-images-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let mut paths = vec!["/image.png".to_owned(), "/clue.png".to_owned()];
    for entry in crate::domain::logo::LogoCatalog::load().unwrap().entries() {
        paths.push(entry.asset_path.clone());
        paths.extend(entry.clues.iter().filter_map(|clue| clue.asset.clone()));
    }
    for path in paths {
        let path = root.join(path.trim_start_matches('/'));
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, source_image()).unwrap();
    }
    std::fs::write(root.join("broken.png"), b"not an image").unwrap();
    std::fs::write(root.join("oversized.png"), vec![0_u8; MAX_SOURCE_BYTES + 1]).unwrap();
    ImageFixture { root }
}

#[tokio::test]
async fn caches_originals_across_renders_and_resets_for_a_new_challenge() {
    let fixture = image_fixture();
    let cache = LogoImageCache::new(&fixture.root).unwrap();
    let first = cache
        .image("today", "/image.png", ZOOM, 0, false)
        .await
        .unwrap();
    assert_eq!(
        cache
            .image("today", "/image.png", ZOOM, 0, false)
            .await
            .unwrap(),
        first
    );
    assert_ne!(
        cache
            .image("today", "/image.png", ZOOM, 3, false)
            .await
            .unwrap(),
        first
    );
    cache
        .image("today", "/clue.png", ZOOM, 0, true)
        .await
        .unwrap();
    assert_eq!(cache.inner.lock().await.originals.len(), 2);

    cache
        .image("tomorrow", "/image.png", ZOOM, 0, false)
        .await
        .unwrap();
    let inner = cache.inner.lock().await;
    assert_eq!(inner.challenge_id, "tomorrow");
    assert_eq!(inner.originals.len(), 1);
}

#[tokio::test]
async fn expired_originals_are_read_again() {
    let fixture = image_fixture();
    let cache = LogoImageCache::new(&fixture.root).unwrap();
    cache
        .image("today", "/image.png", ZOOM, 0, false)
        .await
        .unwrap();
    cache
        .inner
        .lock()
        .await
        .originals
        .get_mut("/image.png")
        .unwrap()
        .fetched_at = Instant::now() - ORIGINAL_TTL;
    std::fs::remove_file(fixture.root.join("image.png")).unwrap();

    assert!(matches!(
        cache.image("today", "/image.png", ZOOM, 0, false).await,
        Err(AppError::Unavailable(_))
    ));
    assert!(cache.inner.lock().await.originals.is_empty());
}

#[tokio::test]
async fn invalid_missing_oversized_and_broken_sources_are_not_cached() {
    let fixture = image_fixture();
    let cache = LogoImageCache::new(&fixture.root).unwrap();
    for path in [
        "/missing.png",
        "/oversized.png",
        "/broken.png",
        "//elsewhere.test/image.png",
        "/../image.png",
    ] {
        assert!(matches!(
            cache.image("today", path, ZOOM, 0, false).await,
            Err(AppError::Unavailable(_))
        ));
    }
    assert!(cache.inner.lock().await.originals.is_empty());
    assert!(cache.inner.lock().await.rendered.is_empty());
}

#[test]
fn image_root_must_be_an_existing_directory() {
    assert!(LogoImageCache::new("/missing-aaidle-logo-directory").is_err());
    let fixture = image_fixture();
    assert!(LogoImageCache::new(fixture.root.join("image.png")).is_err());
}

#[tokio::test]
async fn caches_distinct_reveal_profiles_and_parameters() {
    let fixture = image_fixture();
    let cache = LogoImageCache::new(&fixture.root).unwrap();
    let blur = RevealProfile::GaussianBlur {
        blur_start_strength: 4.0,
        blur_step_strength: 2.0,
    };
    let zoomed = cache
        .image("today", "/image.png", ZOOM, 1, false)
        .await
        .unwrap();
    let blurred = cache
        .image("today", "/image.png", blur, 1, false)
        .await
        .unwrap();
    assert_ne!(blurred, zoomed);
    assert_ne!(
        blurred,
        cache
            .image(
                "today",
                "/image.png",
                RevealProfile::GaussianBlur {
                    blur_start_strength: 4.0,
                    blur_step_strength: 1.0,
                },
                1,
                false,
            )
            .await
            .unwrap()
    );
    assert_eq!(cache.inner.lock().await.originals.len(), 1);
}

#[tokio::test]
async fn null_profile_returns_the_unchanged_original() {
    let fixture = image_fixture();
    let cache = LogoImageCache::new(&fixture.root).unwrap();
    let original = source_image();
    for (revision, solved) in [(0, false), (4, false), (7, true)] {
        assert_eq!(
            cache
                .image("today", "/image.png", RevealProfile::None, revision, solved,)
                .await
                .unwrap(),
            original
        );
    }
    assert_eq!(cache.inner.lock().await.rendered.len(), 1);
}
