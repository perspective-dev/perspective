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
use std::pin::pin;
use std::str::FromStr;
use std::sync::Arc;

use futures::FutureExt;
use perspective_client::{
    Client, ColumnWindow, DeleteOptions, OnUpdateData, OnUpdateMode, OnUpdateOptions, Table,
    TableData, TableInitOptions, TableReadFormat, TableRef, UpdateData, UpdateOptions, View,
    ViewWindow, assert_table_api, assert_view_api, asyncfn,
};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyAny, PyBytes, PyDict, PyString};
use pythonize::depythonize;

use super::pandas::arrow_to_pandas;
use super::polars::arrow_to_polars;
use super::table_data::TableDataExt;
use super::update_data::UpdateDataExt;
use super::{pandas, polars, pyarrow};
use crate::py_async::{self, AllowThreads};
use crate::py_err::{PyPerspectiveError, ResultTClientErrorExt};

fn py_to_table_ref_async(val: &Bound<'_, PyAny>) -> PyResult<TableRef> {
    if let Ok(t) = val.extract::<AsyncTable>() {
        Ok(TableRef::from(t.table.as_ref()))
    } else if let Ok(name) = val.extract::<String>() {
        Ok(TableRef::from(name))
    } else {
        Err(pyo3::exceptions::PyTypeError::new_err(
            "Expected a Table or string table name",
        ))
    }
}

fn py_to_table_ref_from_owned(py: Python<'_>, val: &Py<PyAny>) -> PyResult<TableRef> {
    let bound = val.bind(py);
    py_to_table_ref_async(bound)
}

/// An instance of a [`Client`] is a connection to a single
/// `perspective_server::Server`, whether locally in-memory or remote over some
/// transport like a WebSocket.
///
/// `AsyncClient` and Perspective objects derived from it have _async_ APIs,
/// suitable for integration with a Python event loop like `asyncio`.
/// @private
#[pyclass(module = "perspective")]
#[derive(Clone)]
pub struct AsyncClient {
    pub(crate) client: Client,
    close_cb: Arc<Option<Py<PyAny>>>,
}

impl AsyncClient {
    pub fn new_from_client(client: Client) -> Self {
        AsyncClient {
            client,
            close_cb: Arc::default(),
        }
    }
}

#[pymethods]
impl AsyncClient {
    #[new]
    #[pyo3(signature=(handle_request, handle_close=None, name=None))]
    pub fn new(
        handle_request: Py<PyAny>,
        handle_close: Option<Py<PyAny>>,
        name: Option<String>,
    ) -> PyResult<Self> {
        let handle_request = Arc::new(handle_request);
        let client = Client::new_with_callback(
            name.as_deref(),
            asyncfn!(handle_request, async move |msg| {
                if let Some(fut) = Python::with_gil(move |py| -> PyResult<_> {
                    let ret = handle_request.call1(py, (PyBytes::new(py, &msg),))?;
                    if isawaitable(ret.bind(py)).unwrap_or(false) {
                        Ok(Some(py_async::py_into_future(ret.into_bound(py))?))
                    } else {
                        Ok(None)
                    }
                })? {
                    let result = fut.await;
                    Python::with_gil(|_| {
                        result
                            .map(|_| ())
                            .map_err(perspective_server::ServerError::from)
                    })?
                }

                Ok(())
            }),
        );

        Ok(AsyncClient {
            client: client.into_pyerr()?,
            close_cb: handle_close.into(),
        })
    }

    /// Handle a message from the external message queue.
    /// [`Client::handle_response`] is part of the low-level message-handling
    /// API necessary to implement new transports for a [`Client`]
    /// connection to a local-or-remote `perspective_server::Server`, and
    /// doesn't generally need to be called directly by "users" of a
    /// [`Client`] once connected.
    pub async fn handle_response(&self, bytes: Py<PyBytes>) -> PyResult<bool> {
        self.client
            .handle_response(Python::with_gil(|py| bytes.as_bytes(py)))
            .await
            .into_pyerr()
    }

