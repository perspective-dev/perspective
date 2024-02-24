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

use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyString};
use pyo3_asyncio::tokio::future_into_py;

use super::python::*;

#[pyclass]
pub struct PyAsyncClient(PyClient);

#[pymethods]
impl PyAsyncClient {
    #[doc = include_str!("../../../perspective-client/docs/table.md")]
    #[pyo3(signature = (input, limit=None, index=None))]
    pub fn table<'a>(
        &self,
        py: Python<'a>,
        input: Py<PyAny>,
        limit: Option<u32>,
        index: Option<Py<PyString>>,
    ) -> PyResult<&'a PyAny> {
        let client = self.0.clone();
        future_into_py(py, async move {
            let table = client.table(input, limit, index).await?;
            Ok(PyAsyncTable(table))
        })
    }
}

#[pyfunction]
pub fn create_async_client(py: Python<'_>) -> PyResult<&'_ PyAny> {
    future_into_py(py, async move { Ok(PyAsyncClient(PyClient::new().await)) })
}

#[pyclass]
pub struct PyAsyncTable(PyTable);

#[pymethods]
impl PyAsyncTable {
    #[doc = include_str!("../../../perspective-client/docs/table/columns.md")]
    pub fn columns<'a>(&self, py: Python<'a>) -> PyResult<&'a PyAny> {
        let table = self.0.clone();
        future_into_py(py, async move { Ok(table.columns().await) })
    }

    #[doc = include_str!("../../../perspective-client/docs/table/schema.md")]
    pub fn schema<'a>(&self, py: Python<'a>) -> PyResult<&'a PyAny> {
        let table = self.0.clone();
        future_into_py(py, async move { table.schema().await })
    }

    #[doc = include_str!("../../../perspective-client/docs/table/size.md")]
    pub fn size<'a>(&self, py: Python<'a>) -> PyResult<&'a PyAny> {
        let table = self.0.clone();
        future_into_py(py, async move { Ok(table.size().await) })
    }
}
