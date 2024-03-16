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

use std::collections::HashMap;

use futures::executor::block_on;
use perspective_client::{assert_table_api, assert_view_api};
use pyo3::prelude::*;
use pyo3::types::*;

use super::python::*;

#[pyclass]
pub struct PySyncClient(PyClient);

#[pymethods]
impl PySyncClient {
    #[doc = include_str!("../../../perspective-client/docs/table.md")]
    #[pyo3(signature = (input, limit=None, index=None))]
    pub fn table(
        &self,
        input: Py<PyAny>,
        limit: Option<u32>,
        index: Option<Py<PyString>>,
    ) -> PyResult<PySyncTable> {
        Ok(PySyncTable(block_on(self.0.table(input, limit, index))?))
    }
}

/// Create a new `Client` instance with a _synchronous_, _blocking_ API.
#[pyfunction]
pub fn create_sync_client() -> PySyncClient {
    PySyncClient(block_on(PyClient::new()))
}

#[pyclass]
pub struct PySyncTable(PyTable);

assert_table_api!(PySyncTable);

#[pymethods]
impl PySyncTable {
    fn get_index(&self) -> Option<String> {
        block_on(self.0.get_index())
    }

    fn get_limit(&self) -> Option<u32> {
        block_on(self.0.get_limit())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/clear.md")]
    fn clear(&self) -> PyResult<()> {
        block_on(self.0.clear())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/columns.md")]
    fn columns(&self) -> Vec<String> {
        block_on(self.0.columns())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/delete.md")]
    fn delete(&self) -> PyResult<()> {
        block_on(self.0.delete())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/make_port.md")]
    fn make_port(&self) -> PyResult<i32> {
        let table = self.0.clone();
        block_on(table.make_port())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/on_delete.md")]
    fn on_delete(&self, callback: Py<PyFunction>) -> PyResult<u32> {
        let table = self.0.clone();
        block_on(table.on_delete(callback))
    }

    #[doc = include_str!("../../../perspective-client/docs/table/remove_delete.md")]
    fn remove_delete(&self, callback_id: u32) -> PyResult<()> {
        let table = self.0.clone();
        block_on(table.remove_delete(callback_id))
    }

    #[doc = include_str!("../../../perspective-client/docs/table/schema.md")]
    fn schema(&self) -> PyResult<HashMap<String, String>> {
        let table = self.0.clone();
        block_on(table.schema())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/validate_expressions.md")]
    fn validate_expressions(&self, expression: HashMap<String, String>) -> PyResult<Py<PyAny>> {
        let table = self.0.clone();
        block_on(table.validate_expressions(expression))
    }

    #[doc = include_str!("../../../perspective-client/docs/table/view.md")]
    #[pyo3(signature = (**config))]
    fn view(&self, config: Option<Py<PyDict>>) -> PyResult<PySyncView> {
        Ok(PySyncView(block_on(self.0.view(config))?))
    }

    #[doc = include_str!("../../../perspective-client/docs/table/size.md")]
    fn size(&self) -> usize {
        block_on(self.0.size())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/update.md")]
    #[pyo3(signature = (input))]
    fn replace(&self, input: Py<PyAny>) -> PyResult<()> {
        block_on(self.0.replace(input))
    }

    #[doc = include_str!("../../../perspective-client/docs/table/update.md")]
    #[pyo3(signature = (input, format=None, port_id=None))]
    fn update(
        &self,
        input: Py<PyAny>,
        format: Option<String>,
        port_id: Option<u32>,
    ) -> PyResult<()> {
        block_on(self.0.update(input, format, port_id))
    }
}

#[pyclass]
pub struct PySyncView(PyView);

assert_view_api!(PySyncView);

#[pymethods]
impl PySyncView {
    #[doc = include_str!("../../../perspective-client/docs/view/column_paths.md")]
    fn column_paths(&self) -> PyResult<Vec<String>> {
        block_on(self.0.column_paths())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_columns_string.md")]
    fn to_columns_string(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        block_on(self.0.to_columns_string(window))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_json_string.md")]
    fn to_json_string(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        block_on(self.0.to_json_string(window))
    }

    fn to_records<'a>(&self, py: Python<'a>, window: Option<Py<PyDict>>) -> PyResult<&'a PyAny> {
        let json = block_on(self.0.to_json_string(window))?;
        let json_module = PyModule::import(py, "json")?;
        json_module.call_method1("loads", (json,))
    }

    fn to_json<'a>(&self, py: Python<'a>, window: Option<Py<PyDict>>) -> PyResult<&'a PyAny> {
        self.to_records(py, window)
    }

    fn to_columns<'a>(&self, py: Python<'a>, window: Option<Py<PyDict>>) -> PyResult<&'a PyAny> {
        let json = block_on(self.0.to_columns_string(window))?;
        let json_module = PyModule::import(py, "json")?;
        json_module.call_method1("loads", (json,))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_csv.md")]
    fn to_csv(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        block_on(self.0.to_csv(window))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_csv.md")]
    fn to_arrow(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyBytes>> {
        block_on(self.0.to_arrow(window))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/delete.md")]
    fn delete(&self) -> PyResult<()> {
        block_on(self.0.delete())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/dimensions.md")]
    fn dimensions(&self) -> PyResult<Py<PyAny>> {
        block_on(self.0.dimensions())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/expression_schema.md")]
    fn expression_schema(&self) -> PyResult<HashMap<String, String>> {
        block_on(self.0.expression_schema())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/get_config.md")]
    fn get_config(&self) -> PyResult<Py<PyAny>> {
        block_on(self.0.get_config())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/get_min_max.md")]
    fn get_min_max(&self, column_name: String) -> PyResult<(String, String)> {
        block_on(self.0.get_min_max(column_name))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/num_rows.md")]
    fn num_rows(&self) -> PyResult<u32> {
        block_on(self.0.num_rows())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/schema.md")]
    fn schema(&self) -> PyResult<HashMap<String, String>> {
        block_on(self.0.schema())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/on_delete.md")]
    fn on_delete(&self, callback: Py<PyFunction>) -> PyResult<u32> {
        block_on(self.0.on_delete(callback))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/remove_delete.md")]
    fn remove_delete(&self, callback_id: u32) -> PyResult<()> {
        block_on(self.0.remove_delete(callback_id))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/on_update.md")]
    fn on_update(&self, callback: Py<PyFunction>, mode: Option<String>) -> PyResult<u32> {
        block_on(self.0.on_update(callback, mode))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/remove_update.md")]
    fn remove_update(&self, callback_id: u32) -> PyResult<()> {
        block_on(self.0.remove_update(callback_id))
    }
}
