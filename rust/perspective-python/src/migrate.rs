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

use perspective_migrate::{Form, Kind, Migrator};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

use crate::py_err::PyPerspectiveError;

/// Upgrade a persisted Perspective config written by any release since 2.0.0
/// to the current schema, returning `{"value", "notices", "steps"}`.
///
/// # Arguments
///
/// - `kind` - `"view"`, `"viewer"`, `"panel"` or `"workspace"`.
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
    let kind: Kind = kind.parse().map_err(PyValueError::new_err)?;
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

/// Check that `config` is valid for the current schema without migrating it,
/// raising `PerspectiveError` naming the offending JSON pointer otherwise.
///
/// # Arguments
///
/// - `kind` - `"view"`, `"viewer"`, `"panel"` or `"workspace"`.
/// - `config` - The config, as a `dict`.
/// - `strict` - Require the complete `save()` form rather than the field-wise
///   `restore()` update form.
#[pyfunction]
#[pyo3(signature = (kind, config, strict = false))]
pub fn validate(kind: &str, config: &Bound<'_, PyAny>, strict: bool) -> PyResult<()> {
    let kind: Kind = kind.parse().map_err(PyValueError::new_err)?;
    let form = if strict { Form::Complete } else { Form::Update };
    let value: serde_json::Value = pythonize::depythonize(config)?;
    perspective_migrate::validate(kind, form, &value)
        .map_err(|error| PyPerspectiveError::new_err(error.to_string()))
}
