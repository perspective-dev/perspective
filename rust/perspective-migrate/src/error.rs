// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

use std::fmt;

use serde::Serialize;

/// Why a config could not be migrated to a valid current form.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind")]
pub enum MigrateError {
    /// `version` is not `x.y.z`.
    InvalidVersion { version: String },

    /// `version` predates `2.0.0`.
    Unsupported { version: String },

    /// `version` is newer than this crate's schema.
    FromFuture { version: String },

    /// The config is not a JSON object.
    NotAnObject,

    /// The value at `pointer` is not the shape its declared version wrote.
    Malformed {
        step: &'static str,
        pointer: String,
        expected: &'static str,
    },

    /// An alias and its canonical key are both present at `pointer`.
    Conflict {
        step: &'static str,
        pointer: String,
        keys: Vec<String>,
    },

    /// The panel at `pointer` has no `table` to bind.
    MissingTable { step: &'static str, pointer: String },

    /// The migrated config does not deserialize into the current schema.
    Invalid { pointer: String, message: String },
}

impl fmt::Display for MigrateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidVersion { version } => write!(f, "invalid version `{version}`"),
            Self::Unsupported { version } => {
                write!(
                    f,
                    "configs written before 2.0.0 are unsupported (`{version}`)"
                )
            },
            Self::FromFuture { version } => {
                write!(f, "`{version}` is newer than this migrator")
            },
            Self::NotAnObject => write!(f, "expected a JSON object"),
            Self::Malformed {
                step,
                pointer,
                expected,
            } => write!(f, "{step}: expected {expected} at `{pointer}`"),
            Self::Conflict {
                step,
                pointer,
                keys,
            } => write!(f, "{step}: conflicting keys {keys:?} at `{pointer}`"),
            Self::MissingTable { step, pointer } => {
                write!(f, "{step}: panel `{pointer}` has no `table`")
            },
            Self::Invalid { pointer, message } => {
                write!(f, "migrated config is invalid at `{pointer}`: {message}")
            },
        }
    }
}

impl std::error::Error for MigrateError {}

impl From<crate::ValidateError> for MigrateError {
    fn from(error: crate::ValidateError) -> Self {
        Self::Invalid {
            pointer: error.pointer,
            message: error.message,
        }
    }
}
