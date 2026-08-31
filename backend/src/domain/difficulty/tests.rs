use super::*;

#[test]
fn all_difficulties_parse_and_round_trip_to_their_canonical_names() {
    let expected = [
        (Difficulty::Normal, "normal"),
        (Difficulty::Challenge, "challenge"),
        (Difficulty::Hardcore, "hardcore"),
    ];

    assert_eq!(Difficulty::ALL, expected.map(|(difficulty, _)| difficulty));
    for (difficulty, name) in expected {
        assert_eq!(Difficulty::parse(name), Some(difficulty));
        assert_eq!(difficulty.as_str(), name);
    }
}

#[test]
fn parsing_is_strict() {
    for invalid in ["", "Normal", "challenge ", "speedrun", "unknown"] {
        assert_eq!(Difficulty::parse(invalid), None);
    }
}

#[test]
fn serde_uses_lowercase_names_and_rejects_unknown_values() {
    assert_eq!(
        serde_json::to_string(&Difficulty::Hardcore).expect("serialize difficulty"),
        "\"hardcore\""
    );
    assert_eq!(
        serde_json::from_str::<Difficulty>("\"challenge\"").expect("deserialize difficulty"),
        Difficulty::Challenge
    );
    assert!(serde_json::from_str::<Difficulty>("\"Challenge\"").is_err());
}