    /// Creates a new [`Table`] from either a _schema_ or _data_.
    ///
    /// The [`Client::table`] factory function can be initialized with either a
    /// _schema_ (see [`Table::schema`]), or data in one of these formats:
    ///
    /// - Apache Arrow
    /// - CSV
    /// - JSON row-oriented
    /// - JSON column-oriented
    ///
    /// When instantiated with _data_, the schema is inferred from this data.
    /// While this is convenient, inferrence is sometimes imperfect e.g.
    /// when the input is empty, null or ambiguous. For these cases,
    /// [`Client::table`] can first be instantiated with a explicit schema.
    ///
    /// When instantiated with a _schema_, the resulting [`Table`] is empty but
    /// with known column names and column types. When subsqeuently
    /// populated with [`Table::update`], these columns will be _coerced_ to
    /// the schema's type. This behavior can be useful when
    /// [`Client::table`]'s column type inferences doesn't work.
    ///
    /// The resulting [`Table`] is _virtual_, and invoking its methods
    /// dispatches events to the `perspective_server::Server` this
    /// [`Client`] connects to, where the data is stored and all calculation
    /// occurs.
    ///
    /// # Arguments
    ///
    /// - `arg` - Either _schema_ or initialization _data_.
    /// - `options` - Optional configuration which provides one of:
    ///     - `limit` - The max number of rows the resulting [`Table`] can
    ///       store.
    ///     - `index` - The column name to use as an _index_ column. If this
    ///       `Table` is being instantiated by _data_, this column name must be
    ///       present in the data.
    ///     - `name` - The name of the table. This will be generated if it is
    ///       not provided.
    ///     - `format` - The explicit format of the input data, can be one of
    ///       `"json"`, `"columns"`, `"csv"` or `"arrow"`. This overrides
    ///       language-specific type dispatch behavior, which allows stringified
    ///       and byte array alternative inputs.
    ///     - `on_disk` - Back this [`Table`]'s canonical data with the on-disk
    ///       (memory-mapped) storage backend instead of memory.
    ///
    /// # Python Examples
    ///
    /// Load a CSV from a `str`:
    ///
    /// ```python
    /// table = await client.table("x,y\n1,2\n3,4")
    /// ```
    #[pyo3(signature=(input, limit=None, index=None, name=None, format=None, on_disk=None))]
    pub async fn table(
        &self,
        input: Py<PyAny>,
        limit: Option<u32>,
        index: Option<Py<PyString>>,
        name: Option<Py<PyString>>,
        format: Option<Py<PyString>>,
        on_disk: Option<bool>,
    ) -> PyResult<AsyncTable> {
        let client = self.client.clone();
        let py_client = Python::with_gil(|_| self.clone());
        let table = Python::with_gil(|py| {
            let mut options = TableInitOptions {
                name: name.map(|x| x.extract::<String>(py)).transpose()?,
                on_disk,
                ..TableInitOptions::default()
            };

            let format = TableReadFormat::parse(format.map(|x| x.to_string()))
                .map_err(PyPerspectiveError::new_err)?;

            match (limit, index) {
                (None, None) => {},
                (None, Some(index)) => {
                    options.index = Some(index.extract::<String>(py)?);
                },
                (Some(limit), None) => options.limit = Some(limit),
                (Some(_), Some(_)) => {
                    Err(PyValueError::new_err("Cannot set both `limit` and `index`"))?
                },
            };

            let input = input.into_bound(py);
            let input_data = if pyarrow::is_arrow_table(py, &input)? {
                pyarrow::to_arrow_bytes(py, &input)?.into_any()
            } else if pandas::is_pandas_df(py, &input)? {
                pandas::pandas_to_arrow_bytes(py, &input)?.into_any()
            } else if polars::is_polars_df(py, &input)? || polars::is_polars_lf(py, &input)? {
                polars::polars_to_arrow_bytes(py, &input)?.into_any()
            } else {
                input
            };

            let table_data = TableData::from_py(input_data, format)?;
            let table = client.table(table_data, options);
            Ok::<_, PyErr>(table)
        })?;

        let table = table.await.into_pyerr()?;
        Ok(AsyncTable {
            table: Arc::new(table),
            client: py_client,
        })
    }

    /// Opens a [`Table`] that is hosted on the `perspective_server::Server`
    /// that is connected to this [`Client`].
    ///
    /// The `name` property of [`TableInitOptions`] is used to identify each
    /// [`Table`]. [`Table`] `name`s can be looked up for each [`Client`]
    /// via [`Client::get_hosted_table_names`].
    ///
    /// # Python Examples
    ///
    /// ```python
    /// table = await client.open_table("table_one");
    /// ```
    pub async fn open_table(&self, name: String) -> PyResult<AsyncTable> {
        let client = self.client.clone();
        let py_client = self.clone();
        let table = client.open_table(name).await.into_pyerr()?;
        Ok(AsyncTable {
            table: Arc::new(table),
            client: py_client,
        })
    }

