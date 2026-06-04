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
use std::future::Future;
use std::sync::Arc;

use perspective_client::config::Scalar;
use perspective_client::{JoinType, TableRef, assert_table_api, assert_view_api};
#[cfg(doc)]
use perspective_client::{TableInitOptions, UpdateOptions, config::ViewConfigUpdate};
use pyo3::exceptions::PyTypeError;
use pyo3::marker::Ungil;
use pyo3::prelude::*;
use pyo3::types::*;

use super::client_async::*;
use crate::py_err::ResultTClientErrorExt;
use crate::server::Server;

pub(crate) fn py_to_table_ref(val: &Bound<'_, PyAny>) -> PyResult<TableRef> {
    if let Ok(t) = val.downcast::<Table>() {
        let table_ref = t.borrow();
        Ok(TableRef::from(&*table_ref.0.table))
    } else if let Ok(name) = val.extract::<String>() {
        Ok(TableRef::from(name))
    } else {
        Err(PyTypeError::new_err(
            "Expected a Table or string table name",
        ))
    }
}

pub(crate) fn parse_join_type(join_type: Option<&str>) -> PyResult<JoinType> {
    match join_type {
        Some("left") => Ok(JoinType::Left),
        Some("outer") => Ok(JoinType::Outer),
        None | Some("inner") => Ok(JoinType::Inner),
        Some(other) => Err(pyo3::exceptions::PyValueError::new_err(format!(
            "Unknown join type: \"{}\"",
            other
        ))),
    }
}

pub(crate) fn scalar_to_py(py: Python<'_>, scalar: &Scalar) -> PyObject {
    match scalar {
        Scalar::Float(x) => x.into_pyobject(py).unwrap().into_any().unbind(),
        Scalar::String(x) => x.into_pyobject(py).unwrap().into_any().unbind(),
        Scalar::Bool(x) => x.into_pyobject(py).unwrap().to_owned().into_any().unbind(),
        Scalar::Null => py.None(),
    }
}

pub(crate) trait PyFutureExt: Future {
    fn py_block_on(self, py: Python<'_>) -> Self::Output
    where
        Self: Sized + Send,
        Self::Output: Ungil,
    {
        use pollster::FutureExt;
        py.allow_threads(move || self.block_on())
    }
}

impl<F: Future> PyFutureExt for F {}

/// An instance of a [`Client`] is a connection to a single [`Server`], whether
/// locally in-memory or remote over some transport like a WebSocket.
///
/// [`Client`] and Perspective objects derived from it have _synchronous_ APIs,
/// suitable for use in a repl or script context where this is the _only_
/// [`Client`] connected to its [`Server`]. If you want to
/// integrate with a Web framework or otherwise connect multiple clients,
/// use [`AsyncClient`].
#[pyclass(subclass, module = "perspective")]
pub struct Client(pub(crate) AsyncClient);

#[pymethods]
impl Client {
    #[new]
    #[pyo3(signature = (handle_request, close_cb=None, name=None))]
    pub fn new(
        handle_request: Py<PyAny>,
        close_cb: Option<Py<PyAny>>,
        name: Option<String>,
    ) -> PyResult<Self> {
        let client = AsyncClient::new(handle_request, close_cb, name)?;
        Ok(Client(client))
    }

    /// Create a new [`Client`] instance bound to a specific in-process
    /// [`Server`] (e.g. generally _not_ the global [`Server`]).
    #[staticmethod]
    pub fn from_server(py: Python<'_>, server: Py<Server>) -> PyResult<Self> {
        server.borrow(py).new_local_client()
    }

