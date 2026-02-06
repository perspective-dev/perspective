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
use std::sync::{Arc, Mutex};

use chrono::{DateTime, TimeZone, Utc};
use indexmap::IndexMap;
use perspective_client::proto::{ColumnType, HostedTable};
use perspective_client::virtual_server::{
    Features, ResultExt, VirtualDataSlice, VirtualServer, VirtualServerFuture, VirtualServerHandler,
};
use pyo3::exceptions::PyValueError;
use pyo3::types::{
    PyAnyMethods, PyBytes, PyDate, PyDict, PyDictMethods, PyList, PyListMethods, PyString,
};
use pyo3::{IntoPyObject, Py, PyAny, PyErr, PyResult, Python, pyclass, pymethods};
use serde::Serialize;

pub struct PyServerHandler(Py<PyAny>);

impl VirtualServerHandler for PyServerHandler {
    type Error = PyErr;

    fn get_features(&self) -> VirtualServerFuture<'_, Result<Features<'_>, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        Box::pin(async move {
            Python::with_gil(|py| {
                if handler
                    .getattr(py, pyo3::intern!(py, "get_features"))
                    .is_ok()
                {
                    Ok(pythonize::depythonize(
                        handler.call_method0(py, "get_features")?.bind(py),
                    )?)
                } else {
                    Ok(Features::default())
                }
            })
        })
    }

    fn get_hosted_tables(&self) -> VirtualServerFuture<'_, Result<Vec<HostedTable>, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        Box::pin(async move {
            Python::with_gil(|py| {
                Ok(handler
                    .call_method0(py, pyo3::intern!(py, "get_hosted_tables"))?
                    .downcast_bound::<PyList>(py)?
                    .iter()
                    .flat_map(|x| {
                        Ok::<_, PyErr>(if x.is_instance_of::<PyString>() {
                            HostedTable {
                                entity_id: x.to_string(),
                                index: None,
                                limit: None,
                            }
                        } else {
                            HostedTable {
                                entity_id: x.get_item("name")?.to_string(),
                                index: x.get_item("index").ok().and_then(|x| x.extract().ok()),
                                limit: x.get_item("limit").ok().and_then(|x| x.extract().ok()),
                            }
                        })
                    })
                    .collect::<Vec<_>>())
            })
        })
    }

    fn table_schema(
        &self,
        table_id: &str,
    ) -> VirtualServerFuture<'_, Result<IndexMap<String, ColumnType>, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let table_id = table_id.to_string();
        Box::pin(async move {
            Python::with_gil(|py| {
                Ok(handler
                    .call_method1(py, pyo3::intern!(py, "table_schema"), (&table_id,))?
                    .downcast_bound::<PyDict>(py)?
                    .items()
                    .extract::<Vec<(String, String)>>()?
                    .into_iter()
                    .map(|(k, v)| (k, ColumnType::from_str(&v).unwrap()))
                    .collect())
            })
        })
    }

    fn table_size(&self, table_id: &str) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let table_id = table_id.to_string();
        Box::pin(async move {
            Python::with_gil(|py| {
                handler
                    .call_method1(py, pyo3::intern!(py, "table_size"), (&table_id,))?
                    .extract::<u32>(py)
            })
        })
    }

    fn table_column_size(
        &self,
        table_id: &str,
    ) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let table_id = table_id.to_string();

        Box::pin(async move {
            let has_table_column_size =
                Python::with_gil(|py| handler.getattr(py, "table_column_size").is_ok());
            if has_table_column_size {
                Python::with_gil(|py| {
                    handler
                        .call_method1(py, pyo3::intern!(py, "table_column_size"), (&table_id,))?
                        .extract::<u32>(py)
                })
            } else {
                Ok(self.table_schema(&table_id).await?.len() as u32)
            }
        })
    }

    fn table_validate_expression(
        &self,
        table_id: &str,
        expression: &str,
    ) -> VirtualServerFuture<'_, Result<ColumnType, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let table_id = table_id.to_string();
        let expression = expression.to_string();
        Box::pin(async move {
            Python::with_gil(|py| {
                let name = pyo3::intern!(py, "table_validate_expression");
                if handler.getattr(py, name).is_ok() {
                    Ok(handler
                        .call_method1(py, name, (&table_id, &expression))?
                        .downcast_bound::<PyString>(py)?
                        .extract::<String>()?)
                    .map(|x| ColumnType::from_str(x.as_str()).unwrap())
                } else {
                    // TODO this should probably be an error.
                    Ok(ColumnType::Float)
                }
            })
        })
    }

    fn table_make_view(
        &mut self,
        table_id: &str,
        view_id: &str,
        config: &mut perspective_client::config::ViewConfigUpdate,
    ) -> VirtualServerFuture<'_, Result<String, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let table_id = table_id.to_string();
        let view_id = view_id.to_string();
        let config = config.clone();
        Box::pin(async move {
            Python::with_gil(|py| {
                let _ = handler
                    .call_method1(
                        py,
                        pyo3::intern!(py, "table_make_view"),
                        (&table_id, &view_id, pythonize::pythonize(py, &config)?),
                    )?
                    .extract::<String>(py);

                Ok(view_id.to_string())
            })
        })
    }

    fn view_schema(
        &self,
        view_id: &str,
        config: &perspective_client::config::ViewConfig,
    ) -> VirtualServerFuture<'_, Result<IndexMap<String, ColumnType>, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let view_id = view_id.to_string();
        let config = config.clone();
        Box::pin(async move {
            Python::with_gil(|py| {
                let has_view_schema = handler.getattr(py, "view_schema").is_ok();
                let args = if has_view_schema {
                    (&view_id, pythonize::pythonize(py, &config)?).into_pyobject(py)?
                } else {
                    (&view_id,).into_pyobject(py)?
                };

                Ok(handler
                    .call_method1(
                        py,
                        if has_view_schema {
                            pyo3::intern!(py, "view_schema")
                        } else {
                            pyo3::intern!(py, "table_schema")
                        },
                        args,
                    )?
                    .downcast_bound::<PyDict>(py)?
                    .items()
                    .extract::<Vec<(String, String)>>()?
                    .into_iter()
                    .map(|(k, v)| (k, ColumnType::from_str(&v).unwrap()))
                    .collect())
            })
        })
    }

    fn view_size(&self, view_id: &str) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let view_id = view_id.to_string();
        Box::pin(async move {
            Python::with_gil(|py| {
                handler
                    .call_method1(py, pyo3::intern!(py, "view_size"), (&view_id,))?
                    .extract::<u32>(py)
            })
        })
    }

    fn view_column_size(
        &self,
        view_id: &str,
        config: &perspective_client::config::ViewConfig,
    ) -> VirtualServerFuture<'_, Result<u32, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let view_id = view_id.to_string();
        let config = config.clone();
        Box::pin(async move {
            let has_table_column_size =
                Python::with_gil(|py| handler.getattr(py, "view_column_size").is_ok());
            if has_table_column_size {
                Python::with_gil(|py| {
                    handler
                        .call_method1(
                            py,
                            pyo3::intern!(py, "view_column_size"),
                            (&view_id, pythonize::pythonize(py, &config)?).into_pyobject(py)?,
                        )?
                        .extract::<u32>(py)
                })
            } else {
                Ok(self.view_schema(&view_id, &config).await?.len() as u32)
            }
        })
    }

    fn view_delete(&self, view_id: &str) -> VirtualServerFuture<'_, Result<(), Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let view_id = view_id.to_string();
        Box::pin(async move {
            Python::with_gil(|py| {
                handler.call_method1(py, pyo3::intern!(py, "view_delete"), (&view_id,))?;
                Ok(())
            })
        })
    }

    fn view_get_data(
        &self,
        view_id: &str,
        config: &perspective_client::config::ViewConfig,
        viewport: &perspective_client::proto::ViewPort,
    ) -> VirtualServerFuture<'_, Result<VirtualDataSlice, Self::Error>> {
        let handler = Python::with_gil(|py| self.0.clone_ref(py));
        let view_id = view_id.to_string();
        let config = config.clone();
        let window: PyViewPort = viewport.clone().into();
        Box::pin(async move {
            Python::with_gil(|py| {
                let data = PyVirtualDataSlice(Arc::new(Mutex::new(VirtualDataSlice::new(config.clone()))));
                let _ = handler.call_method1(
                    py,
                    pyo3::intern!(py, "view_get_data"),
                    (
                        &view_id,
                        pythonize::pythonize(py, &config)?,
                        pythonize::pythonize(py, &window)?,
                        data.clone(),
                    ),
                )?;

                Ok(Mutex::into_inner(Arc::try_unwrap(data.0).unwrap()).unwrap())
            })
        })
    }
}