    /// Creates a new read-only [`Table`] by performing an INNER JOIN on two
    /// source tables. The resulting table is reactive: when either source
    /// table is updated, the join is automatically recomputed.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// joined = await client.join(orders_table, products_table, "Product ID", "left")
    /// ```
    #[pyo3(signature = (left, right, on, join_type=None, name=None, right_on=None))]
    pub async fn join(
        &self,
        left: Py<PyAny>,
        right: Py<PyAny>,
        on: String,
        join_type: Option<String>,
        name: Option<String>,
        right_on: Option<String>,
    ) -> PyResult<AsyncTable> {
        let (left_ref, right_ref) = Python::with_gil(|py| {
            let left_ref = py_to_table_ref_from_owned(py, &left)?;
            let right_ref = py_to_table_ref_from_owned(py, &right)?;
            Ok::<_, PyErr>((left_ref, right_ref))
        })?;
        let jt = super::client_sync::parse_join_type(join_type.as_deref())?;
        let options = perspective_client::JoinOptions {
            join_type: Some(jt),
            name,
            right_on,
        };
        let py_client = self.clone();
        let table = self
            .client
            .join(left_ref, right_ref, &on, options)
            .await
            .into_pyerr()?;
        Ok(AsyncTable {
            table: Arc::new(table),
            client: py_client,
        })
    }

    /// Retrieves the names of all tables that this client has access to.
    ///
    /// `name` is a string identifier unique to the [`Table`] (per [`Client`]),
    /// which can be used in conjunction with [`Client::open_table`] to get
    /// a [`Table`] instance without the use of [`Client::table`]
    /// constructor directly (e.g., one created by another [`Client`]).
    ///
    /// # Python Examples
    ///
    /// ```python
    /// tables = await client.get_hosted_table_names();
    /// ```
    pub async fn get_hosted_table_names(&self) -> PyResult<Vec<String>> {
        self.client.get_hosted_table_names().await.into_pyerr()
    }

    /// Register a callback which is invoked whenever [`Client::table`] (on this
    /// [`Client`]) or [`Table::delete`] (on a [`Table`] belinging to this
    /// [`Client`]) are called.
    pub async fn on_hosted_tables_update(&self, callback_py: Py<PyAny>) -> PyResult<u32> {
        let callback = Box::new(move || {
            let callback = Python::with_gil(|py| Py::clone_ref(&callback_py, py));
            async move {
                let aggregate_errors: PyResult<()> = {
                    let callback = Python::with_gil(|py| Py::clone_ref(&callback, py));
                    Python::with_gil(|py| {
                        callback.call0(py)?;
                        Ok(())
                    })
                };

                // TODO These are unrecoverable errors - we should mark them as such
                if let Err(err) = aggregate_errors {
                    tracing::warn!("Error in on_hosted_tables_update callback: {:?}", err);
                }
            }
            .boxed()
        });

        let callback_id = self
            .client
            .on_hosted_tables_update(callback)
            .await
            .into_pyerr()?;
        Ok(callback_id)
    }

    /// Remove a callback previously registered via
    /// [`Client::on_hosted_tables_update`].
    pub async fn remove_hosted_tables_update(&self, id: u32) -> PyResult<()> {
        self.client
            .remove_hosted_tables_update(id)
            .await
            .into_pyerr()
    }

    /// Provides the [`SystemInfo`] struct, implementation-specific metadata
    /// about the [`perspective_server::Server`] runtime such as Memory and
    /// CPU usage.
    pub async fn system_info(&self) -> PyResult<Py<PyAny>> {
        let sysinfo = self.client.system_info().await.into_pyerr()?;
        Python::with_gil(|py| Ok(pythonize::pythonize(py, &sysinfo)?.unbind()))
    }

    /// Terminates this [`Client`], cleaning up any [`crate::View`] handles the
    /// [`Client`] has open as well as its callbacks.
    pub fn terminate(&self, py: Python<'_>) -> PyResult<()> {
        if let Some(cb) = &*self.close_cb {
            cb.call0(py)?;
        }

        Ok(())
    }
}

/// [`AsyncTable`] is Perspective's columnar data frame, analogous to a
/// Pandas/Polars `DataFrame` or Apache Arrow, supporting append & in-place
/// updates, removal by index, and update notifications.
///
/// A [`AsyncTable`] contains columns, each of which have a unique name, are
/// strongly and consistently typed, and contains rows of data conforming to the
/// column's type. Each column in a [`AsyncTable`] must have the same number of
/// rows, though not every row must contain data; null-values are used to
/// indicate missing values in the dataset. The schema of a [`AsyncTable`] is
/// _immutable after creation_, which means the column names and data types
/// cannot be changed after the [`AsyncTable`] has been created. Columns cannot
/// be added or deleted after creation either, but a [`AsyncView`] can be used
/// to select an arbitrary set of columns from the [`AsyncTable`].
#[pyclass]
#[derive(Clone)]
pub struct AsyncTable {
    pub(super) table: Arc<Table>,
    pub(super) client: AsyncClient,
}

