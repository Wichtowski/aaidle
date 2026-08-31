use super::*;

#[test]
fn tokens_are_bound_to_the_challenge_and_answer() {
    let token = create_access_token(
        "test secret that is longer than thirty two bytes",
        "one",
        "model-a",
    )
    .expect("token");
    assert!(
        has_access(
            "test secret that is longer than thirty two bytes",
            Some(&token),
            "one",
            "model-a"
        )
        .expect("access")
    );
    assert!(
        !has_access(
            "test secret that is longer than thirty two bytes",
            Some(&token),
            "two",
            "model-a"
        )
        .expect("wrong challenge")
    );
    assert!(
        !has_access(
            "test secret that is longer than thirty two bytes",
            Some(&token),
            "one",
            "model-b"
        )
        .expect("wrong answer")
    );
}

#[test]
fn absent_malformed_and_tampered_tokens_are_denied() {
    let secret = "test secret that is longer than thirty two bytes";
    for token in [
        None,
        Some(""),
        Some("without-a-separator"),
        Some("payload.short"),
    ] {
        assert!(!has_access(secret, token, "one", "model-a").expect("access check"));
    }

    let valid = create_access_token(secret, "one", "model-a").expect("token");
    let (payload, provided_signature) = valid.split_once('.').expect("token segments");
    let mut tampered_signature = provided_signature.as_bytes().to_vec();
    tampered_signature[0] = if tampered_signature[0] == b'A' {
        b'B'
    } else {
        b'A'
    };
    let tampered = format!(
        "{payload}.{}",
        String::from_utf8(tampered_signature).expect("ASCII")
    );
    assert!(!has_access(secret, Some(&tampered), "one", "model-a").expect("access check"));
}

#[test]
fn correctly_signed_non_payload_data_is_denied() {
    let secret = "test secret that is longer than thirty two bytes";
    for payload in ["%%%", "bm90IGpzb24", "e30"] {
        let token = format!(
            "{payload}.{}",
            signature(secret, payload).expect("signature")
        );
        assert!(!has_access(secret, Some(&token), "one", "model-a").expect("access check"));
    }
}

#[test]
fn constant_time_comparison_handles_lengths_and_byte_differences() {
    assert!(constant_time_eq(b"", b""));
    assert!(constant_time_eq(b"same", b"same"));
    assert!(!constant_time_eq(b"short", b"longer"));
    assert!(!constant_time_eq(b"same", b"came"));
    assert!(!constant_time_eq(b"same", b"samf"));
}