    /// Handle a message from the external message queue.
    /// [`Client::handle_response`] is part of the low-level message-handling
    /// API necessary to implement new transports for a [`Client`]
    /// connection to a local-or-remote [`Server`], and
    /// doesn't generally need to be called directly by "users" of a
    /// [`Client`] once connected.
    pub fn handle_response(&self, py: Python<'_>, response: Py<PyBytes>) -> PyResult<bool> {
        self.0.handle_response(response).py_block_on(py)
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
    /// - NDJSON
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
    ///
    /// # Python Examples
    ///
    /// Load a CSV from a `str`:
    ///
    /// ```python
    /// table = client.table("x,y\n1,2\n3,4")
    /// ```
    #[pyo3(signature = (input, limit=None, index=None, name=None, format=None, page_to_disk=None))]
    pub fn table(
        &self,
        py: Python<'_>,
        input: Py<PyAny>,
        limit: Option<u32>,
        index: Option<Py<PyString>>,
        name: Option<Py<PyString>>,
        format: Option<Py<PyString>>,
        page_to_disk: Option<bool>,
    ) -> PyResult<Table> {
        Ok(Table(
            self.0
                .table(input, limit, index, name, format, page_to_disk)
                .py_block_on(py)?,
        ))
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
    /// table =  client.open_table("table_one");
    /// ```
    pub fn open_table(&self, py: Python<'_>, name: String) -> PyResult<Table> {
        let client = self.0.clone();
        let table = client.open_table(name).py_block_on(py)?;
        Ok(Table(table))
    }

    /// Creates a new read-only [`Table`] by performing a JOIN on two
    /// source tables. The resulting table is reactive: when either source
    /// table is updated, the join is automatically recomputed.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// joined = client.join(orders_table, products_table, "Product ID", "left")
    /// ```
    #[pyo3(signature = (left, right, on, join_type=None, name=None, right_on=None))]
    #[allow(clippy::too_many_arguments, reason = "This is a Python API")]
    pub fn join(
        &self,
        py: Python<'_>,
        left: &Bound<'_, PyAny>,
        right: &Bound<'_, PyAny>,
        on: String,
        join_type: Option<String>,
        name: Option<String>,
        right_on: Option<String>,
    ) -> PyResult<Table> {
        let left_ref = py_to_table_ref(left)?;
        let right_ref = py_to_table_ref(right)?;
        let jt = parse_join_type(join_type.as_deref())?;
        let options = perspective_client::JoinOptions {
            join_type: Some(jt),
            name,
            right_on,
        };
        let table = self
            .0
            .client
            .join(left_ref, right_ref, &on, options)
            .py_block_on(py)
            .into_pyerr()?;
        Ok(Table(AsyncTable {
            table: Arc::new(table),
            client: self.0.clone(),
        }))
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
    /// tables = client.get_hosted_table_names();
    /// ```
    pub fn get_hosted_table_names(&self, py: Python<'_>) -> PyResult<Vec<String>> {
        self.0.get_hosted_table_names().py_block_on(py)
    }

    /// Register a callback which is invoked whenever [`Client::table`] (on this
    /// [`Client`]) or [`Table::delete`] (on a [`Table`] belinging to this
    /// [`Client`]) are called.
    pub fn on_hosted_tables_update(&self, py: Python<'_>, callback: Py<PyAny>) -> PyResult<u32> {
        self.0.on_hosted_tables_update(callback).py_block_on(py)
    }

    /// Remove a callback previously registered via
    /// [`Client::on_hosted_tables_update`].
    pub fn remove_hosted_tables_update(&self, py: Python<'_>, callback_id: u32) -> PyResult<()> {
        self.0
            .remove_hosted_tables_update(callback_id)
            .py_block_on(py)
    }

    /// Provides the [`SystemInfo`] struct, implementation-specific metadata
    /// about the [`perspective_server::Server`] runtime such as Memory and
    /// CPU usage.
    pub fn system_info(&self, py: Python<'_>) -> PyResult<Py<PyAny>> {
        self.0.system_info().py_block_on(py)
    }

    /// Terminates this [`Client`], cleaning up any [`View`] handles the
    /// [`Client`] has open as well as its callbacks.
    pub fn terminate(&self, py: Python<'_>) -> PyResult<()> {
        self.0.terminate(py)
    }
}

/// [`Table`] is Perspective's columnar data frame, analogous to a Pandas/Polars
/// `DataFrame` or Apache Arrow, supporting append & in-place updates, removal
/// by index, and update notifications.
///
/// A [`Table`] contains columns, each of which have a unique name, are strongly
/// and consistently typed, and contains rows of data conforming to the column's
/// type. Each column in a [`Table`] must have the same number of rows, though
/// not every row must contain data; null-values are used to indicate missing
/// values in the dataset. The schema of a [`Table`] is _immutable after
/// creation_, which means the column names and data types cannot be changed
/// after the [`Table`] has been created. Columns cannot be added or deleted
/// after creation either, but a [`View`] can be used to select an arbitrary set
/// of columns from the [`Table`].
#[pyclass(subclass, name = "Table", module = "perspective")]
pub struct Table(AsyncTable);

assert_table_api!(Table);

#[pymethods]
impl Table {
    #[new]
    fn new() -> PyResult<Self> {
        Err(PyTypeError::new_err(
            "Do not call Table's constructor directly, construct from a Client instance.",
        ))
    }

    /// Returns the name of the index column for the table.
    ///
    /// # Python Examples
    ///
    /// ```python
    /// table = perspective.table("x,y\n1,2\n3,4", index="x");
    /// index = client.get_index()
    /// ```
    pub fn get_index(&self) -> Option<String> {
        self.0.get_index()
    }

    /// Get a copy of the [`Client`] this [`Table`] came from.
    pub fn get_client(&self, py: Python<'_>) -> Client {
        Client(self.0.get_client().py_block_on(py))
    }

    /// Returns the user-specified row limit for this table.
    pub fn get_limit(&self) -> Option<u32> {
        self.0.get_limit()
    }

    /// Returns the user-specified name for this table, or the auto-generated
    /// name if a name was not specified when the table was created.
    pub fn get_name(&self) -> String {
        self.0.get_name()
    }

    /// Removes all the rows in the [`Table`], but preserves everything else
    /// including the schema, index, and any callbacks or registered
    /// [`View`] instances.
    ///
    /// Calling [`Table::clear`], like [`Table::update`] and [`Table::remove`],
    /// will trigger an update event to any registered listeners via
    /// [`View::on_update`].
    pub fn clear(&self, py: Python<'_>) -> PyResult<()> {
        self.0.clear().py_block_on(py)
    }

    /// Returns the column names of this [`Table`] in "natural" order (the
    /// ordering implied by the input format).
    ///  
    ///  # Python Examples
    ///
    /// ```python
    /// columns = table.columns()
    /// ```
    pub fn columns(&self, py: Python<'_>) -> PyResult<Vec<String>> {
        self.0.columns().py_block_on(py)
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
    /// table = client.table("x,y\n1,2\n3,4")
    ///
    /// # ...
    ///
    /// table.delete(lazy=True)
    /// ```
    #[pyo3(signature=(lazy=false))]
    pub fn delete(&self, py: Python<'_>, lazy: bool) -> PyResult<()> {
        self.0.delete(lazy).py_block_on(py)
    }

    /// Create a unique channel ID on this [`Table`], which allows
    /// `View::on_update` callback calls to be associated with the
    /// `Table::update` which caused them.
    pub fn make_port(&self, py: Python<'_>) -> PyResult<i32> {
        let table = self.0.clone();
        table.make_port().py_block_on(py)
    }

    /// Register a callback which is called exactly once, when this [`Table`] is
    /// deleted with the [`Table::delete`] method.
    ///
    /// [`Table::on_delete`] resolves when the subscription message is sent, not
    /// when the _delete_ event occurs.
    pub fn on_delete(&self, py: Python<'_>, callback: Py<PyAny>) -> PyResult<u32> {
        let table = self.0.clone();
        table.on_delete(callback).py_block_on(py)
    }

    #[pyo3(signature = (input, format=None))]
    pub fn remove(&self, py: Python<'_>, input: Py<PyAny>, format: Option<String>) -> PyResult<()> {
        let table = self.0.clone();
        table.remove(input, format).py_block_on(py)
    }

    /// Removes a listener with a given ID, as returned by a previous call to
    /// [`Table::on_delete`].
    pub fn remove_delete(&self, py: Python<'_>, callback_id: u32) -> PyResult<()> {
        let table = self.0.clone();
        table.remove_delete(callback_id).py_block_on(py)
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
    pub fn schema(&self, py: Python<'_>) -> PyResult<HashMap<String, String>> {
        let table = self.0.clone();
        table.schema().py_block_on(py)
    }

    /// Validates the given expressions.
    pub fn validate_expressions(
        &self,
        py: Python<'_>,
        expression: Py<PyAny>,
    ) -> PyResult<Py<PyAny>> {
        let table = self.0.clone();
        table.validate_expressions(expression).py_block_on(py)
    }

    /// Create a new [`View`] from this table with a specified
    /// [`ViewConfigUpdate`].
    ///
    /// See [`View`] struct.
    ///
    /// # Examples
    ///
    /// ```python
    /// view view = table.view(
    ///     columns=["Sales"],
    ///     aggregates={"Sales": "sum"},
    ///     group_by=["Region", "State"],
    /// )
    /// ```
    #[pyo3(signature = (**config))]
    pub fn view(&self, py: Python<'_>, config: Option<Py<PyDict>>) -> PyResult<View> {
        Ok(View(self.0.view(config).py_block_on(py)?))
    }

    /// Returns the number of rows in a [`Table`].
    pub fn size(&self, py: Python<'_>) -> PyResult<usize> {
        self.0.size().py_block_on(py)
    }

    /// Removes all the rows in the [`Table`], but preserves everything else
    /// including the schema, index, and any callbacks or registered
    /// [`View`] instances.
    ///
    /// Calling [`Table::clear`], like [`Table::update`] and [`Table::remove`],
    /// will trigger an update event to any registered listeners via
    /// [`View::on_update`].
    #[pyo3(signature = (input, format=None))]
    pub fn replace(
        &self,
        py: Python<'_>,
        input: Py<PyAny>,
        format: Option<String>,
    ) -> PyResult<()> {
        self.0.replace(input, format).py_block_on(py)
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
    /// - `options` - Options for this update step - see
    ///   [`perspective_client::UpdateOptions`].
    /// ```  
    #[pyo3(signature = (input, port_id=None, format=None))]
    pub fn update(
        &self,
        py: Python<'_>,
        input: Py<PyAny>,
        port_id: Option<u32>,
        format: Option<String>,
    ) -> PyResult<()> {
        self.0.update(input, port_id, format).py_block_on(py)
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
///
/// To construct a [`View`], call the [`Table::view`] factory method. A
/// [`Table`] can have as many [`View`]s associated with it as you need -
/// Perspective conserves memory by relying on a single [`Table`] to power
/// multiple [`View`]s concurrently.
#[pyclass(subclass, name = "View", module = "perspective")]
pub struct View(pub(crate) AsyncView);

assert_view_api!(View);

#[pymethods]
impl View {
    #[new]
    fn new() -> PyResult<Self> {
        Err(PyTypeError::new_err(
            "Do not call View's constructor directly, construct from a Table instance.",
        ))
    }

    /// Returns an array of strings containing the column paths of the [`View`]
    /// without any of the source columns.
    ///
    /// A column path shows the columns that a given cell belongs to after
    /// pivots are applied.
    #[pyo3(signature = (**window))]
    pub fn column_paths(
        &self,
        py: Python<'_>,
        window: Option<Py<PyDict>>,
    ) -> PyResult<Vec<String>> {
        self.0.column_paths(window).py_block_on(py)
    }

    /// Renders this [`View`] as a column-oriented JSON string. Useful if you
    /// want to save additional round trip serialize/deserialize cycles.  
    #[pyo3(signature = (**window))]
    pub fn to_columns_string(
        &self,
        py: Python<'_>,
        window: Option<Py<PyDict>>,
    ) -> PyResult<String> {
        self.0.to_columns_string(window).py_block_on(py)
    }

    /// Renders this `View` as a row-oriented JSON string.
    #[pyo3(signature = (**window))]
    pub fn to_json_string(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<String> {
        self.0.to_json_string(window).py_block_on(py)
    }

    /// Renders this [`View`] as an [NDJSON](https://github.com/ndjson/ndjson-spec)
    /// formatted `String`.
    #[pyo3(signature = (**window))]
    pub fn to_ndjson(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<String> {
        self.0.to_ndjson(window).py_block_on(py)
    }

    /// Renders this [`View`] as a row-oriented Python `list`.
    #[pyo3(signature = (**window))]
    pub fn to_records<'a>(
        &self,
        py: Python<'a>,
        window: Option<Py<PyDict>>,
    ) -> PyResult<Bound<'a, PyAny>> {
        let json = self.0.to_json_string(window).py_block_on(py)?;
        let json_module = PyModule::import(py, "json")?;
        json_module.call_method1("loads", (json,))
    }

    /// Renders this [`View`] as a row-oriented Python `list`.
    #[pyo3(signature = (**window))]
    pub fn to_json<'a>(
        &self,
        py: Python<'a>,
        window: Option<Py<PyDict>>,
    ) -> PyResult<Bound<'a, PyAny>> {
        self.to_records(py, window)
    }

    /// Renders this [`View`] as a column-oriented Python `dict`.
    #[pyo3(signature = (**window))]
    pub fn to_columns<'a>(
        &self,
        py: Python<'a>,
        window: Option<Py<PyDict>>,
    ) -> PyResult<Bound<'a, PyAny>> {
        let json = self.0.to_columns_string(window).py_block_on(py)?;
        let json_module = PyModule::import(py, "json")?;
        json_module.call_method1("loads", (json,))
    }

    /// Renders this [`View`] as a CSV `String` in a standard format.
    #[pyo3(signature = (**window))]
    pub fn to_csv(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<String> {
        self.0.to_csv(window).py_block_on(py)
    }

    /// Renders this [`View`] as a `pandas.DataFrame`.
    #[pyo3(signature = (**window))]
    // #[deprecated(since="3.2.0", note="Please use `View::to_pandas`")]
    pub fn to_dataframe(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        self.0.to_dataframe(window).py_block_on(py)
    }

    /// Renders this [`View`] as a `pandas.DataFrame`.
    #[pyo3(signature = (**window))]
    pub fn to_pandas(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        self.0.to_dataframe(window).py_block_on(py)
    }

    /// Renders this [`View`] as a `polars.DataFrame`.
    #[pyo3(signature = (**window))]
    pub fn to_polars(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<Py<PyAny>> {
        self.0.to_polars(window).py_block_on(py)
    }

    /// Renders this [`View`] as the Apache Arrow data format.
    ///
    /// # Arguments
    ///
    /// - `window` - a [`ViewWindow`]
    #[pyo3(signature = (**window))]
    pub fn to_arrow(&self, py: Python<'_>, window: Option<Py<PyDict>>) -> PyResult<Py<PyBytes>> {
        self.0.to_arrow(window).py_block_on(py)
    }

    /// Delete this [`View`] and clean up all resources associated with it.
    /// [`View`] objects do not stop consuming resources or processing
    /// updates when they are garbage collected - you must call this method
    /// to reclaim these.
    pub fn delete(&self, py: Python<'_>) -> PyResult<()> {
        self.0.delete().py_block_on(py)
    }

    pub fn expand(&self, py: Python<'_>, index: u32) -> PyResult<u32> {
        self.0.expand(index).py_block_on(py)
    }

    pub fn collapse(&self, py: Python<'_>, index: u32) -> PyResult<u32> {
        self.0.collapse(index).py_block_on(py)
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
    pub fn dimensions(&self, py: Python<'_>) -> PyResult<Py<PyAny>> {
        self.0.dimensions().py_block_on(py)
    }

    /// The expression schema of this [`View`], which contains only the
    /// expressions created on this [`View`]. See [`View::schema`] for
    /// details.
    pub fn expression_schema(&self, py: Python<'_>) -> PyResult<HashMap<String, String>> {
        self.0.expression_schema().py_block_on(py)
    }

    /// A copy of the [`ViewConfig`] object passed to the [`Table::view`] method
    /// which created this [`View`].
    pub fn get_config(&self, py: Python<'_>) -> PyResult<Py<PyAny>> {
        self.0.get_config().py_block_on(py)
    }

    /// Calculates the [min, max] of the leaf nodes of a column `column_name`.
    ///
    /// # Returns
    ///
    /// A tuple of [min, max], whose types are column and aggregate dependent.
    pub fn get_min_max(
        &self,
        py: Python<'_>,
        column_name: String,
    ) -> PyResult<(PyObject, PyObject)> {
        self.0.get_min_max(column_name).py_block_on(py)
    }

    /// The number of aggregated rows in this [`View`]. This is affected by the
    /// "group_by" configuration parameter supplied to this view's contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated rows.
    pub fn num_rows(&self, py: Python<'_>) -> PyResult<u32> {
        self.0.num_rows().py_block_on(py)
    }

    /// The number of aggregated columns in this [`View`]. This is affected by
    /// the "split_by" configuration parameter supplied to this view's
    /// contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated columns.
    pub fn num_columns(&self, py: Python<'_>) -> PyResult<u32> {
        self.0.num_columns().py_block_on(py)
    }

    /// The schema of this [`View`].
    ///
    /// The [`View`] schema differs from the `schema` returned by
    /// [`Table::schema`]; it may have different column names due to
    /// `expressions` or `columns` configs, or it maye have _different
    /// column types_ due to the application og `group_by` and `aggregates`
    /// config. You can think of [`Table::schema`] as the _input_ schema and
    /// [`View::schema`] as the _output_ schema of a Perspective pipeline.
    pub fn schema(&self, py: Python<'_>) -> PyResult<HashMap<String, String>> {
        self.0.schema().py_block_on(py)
    }

    /// Register a callback with this [`View`]. Whenever the [`View`] is
    /// deleted, this callback will be invoked.
    pub fn on_delete(&self, py: Python<'_>, callback: Py<PyAny>) -> PyResult<u32> {
        self.0.on_delete(callback).py_block_on(py)
    }

    /// Unregister a previously registered [`View::on_delete`] callback.
    pub fn remove_delete(&self, py: Python<'_>, callback_id: u32) -> PyResult<()> {
        self.0.remove_delete(callback_id).py_block_on(py)
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
    #[pyo3(signature = (callback, mode=None))]
    pub fn on_update(
        &self,
        py: Python<'_>,
        callback: Py<PyAny>,
        mode: Option<String>,
    ) -> PyResult<u32> {
        self.0.on_update(callback, mode).py_block_on(py)
    }

    /// Unregister a previously registered update callback with this [`View`].
    ///
    /// # Arguments
    ///
    /// - `id` - A callback `id` as returned by a recipricol call to
    ///   [`View::on_update`].
    ///
    /// # Examples
    ///
    /// ```rust
    /// let callback = |_| async { print!("Updated!") };
    /// let cid = view.on_update(callback, OnUpdateOptions::default()).await?;
    /// view.remove_update(cid).await?;
    /// ```
    pub fn remove_update(&self, py: Python<'_>, callback_id: u32) -> PyResult<()> {
        self.0.remove_update(callback_id).py_block_on(py)
    }
}
