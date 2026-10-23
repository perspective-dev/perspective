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

use perspective_migrate::{Kind, Migrator};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

use crate::py_err::PyPerspectiveError;

/// Upgrade a persisted Perspective config written by any release since 2.0.0
/// to the current schema, returning `{"value", "notices", "steps"}`.
///
/// # Arguments
///
/// - `kind` - `"view"`, `"viewer"` or `"workspace"`.
/// - `config` - The config, as a `dict`.
/// - `from_version` - The release that wrote `config`, used only when it has no
///   `version` field.
#[pyfunction]
#[pyo3(signature = (kind, config, from_version = None))]
pub fn migrate(
    py: Python<'_>,
    kind: &str,
    config: &Bound<'_, PyAny>,
    from_version: Option<&str>,
) -> PyResult<Py<PyAny>> {
    let kind = match kind {
        "view" => Kind::View,
        "viewer" => Kind::Viewer,
        "workspace" => Kind::Workspace,
        _ => {
            return Err(PyValueError::new_err(format!(
                "Unknown config kind `{kind}`; expected `view`, `viewer` or `workspace`"
            )));
        },
    };

    let value: serde_json::Value = pythonize::depythonize(config)?;
    let migrated = Migrator::new()
        .migrate(kind, from_version, value)
        .map_err(|error| PyPerspectiveError::new_err(error.to_string()))?;

    let result = serde_json::json!({
        "value": migrated.value,
        "notices": migrated.notices,
        "steps": migrated.steps,
    });

    Ok(pythonize::pythonize(py, &result)?.unbind())
}
