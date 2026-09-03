use super::*;
use axum::{
    Router,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use std::sync::atomic::{AtomicUsize, Ordering};

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

pub(crate) struct ImageServer {
    pub origin: String,
    pub requests: Arc<AtomicUsize>,
    handle: tokio::task::JoinHandle<()>,
}
impl Drop for ImageServer {
    fn drop(&mut self) {
        self.handle.abort();
    }
}

pub(crate) async fn image_server() -> ImageServer {
    async fn serve(
        State(requests): State<Arc<AtomicUsize>>,
        Path(path): Path<String>,
        headers: HeaderMap,
    ) -> Response {
        requests.fetch_add(1, Ordering::SeqCst);
        assert!(headers.get("cookie").is_none());
        assert!(headers.get("authorization").is_none());
        match path.as_str() {
            "missing.png" => StatusCode::NOT_FOUND.into_response(),
            "redirect.png" => (StatusCode::FOUND, [("location", "/image.png")]).into_response(),
            "broken.png" => "<!doctype html>".into_response(),
            "oversized.png" => Body::from(vec![0u8; MAX_SOURCE_BYTES + 1]).into_response(),
            "slow.png" => {
                tokio::time::sleep(Duration::from_millis(200)).await;
                source_image().into_response()
            }
            _ => ([("content-type", "image/png")], source_image()).into_response(),
        }
    }
    let requests = Arc::new(AtomicUsize::new(0));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let router = Router::new()
        .route("/{*path}", get(serve))
        .with_state(requests.clone());
    let handle = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    ImageServer {
        origin,
        requests,
        handle,
    }
}

#[tokio::test]
async fn downloads_once_across_revisions_and_clues_and_resets_for_a_new_challenge() {
    let server = image_server().await;
    let cache = LogoImageCache::new(&server.origin, Duration::from_secs(2)).unwrap();
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
    let wider = cache
        .image("today", "/image.png", ZOOM, 3, false)
        .await
        .unwrap();
    assert_ne!(wider, first);
    let solved = cache
        .image("today", "/image.png", ZOOM, 3, true)
        .await
        .unwrap();
    assert_ne!(solved, wider);
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
    cache
        .image("today", "/clue.png", ZOOM, 0, true)
        .await
        .unwrap();
    cache
        .image("today", "/image.png", ZOOM, 1, false)
        .await
        .unwrap();
    assert_eq!(server.requests.load(Ordering::SeqCst), 2);
    cache
        .image("tomorrow", "/image.png", ZOOM, 0, false)
        .await
        .unwrap();
    assert_eq!(server.requests.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn expires_originals_after_twenty_four_hours_and_deduplicates_concurrent_requests() {
    let server = image_server().await;
    let cache = LogoImageCache::new(&server.origin, Duration::from_secs(2)).unwrap();
    let (first, second) = tokio::join!(
        cache.image("today", "/image.png", ZOOM, 0, false),
        cache.image("today", "/image.png", ZOOM, 0, false)
    );
    assert_eq!(first.unwrap(), second.unwrap());
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
    cache
        .inner
        .lock()
        .await
        .originals
        .get_mut("/image.png")
        .unwrap()
        .fetched_at = Instant::now() - ORIGINAL_TTL;
    cache
        .image("today", "/image.png", ZOOM, 0, false)
        .await
        .unwrap();
    assert_eq!(server.requests.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn download_failures_are_safe_and_not_cached() {
    let server = image_server().await;
    let cache = LogoImageCache::new(&server.origin, Duration::from_millis(100)).unwrap();
    for path in [
        "/missing.png",
        "/redirect.png",
        "/broken.png",
        "/oversized.png",
        "/slow.png",
    ] {
        for _ in 0..2 {
            assert!(matches!(
                cache.image("today", path, ZOOM, 0, false).await,
                Err(AppError::Unavailable(_))
            ));
        }
    }
    assert_eq!(server.requests.load(Ordering::SeqCst), 10);
    assert!(cache.inner.lock().await.originals.is_empty());
    assert!(cache.inner.lock().await.rendered.is_empty());
}

#[tokio::test]
async fn invalid_origins_and_urls_never_start_downloads() {
    for origin in [
        "invalid",
        "file:///tmp",
        "https://user:password@example.com",
    ] {
        assert!(LogoImageCache::new(origin, Duration::from_secs(1)).is_err());
    }
    let server = image_server().await;
    let cache = LogoImageCache::new(&server.origin, Duration::from_secs(1)).unwrap();
    assert!(
        cache
            .image("today", "//elsewhere.test/image.png", ZOOM, 0, false)
            .await
            .is_err()
    );
    assert_eq!(server.requests.load(Ordering::SeqCst), 0);
    let unavailable_origin = server.origin.clone();
    drop(server);
    let cache = LogoImageCache::new(&unavailable_origin, Duration::from_millis(100)).unwrap();
    assert!(
        cache
            .image("today", "/image.png", ZOOM, 0, false)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn rejects_oversized_chunked_and_truncated_downloads() {
    use std::io::{Read, Write};
    for chunked in [true, false] {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            assert!(stream.read(&mut request).unwrap() > 0);
            if chunked {
                let payload = vec![0u8; MAX_SOURCE_BYTES + 1];
                let header = format!(
                    "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:X}\r\n",
                    payload.len()
                );
                stream.write_all(header.as_bytes()).unwrap();
                let _ = stream.write_all(&payload);
                let _ = stream.write_all(b"\r\n0\r\n\r\n");
            } else {
                stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\nConnection: close\r\n\r\nshort").unwrap();
            }
        });
        let cache = LogoImageCache::new(&origin, Duration::from_secs(2)).unwrap();
        let error = cache
            .image("today", "/image.png", ZOOM, 0, false)
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Unavailable(_)));
        if chunked {
            assert!(error.to_string().contains("too large"));
        }
        assert!(cache.inner.lock().await.originals.is_empty());
        server.join().unwrap();
    }
}

#[tokio::test]
async fn caches_distinct_reveal_profiles_and_blur_parameters_for_the_same_original() {
    let server = image_server().await;
    let cache = LogoImageCache::new(&server.origin, Duration::from_secs(2)).unwrap();
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
    let different_step = RevealProfile::GaussianBlur {
        blur_start_strength: 4.0,
        blur_step_strength: 1.0,
    };
    assert_ne!(
        blurred,
        cache
            .image("today", "/image.png", different_step, 1, false)
            .await
            .unwrap()
    );
    let different_start = RevealProfile::GaussianBlur {
        blur_start_strength: 3.0,
        blur_step_strength: 2.0,
    };
    assert_ne!(
        blurred,
        cache
            .image("today", "/image.png", different_start, 1, false)
            .await
            .unwrap()
    );
    assert_eq!(
        cache
            .image("today", "/image.png", blur, 1, false)
            .await
            .unwrap(),
        blurred
    );
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
}