assert_table_api!(AsyncTable);

#[pymethods]
impl AsyncTable {
    pub fn get_index(&self) -> Option<String> {
        self.table.get_index()
    }

    /// Get a copy of the [`Client`] this [`Table`] came from.
    pub async fn get_client(&self) -> AsyncClient {
        AsyncClient {
            client: self.table.get_client(),
            close_cb: self.client.close_cb.clone(),
        }
    }

    /// Returns the user-specified row limit for this table.
    pub fn get_limit(&self) -> Option<u32> {
        self.table.get_limit()
    }

    /// Returns the user-specified name for this table, or the auto-generated
    /// name if a name was not specified when the table was created.
    pub fn get_name(&self) -> String {
        self.table.get_name().into()
    }

    /// Returns the number of rows in a [`Table`].
    pub async fn size(&self) -> PyResult<usize> {
        self.table.size().await.into_pyerr()
    }

    /// Returns the column names of this [`Table`] in "natural" order (the
    /// ordering implied by the input format).
    ///  
    ///  # Python Examples
    ///
    /// ```python
    /// columns = table.columns()
    /// ```
    pub async fn columns(&self) -> PyResult<Vec<String>> {
        self.table.columns().await.into_pyerr()
    }

    /// Removes all the rows in the [`Table`], but preserves everything else
    /// including the schema, index, and any callbacks or registered
    /// [`View`] instances.
    ///
    /// Calling [`Table::clear`], like [`Table::update`] and [`Table::remove`],
    /// will trigger an update event to any registered listeners via
    /// [`View::on_update`].
    pub async fn clear(&self) -> PyResult<()> {
        self.table.clear().await.into_pyerr()
    }

    /// Delete this [`Table`] and cleans up associated resources.
    ///
    /// [`Table`]s do not stop consuming resources or processing updates when
    /// they are garbage collected in their host language - you must call
    /// this method to reclaim these.
    ///
    /// # Arguments
    ///
    /// - `options` An options dictionary.
    ///     - `lazy` Whether to delete this [`Table`] _lazily_. When false (the
    ///       default), the delete will occur immediately, assuming it has no
    ///       [`View`] instances registered to it (which must be deleted first,
    ///       otherwise this method will throw an error). When true, the
    ///       [`Table`] will only be marked for deltion once its [`View`]
    ///       dependency count reaches 0.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// table = await client.table("x,y\n1,2\n3,4")
    ///
    /// # ...
    ///
    /// table.delete(lazy=True)
    /// ```
    #[pyo3(signature=(lazy=false))]
    pub async fn delete(&self, lazy: bool) -> PyResult<()> {
        self.table.delete(DeleteOptions { lazy }).await.into_pyerr()
    }

    /// Create a unique channel ID on this [`Table`], which allows
    /// `View::on_update` callback calls to be associated with the
    /// `Table::update` which caused them.
    pub async fn make_port(&self) -> PyResult<i32> {
        self.table.make_port().await.into_pyerr()
    }

    /// Register a callback which is called exactly once, when this [`Table`] is
    /// deleted with the [`Table::delete`] method.
    ///
    /// [`Table::on_delete`] resolves when the subscription message is sent, not
    /// when the _delete_ event occurs.
    pub async fn on_delete(&self, callback_py: Py<PyAny>) -> PyResult<u32> {
        let callback = {
            let callback_py = Python::with_gil(|py| Py::clone_ref(&callback_py, py));
            Box::new(move || {
                Python::with_gil(|py| callback_py.call0(py))
                    .expect("`on_delete()` callback failed");
            })
        };

        let callback_id = self.table.on_delete(callback).await.into_pyerr()?;
        Ok(callback_id)
    }

    /// Removes a listener with a given ID, as returned by a previous call to
    /// [`Table::on_delete`].
    pub async fn remove_delete(&self, callback_id: u32) -> PyResult<()> {
        self.table.remove_delete(callback_id).await.into_pyerr()
    }

