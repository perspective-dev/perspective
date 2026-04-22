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

use std::str::FromStr;

use indexmap::IndexMap;
use perspective_client::config::ViewConfig;
use perspective_client::proto::{ColumnType, ViewPort};
use perspective_client::virtual_server::GenericSQLVirtualServerModel;
use pyo3::exceptions::PyValueError;
use pyo3::types::{PyAnyMethods, PyDict, PyDictMethods};
use pyo3::{Py, PyAny, PyResult, Python, pyclass, pymethods};

#[pyclass(name = "GenericSQLVirtualServerModel")]
pub struct PyGenericSQLVirtualServerModel {
    inner: GenericSQLVirtualServerModel,
}

#[pymethods]
impl PyGenericSQLVirtualServerModel {
    #[new]
    pub fn new(py: Python<'_>, config: Option<Py<PyDict>>) -> Self {
        Self {
            inner: GenericSQLVirtualServerModel::new(
                config
                    .map(|x| pythonize::depythonize(x.bind(py)).unwrap())
                    .unwrap_or_default(),
            ),
        }
    }

    pub fn get_hosted_tables(&self) -> PyResult<String> {
        self.inner
            .get_hosted_tables()
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn table_schema(&self, table_id: &str) -> PyResult<String> {
        self.inner
            .table_schema(table_id)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn table_size(&self, table_id: &str) -> PyResult<String> {
        self.inner
            .table_size(table_id)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn view_column_size(&self, view_id: &str) -> PyResult<String> {
        self.inner
            .view_column_size(view_id)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn table_validate_expression(&self, table_id: &str, expression: &str) -> PyResult<String> {
        self.inner
            .table_validate_expression(table_id, expression)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn view_delete(&self, view_id: &str) -> PyResult<String> {
        self.inner
            .view_delete(view_id)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn table_make_view(
        &self,
        table_id: &str,
        view_id: &str,
        config: Py<PyAny>,
    ) -> PyResult<String> {
        let config: ViewConfig = Python::with_gil(|py| {
            pythonize::depythonize(config.bind(py))
                .map_err(|e| PyValueError::new_err(e.to_string()))
        })?;

        self.inner
            .table_make_view(table_id, view_id, &config)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn view_get_data(
        &self,
        view_id: &str,
        config: Py<PyAny>,
        viewport: Py<PyAny>,
        schema: Py<PyAny>,
    ) -> PyResult<String> {
        Python::with_gil(|py| {
            let config: ViewConfig = pythonize::depythonize(config.bind(py))
                .map_err(|e| PyValueError::new_err(e.to_string()))?;

            let viewport: PyViewPort = pythonize::depythonize(viewport.bind(py))
                .map_err(|e| PyValueError::new_err(e.to_string()))?;

            let schema =
                self.parse_schema(schema.downcast_bound::<PyDict>(py).map_err(|_| {
                    PyValueError::new_err("Schema must be a dict mapping column names to types")
                })?)?;

            self.inner
                .view_get_data(view_id, &config, &viewport.into(), &schema)
                .map_err(|e| PyValueError::new_err(e.to_string()))
        })
    }

    pub fn view_schema(&self, view_id: &str) -> PyResult<String> {
        self.inner
            .view_schema(view_id)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn view_size(&self, view_id: &str) -> PyResult<String> {
        self.inner
            .view_size(view_id)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }

    pub fn view_get_min_max(
        &self,
        view_id: &str,
        column_name: &str,
        config: Py<PyAny>,
    ) -> PyResult<String> {
        let config: ViewConfig = Python::with_gil(|py| {
            pythonize::depythonize(config.bind(py))
                .map_err(|e| PyValueError::new_err(e.to_string()))
        })?;

        self.inner
            .view_get_min_max(view_id, column_name, &config)
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }
}

impl PyGenericSQLVirtualServerModel {
    fn parse_schema(
        &self,
        schema: &pyo3::Bound<'_, PyDict>,
    ) -> PyResult<IndexMap<String, ColumnType>> {
        let mut result = IndexMap::new();
        for (key, value) in schema.iter() {
            let key: String = key.extract()?;
            let value: String = value.extract()?;
            let column_type = ColumnType::from_str(&value)
                .map_err(|_| PyValueError::new_err(format!("Unknown column type: {}", value)))?;

            result.insert(key, column_type);
        }

        Ok(result)
    }
}

#[derive(serde::Deserialize)]
struct PyViewPort {
    start_row: Option<u32>,
    start_col: Option<u32>,
    end_row: Option<u32>,
    end_col: Option<u32>,
}

impl From<PyViewPort> for ViewPort {
    fn from(value: PyViewPort) -> Self {
        ViewPort {
            start_row: value.start_row,
            start_col: value.start_col,
            end_row: value.end_row,
            end_col: value.end_col,
            emit_legacy_row_path_names: None,
        }
    }
}
