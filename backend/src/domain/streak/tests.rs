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

#[test]
fn first_and_reset_solutions_preserve_a_higher_best_streak() {
    let first = update_streak(
        &PlayerStreak {
            current_streak: 0,
            best_streak: 7,
            last_solved_date: None,
        },
        date!(2026 - 08 - 14),
    );
    assert_eq!(first.current_streak, 1);
    assert_eq!(first.best_streak, 7);

    let reset = update_streak(
        &PlayerStreak {
            current_streak: 3,
            best_streak: 7,
            last_solved_date: Some(date!(2026 - 08 - 14)),
        },
        date!(2026 - 08 - 20),
    );
    assert_eq!(reset.current_streak, 1);
    assert_eq!(reset.best_streak, 7);
}

#[test]
fn older_solution_dates_are_idempotent() {
    let previous = PlayerStreak {
        current_streak: 4,
        best_streak: 6,
        last_solved_date: Some(date!(2026 - 08 - 14)),
    };

    assert_eq!(update_streak(&previous, date!(2026 - 08 - 13)), previous);
}