    /// Removes rows from this [`Table`] with the `index` column values
    /// supplied.
    ///
    /// # Arguments
    ///
    /// - `indices` - A list of `index` column values for rows that should be
    ///   removed.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// tbl = await client.table({"a": [1, 2, 3]}, index="a")
    /// await tbl.remove([2, 3])
    /// ```
    #[pyo3(signature=(input, format=None))]
    pub async fn remove(&self, input: Py<PyAny>, format: Option<String>) -> PyResult<()> {
        let table = &self.table;
        let format = TableReadFormat::parse(format).map_err(PyPerspectiveError::new_err)?;
        let table_data = Python::with_gil(|py| UpdateData::from_py(input.into_bound(py), format))?;
        table.remove(table_data).await.into_pyerr()
    }

    /// Replace all rows in this [`Table`] with the input data, coerced to this
    /// [`Table`]'s existing [`Schema`], notifying any derived [`View`] and
    /// [`View::on_update`] callbacks.
    ///
    /// Calling [`Table::replace`] is an easy way to replace _all_ the data in a
    /// [`Table`] without losing any derived [`View`] instances or
    /// [`View::on_update`] callbacks. [`Table::replace`] does _not_ infer
    /// data types like [`Client::table`] does, rather it _coerces_ input
    /// data to the `Schema` like [`Table::update`]. If you need a [`Table`]
    /// with a different `Schema`, you must create a new one.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// await table.replace("x,y\n1,2")
    /// ```
    #[pyo3(signature=(input, format=None))]
    pub async fn replace(&self, input: Py<PyAny>, format: Option<String>) -> PyResult<()> {
        let table = &self.table;
        let format = TableReadFormat::parse(format).map_err(PyPerspectiveError::new_err)?;
        let table_data = Python::with_gil(|py| UpdateData::from_py(input.into_bound(py), format))?;
        table.replace(table_data).await.into_pyerr()
    }

    /// Updates the rows of this table and any derived [`View`] instances.
    ///
    /// Calling [`Table::update`] will trigger the [`View::on_update`] callbacks
    /// register to derived [`View`], and the call itself will not resolve until
    /// _all_ derived [`View`]'s are notified.
    ///
    /// When updating a [`Table`] with an `index`, [`Table::update`] supports
    /// partial updates, by omitting columns from the update data.
    ///
    /// # Arguments
    ///
    /// - `input` - The input data for this [`Table`]. The schema of a [`Table`]
    ///   is immutable after creation, so this method cannot be called with a
    ///   schema.
    /// - `options` - Options for this update step - see [`UpdateOptions`].
    ///
    /// # Python Examples
    ///
    /// ```python
    /// await table.update("x,y\n1,2")
    /// ```
    #[pyo3(signature=(input, port_id=None, format=None))]
    pub async fn update(
        &self,
        input: Py<PyAny>,
        port_id: Option<u32>,
        format: Option<String>,
    ) -> PyResult<()> {
        let input_data: Py<PyAny> = Python::with_gil(|py| {
            let input = input.into_bound(py);
            let data = if pyarrow::is_arrow_table(py, &input)? {
                pyarrow::to_arrow_bytes(py, &input)?.into_any()
            } else if pandas::is_pandas_df(py, &input)? {
                pandas::pandas_to_arrow_bytes(py, &input)?.into_any()
            } else if polars::is_polars_df(py, &input)? || polars::is_polars_lf(py, &input)? {
                polars::polars_to_arrow_bytes(py, &input)?.into_any()
            } else {
                input
            };
            Ok(data.unbind()) as PyResult<Py<PyAny>>
        })?;

        let table = &self.table;
        let format = TableReadFormat::parse(format).map_err(PyPerspectiveError::new_err)?;
        let table_data =
            Python::with_gil(|py| UpdateData::from_py(input_data.into_bound(py), format))?;
        let options = UpdateOptions { port_id, format };
        AllowThreads(pin!(table.update(table_data, options)))
            .await
            .into_pyerr()?;
        Ok(())
    }

    /// Validates the given expressions.
    pub async fn validate_expressions(&self, expressions: Py<PyAny>) -> PyResult<Py<PyAny>> {
        let expressions = Python::with_gil(|py| depythonize(expressions.bind(py)))?;
        let records = self
            .table
            .validate_expressions(expressions)
            .await
            .into_pyerr()?;

        Python::with_gil(|py| Ok(pythonize::pythonize(py, &records)?.unbind()))
    }

