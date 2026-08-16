use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiPuzzle {
    pub family_id: String,
    pub variants: Vec<EmojiClueVariant>,
    pub logo_hint: Option<EmojiLogoHint>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EmojiClueVariant {
    pub slots: Vec<EmojiClueSlot>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiClueSlot {
    pub concept: String,
    pub emoji_candidates: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiLogoHint {
    pub asset_key: String,
    pub reveal_modes: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedEmojiPuzzle {
    pub family_id: String,
    pub emoji: Vec<String>,
}

pub fn generate_puzzle(
    date: &str,
    secret: &str,
    puzzles: &[EmojiPuzzle],
) -> AppResult<ResolvedEmojiPuzzle> {
    if puzzles.is_empty() {
        return Err(AppError::Unavailable(
            "No Emoji puzzles are configured.".to_owned(),
        ));
    }
    let challenge_seed = format!("{secret}:emoji:{date}");
    let family = seeded_order(puzzles, &format!("{challenge_seed}:{date}:family"))
        .into_iter()
        .next()
        .expect("non-empty puzzles");
    resolve_puzzle(date, &challenge_seed, family.1)
}

pub fn resolve_puzzle(
    date: &str,
    challenge_seed: &str,
    puzzle: &EmojiPuzzle,
) -> AppResult<ResolvedEmojiPuzzle> {
    let variants = seeded_order(
        &puzzle.variants,
        &format!("{challenge_seed}:{date}:{}:variant", puzzle.family_id),
    );
    for (index, variant) in variants {
        if let Some(emoji) = resolve_distinct_emoji(
            &variant.slots,
            &format!("{challenge_seed}:{date}:{}:{index}", puzzle.family_id),
        ) {
            return Ok(ResolvedEmojiPuzzle {
                family_id: puzzle.family_id.clone(),
                emoji,
            });
        }
    }
    Err(AppError::Unavailable(
        "Emoji puzzle has no valid clue arrangement.".to_owned(),
    ))
}

fn resolve_distinct_emoji(slots: &[EmojiClueSlot], seed: &str) -> Option<Vec<String>> {
    fn choose(
        slots: &[EmojiClueSlot],
        index: usize,
        seed: &str,
        selected: &mut Vec<String>,
    ) -> bool {
        if index == slots.len() {
            return true;
        }
        for (_, candidate) in
            seeded_order(&slots[index].emoji_candidates, &format!("{seed}:{index}"))
        {
            if selected.iter().any(|emoji| emoji == candidate) {
                continue;
            }
            selected.push(candidate.clone());
            if choose(slots, index + 1, seed, selected) {
                return true;
            }
            selected.pop();
        }
        false
    }

    let mut selected = Vec::with_capacity(slots.len());
    choose(slots, 0, seed, &mut selected).then_some(selected)
}

fn seeded_order<'a, T>(values: &'a [T], seed: &str) -> Vec<(usize, &'a T)> {
    let mut state = seed_to_u32(seed);
    let mut values = values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            state = state.wrapping_add(0x6d2b79f5);
            let mut rank = state;
            rank = rank.wrapping_mul((rank ^ (rank >> 15)) | 1);
            rank ^= rank.wrapping_add((rank ^ (rank >> 7)).wrapping_mul(rank | 61));
            let rank = rank ^ (rank >> 14);
            (value, rank, index)
        })
        .collect::<Vec<_>>();
    values.sort_unstable_by_key(|(_, rank, index)| (*rank, *index));
    values
        .into_iter()
        .map(|(value, _, index)| (index, value))
        .collect()
}

fn seed_to_u32(seed: &str) -> u32 {
    seed.chars().fold(2_166_136_261_u32, |hash, character| {
        (hash ^ character as u32).wrapping_mul(16_777_619)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_unique_emoji_deterministically() {
        let puzzles = vec![EmojiPuzzle {
            family_id: "family".to_owned(),
            variants: vec![EmojiClueVariant {
                slots: vec![
                    EmojiClueSlot {
                        concept: "one".to_owned(),
                        emoji_candidates: vec!["a".to_owned(), "b".to_owned()],
                    },
                    EmojiClueSlot {
                        concept: "two".to_owned(),
                        emoji_candidates: vec!["a".to_owned(), "c".to_owned()],
                    },
                ],
            }],
            logo_hint: None,
        }];
        let result = generate_puzzle("2026-08-16", "test secret", &puzzles).expect("puzzle");
        assert_eq!(
            result,
            generate_puzzle("2026-08-16", "test secret", &puzzles).expect("puzzle")
        );
        assert_ne!(result.emoji[0], result.emoji[1]);
    }
}
