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

use std::any::Any;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

use futures::lock::Mutex;
use perspective_client::config::Expressions;
use perspective_client::proto::{RequestEnvelope, ResponseEnvelope};
use perspective_client::{
    assert_table_api, assert_view_api, clone, Client, ClientError, ColumnType, OnUpdateMode,
    OnUpdateOptions, Table, TableData, TableInitOptions, UpdateOptions, View, ViewWindow,
};
use prost::Message;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict, PyFunction, PyList, PyString, PyType};
use pythonize::depythonize;

use crate::ffi;

#[derive(Clone)]
pub struct PyClient {
    // server: Arc<Mutex<cxx::UniquePtr<ffi::ProtoApiServer>>>,
    client: Arc<Mutex<Option<Client>>>,
}

async fn process_message(
    server: Arc<Mutex<cxx::UniquePtr<ffi::ProtoApiServer>>>,
    client: Arc<Mutex<Option<Client>>>,
    msg: RequestEnvelope,
) {
    let mut bytes = vec![];
    msg.encode(&mut bytes).unwrap();
    let server = server.lock().await;
    let batch = Python::with_gil(move |_py| ffi::handle_message(&server, &bytes));
    let client = client.lock().await;
    for response in batch.iter() {
        client
            .as_ref()
            .unwrap()
            .receive(ResponseEnvelope::decode(&response[..]).unwrap())
            .unwrap()
    }
}

#[extend::ext]
pub impl<T> Result<T, ClientError> {
    fn into_pyerr(self) -> PyResult<T> {
        match self {
            Ok(x) => Ok(x),
            Err(x) => Err(pyo3::exceptions::PyOSError::new_err(format!("{}", x))),
        }
    }
}

#[extend::ext]
impl TableData {
    fn from_py(py: Python<'_>, input: Py<PyAny>) -> Result<TableData, PyErr> {
        if let Ok(pybytes) = input.downcast::<PyBytes>(py) {
            Ok(TableData::Arrow(pybytes.as_bytes().to_vec()))
        } else if let Ok(pystring) = input.downcast::<PyString>(py) {
            Ok(TableData::Csv(pystring.extract::<String>()?))
        } else if let Ok(pylist) = input.downcast::<PyList>(py) {
            let json_module = PyModule::import(py, "json")?;
            let string = json_module.call_method1("dumps", (pylist,))?;
            Ok(TableData::JsonRows(string.extract::<String>()?))
        } else if let Ok(pydict) = input.downcast::<PyDict>(py) {
            let first_key = pydict.keys().get_item(0)?;
            let first_item = pydict
                .get_item(first_key)?
                .ok_or_else(|| PyValueError::new_err("Bad Input"))?;
            if first_item.downcast::<PyList>().is_ok() {
                let json_module = PyModule::import(py, "json")?;
                let string = json_module.call_method1("dumps", (pydict,))?;
                Ok(TableData::JsonColumns(string.extract::<String>()?))
            } else {
                let mut schema = vec![];
                for (key, val) in pydict.into_iter() {
                    schema.push((
                        key.extract::<String>()?,
                        val.extract::<String>()?.as_str().try_into().into_pyerr()?,
                    ));
                }

                Ok(TableData::Schema(schema))
            }
        } else {
            Err(PyValueError::new_err(format!(
                "Unknown input type {:?}",
                input.type_id()
            )))
        }
    }
}

impl PyClient {
    pub async fn new() -> Self {
        let server = Arc::new(Mutex::new(ffi::new_proto_server()));
        let client: Arc<Mutex<Option<Client>>> = Arc::default();
        *client.lock().await = Some(Client::new({
            clone!(server, client);
            move |msg| {
                clone!(server, client, msg);
                Box::pin(process_message(server, client, msg))
            }
        }));

        PyClient {
            // server,
            client,
        }
    }

