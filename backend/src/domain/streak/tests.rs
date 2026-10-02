use time::macros::{date, datetime};

use super::*;

#[test]
fn family_streaks_deduplicate_days_preserve_gaps_and_expire() {
    let days = [
        date!(2026 - 08 - 28),
        date!(2026 - 08 - 29),
        date!(2026 - 08 - 30),
        date!(2026 - 08 - 30),
        date!(2026 - 08 - 31),
        date!(2026 - 09 - 01),
    ];
    let active = derive_streak(days, date!(2026 - 09 - 01));
    assert_eq!(active.current_streak, 5);
    assert_eq!(active.best_streak, 5);
    assert_eq!(derive_streak(days, date!(2026 - 09 - 02)).current_streak, 5);
    let expired = derive_streak(days, date!(2026 - 09 - 03));
    assert_eq!(expired.current_streak, 0);
    assert_eq!(expired.best_streak, 5);
    assert_eq!(expired.last_solved_date, Some(date!(2026 - 09 - 01)));
    let with_gap = derive_streak(
        [
            date!(2026 - 08 - 25),
            date!(2026 - 08 - 26),
            date!(2026 - 08 - 27),
            date!(2026 - 08 - 30),
            date!(2026 - 08 - 31),
            date!(2026 - 09 - 01),
        ],
        date!(2026 - 09 - 01),
    );
    assert_eq!(with_gap.current_streak, 3);
    assert_eq!(
        derive_streak([date!(2026 - 09 - 02)], date!(2026 - 09 - 01)).current_streak,
        0
    );
    assert_eq!(derive_streak([], Date::MIN).current_streak, 0);
}

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

#[test]
fn completions_qualify_on_their_day_or_shortly_after_when_started_on_it() {
    let day = date!(2026 - 09 - 30);
    let started = Some(datetime!(2026-09-30 23:55 UTC));
    // On the challenge's own day, with or without earlier activity
    assert!(completion_qualifies(
        day,
        datetime!(2026-09-30 00:00 UTC),
        None
    ));
    assert!(completion_qualifies(
        day,
        datetime!(2026-09-30 23:59:59.999 UTC),
        None
    ));
    assert!(completion_qualifies(
        day,
        datetime!(2026-10-01 01:30 +2),
        None
    ));
    // Just after midnight only a game already in progress on its own day counts
    assert!(completion_qualifies(
        day,
        datetime!(2026-10-01 00:00 UTC),
        started
    ));
    assert!(completion_qualifies(
        day,
        datetime!(2026-10-01 00:59:59.999 UTC),
        started
    ));
    assert!(!completion_qualifies(
        day,
        datetime!(2026-10-01 00:00 UTC),
        None
    ));
    assert!(!completion_qualifies(
        day,
        datetime!(2026-10-01 00:01 UTC),
        Some(datetime!(2026-10-01 00:00 UTC))
    ));
    assert!(!completion_qualifies(
        day,
        datetime!(2026-10-01 00:01 UTC),
        Some(datetime!(2026-09-29 23:59 UTC))
    ));
    // The grace window is closed at exactly one hour
    assert!(!completion_qualifies(
        day,
        datetime!(2026-10-01 01:00 UTC),
        started
    ));
    assert!(!completion_qualifies(
        day,
        datetime!(2026-10-02 00:30 UTC),
        started
    ));
    // A completion before the challenge day never counts
    assert!(!completion_qualifies(
        day,
        datetime!(2026-09-29 23:59 UTC),
        started
    ));
    assert!(!completion_qualifies(
        Date::MAX,
        datetime!(2026-10-01 00:00 UTC),
        started
    ));
    assert_eq!(rollover(day), Some(datetime!(2026-10-01 00:00 UTC)));
    assert_eq!(rollover(Date::MAX), None);
}
