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

use std::collections::BTreeMap;
use std::fmt;

use perspective_client::config::viewer::{
    DerivedTableConfig, Layout, OptionalUpdate, PanelViewerConfig, TableRef, ViewerConfig,
    ViewerConfigInitial, ViewerConfigUpdate, WorkspaceConfig, WorkspaceConfigUpdate,
    validate_palette,
};
use perspective_client::config::{ViewConfig, ViewConfigUpdate};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::Kind;
use crate::json::escape;

/// Which shape of a config `validate` requires.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Form {
    /// The field-wise update a `restore()` call accepts.
    #[default]
    Update,

    /// The complete token a `save()` call emits.
    Complete,
}

/// Where and why a config is not valid for the current schema.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ValidateError {
    /// A JSON pointer to the offending value, `""` for the root.
    pub pointer: String,

    /// The deserialization or consistency error at `pointer`.
    pub message: String,
}

impl fmt::Display for ValidateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid config at `{}`: {}", self.pointer, self.message)
    }
}

impl std::error::Error for ValidateError {}

/// Check that `value` is a valid `kind` config of the given `form` for the
/// current schema, without migrating it.
pub fn validate(kind: Kind, form: Form, value: &Value) -> Result<(), ValidateError> {
    match (kind, form) {
        (Kind::View, Form::Update) => {
            shape::<ViewConfigUpdate>(value)?;
        },
        (Kind::View, Form::Complete) => {
            shape::<ViewConfig>(value)?;
        },
        (Kind::Viewer, Form::Update) => {
            shape::<ViewerConfigUpdate>(value)?;
        },
        (Kind::Viewer, Form::Complete) => {
            shape::<ViewerConfig<String, TableRef>>(value)?;
        },
        (Kind::Panel, Form::Update) => {
            shape::<ViewerConfigInitial>(value)?;
        },
        (Kind::Panel, Form::Complete) => {
            shape::<PanelViewerConfig<String, String>>(value)?;
        },
        (Kind::Workspace, Form::Update) => {
            let workspace = shape::<WorkspaceConfigUpdate>(value)?;
            if let (Some(layout), Some(panels)) = (&workspace.layout, &workspace.panels) {
                layout_places(layout, panels.keys().cloned().collect())?;
            }

            if let OptionalUpdate::Update(palette) = &workspace.palette {
                palette_canonical(palette)?;
            }

            if let Some(derived) = &workspace.derived_tables {
                derived_acyclic(derived)?;
            }
        },
        (Kind::Workspace, Form::Complete) => {
            let workspace = shape::<WorkspaceConfig>(value)?;
            if let Some(layout) = &workspace.layout {
                layout_places(layout, workspace.panels.keys().cloned().collect())?;
            }

            palette_canonical(&workspace.palette)?;
            derived_acyclic(&workspace.derived_tables)?;
        },
    }

    Ok(())
}

fn shape<T: DeserializeOwned>(value: &Value) -> Result<T, ValidateError> {
    serde_path_to_error::deserialize(value).map_err(|error| ValidateError {
        pointer: pointer_of(error.path()),
        message: error.inner().to_string(),
    })
}

fn pointer_of(path: &serde_path_to_error::Path) -> String {
    path.iter()
        .filter_map(|segment| match segment {
            serde_path_to_error::Segment::Map { key } => Some(format!("/{}", escape(key))),
            serde_path_to_error::Segment::Seq { index } => Some(format!("/{index}")),
            serde_path_to_error::Segment::Enum { .. } | serde_path_to_error::Segment::Unknown => {
                None
            },
        })
        .collect()
}

fn layout_places(layout: &Layout, ids: Vec<String>) -> Result<(), ValidateError> {
    layout
        .validate(&ids)
        .map(|_| ())
        .map_err(|message| ValidateError {
            pointer: "/layout".to_owned(),
            message,
        })
}

fn palette_canonical(palette: &BTreeMap<String, String>) -> Result<(), ValidateError> {
    validate_palette(palette.clone())
        .map(|_| ())
        .map_err(|message| ValidateError {
            pointer: "/palette".to_owned(),
            message,
        })
}

fn derived_acyclic(derived: &BTreeMap<String, DerivedTableConfig>) -> Result<(), ValidateError> {
    for start in derived.keys() {
        let mut seen = vec![start.as_str()];
        let mut next = derived.get(start).map(|x| x.table.as_str());
        while let Some(name) = next {
            if seen.contains(&name) {
                return Err(ValidateError {
                    pointer: format!("/derived_tables/{}", escape(start)),
                    message: format!("`derived_tables` cycle through `{name}`"),
                });
            }

            seen.push(name);
            next = derived.get(name).map(|x| x.table.as_str());
        }
    }

    Ok(())
}