    pub async fn table(
        &self,
        input: Py<PyAny>,
        limit: Option<u32>,
        index: Option<Py<PyString>>,
    ) -> PyResult<PyTable> {
        let client = self.client.lock().await.clone();
        let table = Python::with_gil(|py| {
            let options = match (limit, index) {
                (None, None) => None,
                (None, Some(index)) => Some(TableInitOptions::Index {
                    index: index.extract::<String>(py)?,
                }),
                (Some(limit), None) => Some(TableInitOptions::Limit { limit }),
                (Some(_), Some(_)) => {
                    Err(PyValueError::new_err("Cannot set both `limit` and `index`"))?
                },
            };

            let table_data = TableData::from_py(py, input)?;
            let table = client.as_ref().unwrap().table(table_data, options);
            Ok::<_, PyErr>(table)
        })?;

        let table = table.await.into_pyerr()?;
        Ok(PyTable {
            table: Arc::new(Mutex::new(table)),
            // client: self.client.clone(),
        })
    }
}

#[derive(Clone)]
pub struct PyTable {
    table: Arc<Mutex<Table>>,
    // client: Arc<Mutex<Option<Client>>>,
}

assert_table_api!(PyTable);

impl PyTable {
    pub async fn get_index(&self) -> Option<String> {
        self.table.lock().await.get_index()
    }

    pub async fn get_limit(&self) -> Option<u32> {
        self.table.lock().await.get_limit()
    }

    pub async fn size(&self) -> usize {
        self.table.lock().await.size().await.unwrap()
    }

    pub async fn columns(&self) -> Vec<String> {
        self.table.lock().await.columns().await.unwrap()
    }

    pub async fn clear(&self) -> PyResult<()> {
        self.table.lock().await.clear().await.into_pyerr()
    }

    pub async fn delete(&self) -> PyResult<()> {
        self.table.lock().await.delete().await.into_pyerr()
    }

    pub async fn make_port(&self) -> PyResult<i32> {
        self.table.lock().await.make_port().await.into_pyerr()
    }

    pub async fn on_delete(&self, callback: Py<PyFunction>) -> PyResult<u32> {
        let callback = Box::new(move || {
            Python::with_gil(|py| callback.call0(py)).expect("`on_delete()` callback failed");
        });

        self.table
            .lock()
            .await
            .on_delete(callback)
            .await
            .into_pyerr()
    }

    pub async fn remove_delete(&self, callback_id: u32) -> PyResult<()> {
        self.table
            .lock()
            .await
            .remove_delete(callback_id)
            .await
            .into_pyerr()
    }

    pub async fn replace(&self, input: Py<PyAny>) -> PyResult<()> {
        let table = self.table.lock().await;
        let table_data = Python::with_gil(|py| TableData::from_py(py, input))?;
        table.replace(table_data).await.into_pyerr()
    }

    pub async fn update(
        &self,
        input: Py<PyAny>,
        format: Option<String>,
        port_id: Option<u32>,
    ) -> PyResult<()> {
        let table = self.table.lock().await;
        let table_data = Python::with_gil(|py| TableData::from_py(py, input))?;
        let options = UpdateOptions { format, port_id };
        table.update(table_data, options).await.into_pyerr()
    }

    pub async fn validate_expressions(
        &self,
        expressions: HashMap<String, String>,
    ) -> PyResult<Py<PyAny>> {
        let records = self
            .table
            .lock()
            .await
            .validate_expressions(Expressions(expressions))
            .await
            .into_pyerr()?;

        Python::with_gil(|py| Ok(pythonize::pythonize(py, &records)?))
    }

    pub async fn schema(&self) -> PyResult<HashMap<String, String>> {
        let schema = self.table.lock().await.schema().await.into_pyerr()?;
        Ok(schema
            .into_iter()
            .map(|(x, y)| (x, format!("{}", y)))
            .collect())
    }

    pub async fn view(&self, kwargs: Option<Py<PyDict>>) -> PyResult<PyView> {
        let config = kwargs
            .map(|config| Python::with_gil(|py| depythonize(config.as_ref(py))))
            .transpose()?;
        let view = self.table.lock().await.view(config).await.into_pyerr()?;
        Ok(PyView {
            view: Arc::new(Mutex::new(view)),
        })
    }
}

#[derive(Clone)]
pub struct PyView {
    view: Arc<Mutex<View>>,
}