    /// Returns a table's [`Schema`], a mapping of column names to column types.
    ///
    /// The mapping of a [`Table`]'s column names to data types is referred to
    /// as a [`Schema`]. Each column has a unique name and a data type, one
    /// of:
    ///
    /// - `"boolean"` - A boolean type
    /// - `"date"` - A timesonze-agnostic date type (month/day/year)
    /// - `"datetime"` - A millisecond-precision datetime type in the UTC
    ///   timezone
    /// - `"float"` - A 64 bit float
    /// - `"integer"` - A signed 32 bit integer (the integer type supported by
    ///   JavaScript)
    /// - `"string"` - A `String` data type (encoded internally as a
    ///   _dictionary_)
    ///
    /// Note that all [`Table`] columns are _nullable_, regardless of the data
    /// type.
    pub async fn schema(&self) -> PyResult<HashMap<String, String>> {
        let schema = self.table.schema().await.into_pyerr()?;
        Ok(schema
            .into_iter()
            .map(|(x, y)| (x, format!("{y}")))
            .collect())
    }

    /// Create a new [`View`] from this table with a specified
    /// [`ViewConfigUpdate`].
    ///
    /// See [`View`] struct.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// view = await table.view(
    ///   columns=["Sales"],
    ///   aggregates={"Sales": "sum"},
    ///   group_by=["Region", "Country"],
    ///   filter=[["Category", "in", ["Furniture", "Technology"]]]
    /// )
    /// ```
    #[pyo3(signature = (**kwargs))]
    pub async fn view(&self, kwargs: Option<Py<PyDict>>) -> PyResult<AsyncView> {
        let config = kwargs
            .map(|config| Python::with_gil(|py| depythonize(config.bind(py))))
            .transpose()?;

        let view = self.table.view(config).await.into_pyerr()?;
        Ok(AsyncView {
            view: Arc::new(view),
            _client: self.client.clone(),
        })
    }
}

/// The [`View`] struct is Perspective's query and serialization interface. It
/// represents a query on the `Table`'s dataset and is always created from an
/// existing `Table` instance via the [`Table::view`] method.
///
/// [`View`]s are immutable with respect to the arguments provided to the
/// [`Table::view`] method; to change these parameters, you must create a new
/// [`View`] on the same [`Table`]. However, each [`View`] is _live_ with
/// respect to the [`Table`]'s data, and will (within a conflation window)
/// update with the latest state as its parent [`Table`] updates, including
/// incrementally recalculating all aggregates, pivots, filters, etc. [`View`]
/// query parameters are composable, in that each parameter works independently
/// _and_ in conjunction with each other, and there is no limit to the number of
/// pivots, filters, etc. which can be applied.
#[pyclass]
#[derive(Clone)]
pub struct AsyncView {
    pub(crate) view: Arc<View>,
    _client: AsyncClient,
}

assert_view_api!(AsyncView);

#[pymethods]
impl AsyncView {
    /// Returns an array of strings containing the column paths of the [`View`]
    /// without any of the source columns.
    ///
    /// A column path shows the columns that a given cell belongs to after
    /// pivots are applied.
    pub async fn column_paths(&self, window: Option<Py<PyDict>>) -> PyResult<Vec<String>> {
        let window: ColumnWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();

        self.view.column_paths(window).await.into_pyerr()
    }

    /// Delete this [`View`] and clean up all resources associated with it.
    /// [`View`] objects do not stop consuming resources or processing
    /// updates when they are garbage collected - you must call this method
    /// to reclaim these.
    pub async fn delete(&self) -> PyResult<()> {
        self.view.delete().await.into_pyerr()
    }

    /// Returns this [`View`]'s _dimensions_, row and column count, as well as
    /// those of the [`crate::Table`] from which it was derived.
    ///
    /// - `num_table_rows` - The number of rows in the underlying
    ///   [`crate::Table`].
    /// - `num_table_columns` - The number of columns in the underlying
    ///   [`crate::Table`] (including the `index` column if this
    ///   [`crate::Table`] was constructed with one).
    /// - `num_view_rows` - The number of rows in this [`View`]. If this
    ///   [`View`] has a `group_by` clause, `num_view_rows` will also include
    ///   aggregated rows.
    /// - `num_view_columns` - The number of columns in this [`View`]. If this
    ///   [`View`] has a `split_by` clause, `num_view_columns` will include all
    ///   _column paths_, e.g. the number of `columns` clause times the number
    ///   of `split_by` groups.
    pub async fn dimensions(&self) -> PyResult<Py<PyAny>> {
        let dim = self.view.dimensions().await.into_pyerr()?;
        Python::with_gil(|py| Ok(pythonize::pythonize(py, &dim)?.unbind()))
    }