#[derive(Serialize, PartialEq)]
pub struct PyViewPort {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_row: ::core::option::Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_col: ::core::option::Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_row: ::core::option::Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_col: ::core::option::Option<u32>,
}

impl From<perspective_client::proto::ViewPort> for PyViewPort {
    fn from(value: perspective_client::proto::ViewPort) -> Self {
        PyViewPort {
            start_row: value.start_row,
            start_col: value.start_col,
            end_row: value.end_row,
            end_col: value.end_col,
        }
    }
}

#[derive(Clone)]
#[pyclass(name = "VirtualDataSlice")]
pub struct PyVirtualDataSlice(Arc<Mutex<VirtualDataSlice>>);

#[pymethods]
impl PyVirtualDataSlice {
    #[pyo3(signature=(dtype, name, index, val, group_by_index = None))]
    pub fn set_col(
        &self,
        dtype: &str,
        name: &str,
        index: u32,
        val: Py<PyAny>,
        group_by_index: Option<usize>,
    ) -> PyResult<()> {
        match dtype {
            "string" => self.set_string_col(name, index, val, group_by_index),
            "integer" => self.set_integer_col(name, index, val, group_by_index),
            "float" => self.set_float_col(name, index, val, group_by_index),
            "date" => self.set_datetime_col(name, index, val, group_by_index),
            "datetime" => self.set_datetime_col(name, index, val, group_by_index),
            "boolean" => self.set_boolean_col(name, index, val, group_by_index),
            _ => Err(PyValueError::new_err("Unknown type")),
        }
    }