assert_view_api!(PyView);

impl PyView {
    pub async fn column_paths(&self) -> PyResult<Vec<String>> {
        self.view.lock().await.column_paths().await.into_pyerr()
    }

    pub async fn delete(&self) -> PyResult<()> {
        self.view.lock().await.delete().await.into_pyerr()
    }

    pub async fn dimensions(&self) -> PyResult<Py<PyAny>> {
        let dim = self.view.lock().await.dimensions().await.into_pyerr()?;
        Ok(Python::with_gil(|py| pythonize::pythonize(py, &dim))?)
    }

    pub async fn expression_schema(&self) -> PyResult<HashMap<String, String>> {
        Ok(self
            .view
            .lock()
            .await
            .expression_schema()
            .await
            .into_pyerr()?
            .into_iter()
            .map(|(k, v)| (k, format!("{}", v)))
            .collect())
    }

    pub async fn get_config(&self) -> PyResult<Py<PyAny>> {
        let config = self.view.lock().await.get_config().await.into_pyerr()?;
        Ok(Python::with_gil(|py| pythonize::pythonize(py, &config))?)
    }

    pub async fn get_min_max(&self, name: String) -> PyResult<(String, String)> {
        self.view.lock().await.get_min_max(name).await.into_pyerr()
    }

    pub async fn num_rows(&self) -> PyResult<u32> {
        self.view.lock().await.num_rows().await.into_pyerr()
    }

    pub async fn schema(&self) -> PyResult<HashMap<String, String>> {
        Ok(self
            .view
            .lock()
            .await
            .schema()
            .await
            .into_pyerr()?
            .into_iter()
            .map(|(k, v)| (k, format!("{}", v)))
            .collect())
    }

    pub async fn on_delete(&self, callback: Py<PyFunction>) -> PyResult<u32> {
        let callback = Box::new(move || {
            Python::with_gil(|py| callback.call0(py)).expect("`on_delete()` callback failed");
        });

        self.view
            .lock()
            .await
            .on_delete(callback)
            .await
            .into_pyerr()
    }

    pub async fn remove_delete(&self, callback_id: u32) -> PyResult<()> {
        self.view
            .lock()
            .await
            .remove_delete(callback_id)
            .await
            .into_pyerr()
    }

    pub async fn on_update(&self, callback: Py<PyFunction>, mode: Option<String>) -> PyResult<u32> {
        let callback = Box::new(move |x: (Option<Vec<u8>>, u32)| {
            Python::with_gil(|py| {
                if let Some(x) = &x.0 {
                    callback.call1(py, (PyBytes::new(py, x),))
                } else {
                    callback.call0(py)
                }
            })
            .expect("`on_update()` callback failed");
        });

        let mode = mode
            .map(|x| OnUpdateMode::from_str(x.as_str()))
            .transpose()
            .into_pyerr()?;

        self.view
            .lock()
            .await
            .on_update(callback, OnUpdateOptions { mode })
            .await
            .into_pyerr()
    }

    pub async fn remove_update(&self, callback_id: u32) -> PyResult<()> {
        self.view
            .lock()
            .await
            .remove_update(callback_id)
            .await
            .into_pyerr()
    }

    pub async fn to_arrow(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyBytes>> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.as_ref(py))))
            .transpose()?
            .unwrap_or_default();
        let arrow = self.view.lock().await.to_arrow(window).await.into_pyerr()?;
        Ok(Python::with_gil(|py| PyBytes::new(py, &arrow).into()))
    }

    pub async fn to_csv(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.as_ref(py))))
            .transpose()?
            .unwrap_or_default();

        self.view.lock().await.to_csv(window).await.into_pyerr()
    }

    pub async fn to_columns_string(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.as_ref(py))))
            .transpose()?
            .unwrap_or_default();

        self.view
            .lock()
            .await
            .to_columns_string(window)
            .await
            .into_pyerr()
    }

    pub async fn to_json_string(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.as_ref(py))))
            .transpose()?
            .unwrap_or_default();

        self.view
            .lock()
            .await
            .to_json_string(window)
            .await
            .into_pyerr()
    }
}