    pub async fn expand(&self, index: u32) -> PyResult<u32> {
        self.view.expand(index).await.into_pyerr()
    }

    pub async fn collapse(&self, index: u32) -> PyResult<u32> {
        self.view.collapse(index).await.into_pyerr()
    }

    /// The expression schema of this [`View`], which contains only the
    /// expressions created on this [`View`]. See [`View::schema`] for
    /// details.
    pub async fn expression_schema(&self) -> PyResult<HashMap<String, String>> {
        Ok(self
            .view
            .expression_schema()
            .await
            .into_pyerr()?
            .into_iter()
            .map(|(k, v)| (k, format!("{v}")))
            .collect())
    }

    /// A copy of the config object passed to the [`Table::view`] method which
    /// created this [`View`].
    pub async fn get_config(&self) -> PyResult<Py<PyAny>> {
        let config = self.view.get_config().await.into_pyerr()?;
        Python::with_gil(|py| Ok(pythonize::pythonize(py, &config)?.unbind()))
    }

    /// Calculates the [min, max] of the leaf nodes of a column `column_name`.
    ///
    /// # Returns
    ///
    /// A tuple of [min, max], whose types are column and aggregate dependent.
    pub async fn get_min_max(&self, name: String) -> PyResult<(PyObject, PyObject)> {
        let (min, max) = self.view.get_min_max(name).await.into_pyerr()?;
        Python::with_gil(|py| {
            Ok((
                super::client_sync::scalar_to_py(py, &min),
                super::client_sync::scalar_to_py(py, &max),
            ))
        })
    }

    /// The number of aggregated rows in this [`View`]. This is affected by the
    /// "group_by" configuration parameter supplied to this view's contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated rows.
    pub async fn num_rows(&self) -> PyResult<u32> {
        self.view.num_rows().await.into_pyerr()
    }

    /// The number of aggregated columns in this [`View`]. This is affected by
    /// the "split_by" configuration parameter supplied to this view's
    /// contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated columns.
    pub async fn num_columns(&self) -> PyResult<u32> {
        let dim = self.view.dimensions().await.into_pyerr()?;
        Ok(dim.num_view_columns)
    }

    /// The schema of this [`View`].
    ///
    /// The [`View`] schema differs from the `schema` returned by
    /// [`Table::schema`]; it may have different column names due to
    /// `expressions` or `columns` configs, or it maye have _different
    /// column types_ due to the application og `group_by` and `aggregates`
    /// config. You can think of [`Table::schema`] as the _input_ schema and
    /// [`View::schema`] as the _output_ schema of a Perspective pipeline.
    pub async fn schema(&self) -> PyResult<HashMap<String, String>> {
        Ok(self
            .view
            .schema()
            .await
            .into_pyerr()?
            .into_iter()
            .map(|(k, v)| (k, format!("{v}")))
            .collect())
    }

    /// Register a callback with this [`View`]. Whenever the [`View`] is
    /// deleted, this callback will be invoked.
    pub async fn on_delete(&self, callback_py: Py<PyAny>) -> PyResult<u32> {
        let callback = {
            let callback_py = Arc::new(callback_py);
            Box::new(move || {
                Python::with_gil(|py| callback_py.call0(py))
                    .expect("`on_delete()` callback failed");
            })
        };

        let callback_id = self.view.on_delete(callback).await.into_pyerr()?;
        Ok(callback_id)
    }

    /// Unregister a previously registered [`View::on_delete`] callback.
    pub async fn remove_delete(&self, callback_id: u32) -> PyResult<()> {
        self.view.remove_delete(callback_id).await.into_pyerr()
    }