    #[pyo3(signature=(name, index, val, group_by_index = None))]
    pub fn set_string_col(
        &self,
        name: &str,
        index: u32,
        val: Py<PyAny>,
        group_by_index: Option<usize>,
    ) -> PyResult<()> {
        Python::with_gil(|py| {
            if val.is_none(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, None as Option<String>)
                    .unwrap();
            } else if let Ok(val) = val.downcast_bound::<PyString>(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(
                        name,
                        group_by_index,
                        index as usize,
                        val.extract::<String>().ok(),
                    )
                    .unwrap();
            } else {
                tracing::error!("Unhandled")
            };

            Ok(())
        })
    }

    #[pyo3(signature=(name, index, val, group_by_index = None))]
    pub fn set_integer_col(
        &self,
        name: &str,
        index: u32,
        val: Py<PyAny>,
        group_by_index: Option<usize>,
    ) -> PyResult<()> {
        Python::with_gil(|py| {
            if val.is_none(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, None as Option<i32>)
                    .unwrap();
            } else if let Ok(val) = val.extract::<i32>(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, Some(val))
                    .unwrap();
            } else {
                tracing::error!("Unhandled")
            };

            Ok(())
        })
    }

    #[pyo3(signature=(name, index, val, group_by_index = None))]
    pub fn set_float_col(
        &self,
        name: &str,
        index: u32,
        val: Py<PyAny>,
        group_by_index: Option<usize>,
    ) -> PyResult<()> {
        Python::with_gil(|py| {
            if val.is_none(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, None as Option<f64>)
                    .unwrap();
            } else if let Ok(val) = val.extract::<f64>(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, Some(val))
                    .unwrap();
            } else {
                tracing::error!("Unhandled")
            };

            Ok(())
        })
    }

    #[pyo3(signature=(name, index, val, group_by_index = None))]
    pub fn set_boolean_col(
        &self,
        name: &str,
        index: u32,
        val: Py<PyAny>,
        group_by_index: Option<usize>,
    ) -> PyResult<()> {
        Python::with_gil(|py| {
            if val.is_none(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, None as Option<bool>)
                    .unwrap();
            } else if let Ok(val) = val.extract::<bool>(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, Some(val))
                    .unwrap();
            } else {
                tracing::error!("Unhandled")
            };

            Ok(())
        })
    }

    #[pyo3(signature=(name, index, val, group_by_index = None))]
    pub fn set_datetime_col(
        &self,
        name: &str,
        index: u32,
        val: Py<PyAny>,
        group_by_index: Option<usize>,
    ) -> PyResult<()> {
        Python::with_gil(|py| {
            if val.is_none(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, None as Option<i64>)
                    .unwrap();
            } else if let Ok(val) = val.downcast_bound::<PyDate>(py) {
                let dt: DateTime<Utc> = Utc
                    .with_ymd_and_hms(
                        val.getattr("year")?.extract()?,
                        val.getattr("month")?.extract()?,
                        val.getattr("day")?.extract()?,
                        0,
                        0,
                        0,
                    )
                    .unwrap();
                let timestamp = dt.timestamp() * 1000;
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, Some(timestamp))
                    .unwrap();
            } else if let Ok(val) = val.extract::<i64>(py) {
                self.0
                    .lock()
                    .unwrap()
                    .set_col(name, group_by_index, index as usize, Some(val))
                    .unwrap();
            } else {
                tracing::error!("Unhandled")
            };

            Ok(())
        })
    }
}

#[pyclass(name = "VirtualServer")]
pub struct PyVirtualServer(VirtualServer<PyServerHandler>);

#[pymethods]
impl PyVirtualServer {
    #[new]
    pub fn new(handler: Py<PyAny>) -> PyResult<Self> {
        Ok(PyVirtualServer(VirtualServer::new(PyServerHandler(
            handler,
        ))))
    }

    pub fn handle_request(&mut self, bytes: Py<PyBytes>) -> PyResult<Py<PyBytes>> {
        Python::with_gil(|py| {
            let bytes_vec = bytes.as_bytes(py).to_vec();

            // Use futures::executor::block_on to run the async code synchronously
            let result = futures::executor::block_on(async {
                self.0.handle_request(bytes::Bytes::from(bytes_vec)).await
            });

            match result.get_internal_error() {
                Ok(x) => Ok(PyBytes::new(py, &x).unbind()),
                Err(Ok(x)) => Err(x),
                Err(Err(x)) => Err(PyValueError::new_err(x)),
            }
        })
    }
}
