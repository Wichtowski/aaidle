use time::{Date, Duration, OffsetDateTime, UtcOffset};

/// How long after 00:00 UTC a game that was started on its own day may still be finished
/// and count for that day
pub const ROLLOVER_GRACE: Duration = Duration::hours(1);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlayerStreak {
    pub current_streak: i64,
    pub best_streak: i64,
    pub last_solved_date: Option<Date>,
}

/// Reconstruct a family streak from qualifying server completion days, never counters.
pub fn derive_streak(dates: impl IntoIterator<Item = Date>, today: Date) -> PlayerStreak {
    let dates = dates
        .into_iter()
        .filter(|date| *date <= today)
        .collect::<std::collections::BTreeSet<_>>();
    let mut streak = PlayerStreak {
        current_streak: 0,
        best_streak: 0,
        last_solved_date: None,
    };
    for date in dates {
        streak = update_streak(&streak, date);
    }
    if streak
        .last_solved_date
        .is_some_and(|last| last < today.previous_day().unwrap_or(today))
    {
        streak.current_streak = 0;
    }
    streak
}

/// Decides whether a server-accepted completion secures the streak day of its challenge.
///
/// A completion on the challenge's own UTC day always counts. A completion shortly after
/// midnight counts only when the player already played that challenge on its own day,
/// which `started_at`, the earliest server-recorded event, proves. Opening a past game
/// later therefore never repairs or extends a streak
pub fn completion_qualifies(
    challenge_date: Date,
    completed_at: OffsetDateTime,
    started_at: Option<OffsetDateTime>,
) -> bool {
    let completed_at = completed_at.to_offset(UtcOffset::UTC);
    if completed_at.date() == challenge_date {
        return true;
    }
    let Some(rollover) = rollover(challenge_date) else {
        return false;
    };
    completed_at >= rollover
        && completed_at < rollover + ROLLOVER_GRACE
        && started_at
            .is_some_and(|started| started.to_offset(UtcOffset::UTC).date() == challenge_date)
}

/// The instant a challenge date ends
pub fn rollover(challenge_date: Date) -> Option<OffsetDateTime> {
    Some(challenge_date.next_day()?.midnight().assume_utc())
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
mod tests;