    /// Register a callback with this [`View`]. Whenever the view's underlying
    /// table emits an update, this callback will be invoked with an object
    /// containing `port_id`, indicating which port the update fired on, and
    /// optionally `delta`, which is the new data that was updated for each
    /// cell or each row.
    ///
    /// # Arguments
    ///
    /// - `on_update` - A callback function invoked on update, which receives an
    ///   object with two keys: `port_id`, indicating which port the update was
    ///   triggered on, and `delta`, whose value is dependent on the mode
    ///   parameter.
    /// - `options` - If this is provided as `OnUpdateOptions { mode:
    ///   Some(OnUpdateMode::Row) }`, then `delta` is an Arrow of the updated
    ///   rows. Otherwise `delta` will be [`Option::None`].
    #[pyo3(signature=(callback, mode=None))]
    pub async fn on_update(&self, callback: Py<PyAny>, mode: Option<String>) -> PyResult<u32> {
        let callback = move |x: OnUpdateData| {
            let callback = Python::with_gil(|py| Py::clone_ref(&callback, py));
            async move {
                let aggregate_errors: PyResult<()> = {
                    let callback = Python::with_gil(|py| Py::clone_ref(&callback, py));
                    Python::with_gil(|py| {
                        match &x.delta {
                            None => callback.call1(py, (x.port_id,))?,
                            Some(delta) => {
                                callback.call1(py, (x.port_id, PyBytes::new(py, delta)))?
                            },
                        };

                        Ok(())
                    })
                };

                if let Err(err) = aggregate_errors {
                    tracing::warn!("Error in on_update callback: {:?}", err);
                }
            }
            .boxed()
        };

        let mode = mode
            .map(|x| OnUpdateMode::from_str(x.as_str()))
            .transpose()
            .into_pyerr()?;

        self.view
            .on_update(Box::new(callback), OnUpdateOptions { mode })
            .await
            .into_pyerr()
    }

    /// Unregister a previously registered update callback with this [`View`].
    ///
    /// # Arguments
    ///
    /// - `id` - A callback `id` as returned by a recipricol call to
    ///   [`View::on_update`].
    pub async fn remove_update(&self, callback_id: u32) -> PyResult<()> {
        self.view.remove_update(callback_id).await.into_pyerr()
    }

    #[pyo3(signature=(**window))]
    pub async fn to_dataframe(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();
        let arrow = self.view.to_arrow(window).await.into_pyerr()?;
        Python::with_gil(|py| arrow_to_pandas(py, &arrow))
    }

    #[pyo3(signature=(**window))]
    pub async fn to_polars(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();
        let arrow = self.view.to_arrow(window).await.into_pyerr()?;
        Python::with_gil(|py| arrow_to_polars(py, &arrow))
    }

    /// Serializes a [`View`] to the Apache Arrow data format.
    #[pyo3(signature=(**window))]
    pub async fn to_arrow(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyBytes>> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();
        let arrow = self.view.to_arrow(window).await.into_pyerr()?;
        Ok(Python::with_gil(|py| PyBytes::new(py, &arrow).into()))
    }

    /// Serializes this [`View`] to CSV data in a standard format.
    #[pyo3(signature=(**window))]
    pub async fn to_csv(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();

        self.view.to_csv(window).await.into_pyerr()
    }

    /// Serializes this [`View`] to a string of JSON data. Useful if you want to
    /// save additional round trip serialize/deserialize cycles.
    #[pyo3(signature=(**window))]
    pub async fn to_columns_string(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();

        self.view.to_columns_string(window).await.into_pyerr()
    }

    /// Serializes this [`View`] to Python objects in a column-oriented
    /// format.
    #[pyo3(signature = (**window))]
    pub async fn to_columns(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        let json = self.to_columns_string(window).await?;
        Python::with_gil(|py| {
            let json_module = PyModule::import(py, "json")?;
            let records = json_module.call_method1("loads", (json,))?;
            Ok(records.unbind())
        })
    }

    /// Render this `View` as a JSON string.
    #[pyo3(signature=(window=None))]
    pub async fn to_json_string(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();

        self.view.to_json_string(window).await.into_pyerr()
    }

    /// Renders this [`View`] as an [NDJSON](https://github.com/ndjson/ndjson-spec)
    /// formatted `String`.
    #[pyo3(signature=(window=None))]
    pub async fn to_ndjson(&self, window: Option<Py<PyDict>>) -> PyResult<String> {
        let window: ViewWindow = Python::with_gil(|py| window.map(|x| depythonize(x.bind(py))))
            .transpose()?
            .unwrap_or_default();

        self.view.to_ndjson(window).await.into_pyerr()
    }

    /// Alias for [`View::to_json`].
    #[pyo3(signature = (**window))]
    pub async fn to_records(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        let json = self.to_json_string(window).await?;
        Python::with_gil(|py| {
            let json_module = PyModule::import(py, "json")?;
            let records = json_module.call_method1("loads", (json,))?;
            Ok(records.unbind())
        })
    }

    /// Serializes this [`View`] to Python objects in a row-oriented
    /// format.
    #[pyo3(signature = (**window))]
    pub async fn to_json(&self, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        self.to_records(window).await
    }
}

fn isawaitable(object: &Bound<'_, PyAny>) -> PyResult<bool> {
    let py = object.py();
    py.import("inspect")?
        .call_method1("isawaitable", (object,))?
        .extract()
}
