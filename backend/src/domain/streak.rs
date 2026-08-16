use time::Date;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlayerStreak {
    pub current_streak: i64,
    pub best_streak: i64,
    pub last_solved_date: Option<Date>,
}

pub fn update_streak(previous: &PlayerStreak, challenge_date: Date) -> PlayerStreak {
    let Some(last_solved_date) = previous.last_solved_date else {
        return PlayerStreak {
            current_streak: 1,
            best_streak: previous.best_streak.max(1),
            last_solved_date: Some(challenge_date),
        };
    };
    if challenge_date <= last_solved_date {
        return previous.clone();
    }

    let current_streak = if last_solved_date.next_day() == Some(challenge_date) {
        previous.current_streak + 1
    } else {
        1
    };
    PlayerStreak {
        current_streak,
        best_streak: previous.best_streak.max(current_streak),
        last_solved_date: Some(challenge_date),
    }
}

#[cfg(test)]
mod tests {
    use time::macros::date;

    use super::*;

    #[test]
    fn updates_consecutive_and_skipped_day_streaks() {
        let first = update_streak(
            &PlayerStreak {
                current_streak: 0,
                best_streak: 0,
                last_solved_date: None,
            },
            date!(2026 - 08 - 14),
        );
        let consecutive = update_streak(&first, date!(2026 - 08 - 15));
        assert_eq!(consecutive.current_streak, 2);
        assert_eq!(consecutive.best_streak, 2);
        assert_eq!(
            update_streak(&consecutive, date!(2026 - 08 - 15)),
            consecutive
        );
        assert_eq!(
            update_streak(&consecutive, date!(2026 - 08 - 17)).current_streak,
            1
        );
    }
}
