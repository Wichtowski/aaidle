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
mod tests;
