use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Normal,
    Challenge,
    Hardcore,
}

impl Difficulty {
    pub const ALL: [Self; 3] = [Self::Normal, Self::Challenge, Self::Hardcore];

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "normal" => Some(Self::Normal),
            "challenge" => Some(Self::Challenge),
            "hardcore" => Some(Self::Hardcore),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Challenge => "challenge",
            Self::Hardcore => "hardcore",
        }
    }
}

#[cfg(test)]
mod tests;
