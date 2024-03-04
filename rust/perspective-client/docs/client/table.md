Creates a new [`Table`] from either a _schema_ or _data_. The [`table()`] factory
function can be initialized with either a _schema_, or data in one of these
formats:

-   Apache Arrow, as [`pyo3::bytes`] (python) or [`js_sys::ArrayBuffer`] (js)
-   CSV as a [`String`]
-   Row-oriented [`pyo3::list`] (python) or [`js_sys::Array`] (js)
-   Column-oriented [`pyo3::dict`] (python) or [`js_sys::Object`] (js)

When instantiated with _data_, the schema is inferred from this data. Future
calls to [`Table::update`] will _coerce_ to the inferred type this schema.
While this is convenient, inferrence is sometimes imperfect e.g. when
the input is empty, null or ambiguous. For these cases, [`Client::table`] can be
instantiated with a explicit schema.

When instantiated with a _schema_, the resulting [`Table`] is empty but with
known column names and column types. When subsqeuently populated with
[`Table::update`], these columns will be _coerced_ to the schema's type. This
behavior can be useful when [`Client::table`]'s column type inferences doesn't work.

The resulting [`Table`] is _virtual_, and invoking its methods dispatches events
to the client from which it was instantiated (e.g. a Web Worker or WebSocket
client), where the data is stored and all calculation occurs.

# Arguments

-   [`arg`] - Either _schema_ or initialization _data_.
-   [`options`] - Optional configuration which provides one of:
    -   [`limit`] - The max number of rows the resulting [`Table`] can store.
    -   [`index`] - The column name to use as an _index_ column. If this [`table()`]
        is being instantiated by _data_, this column name must be present in the
        data.

# Examples

[```]js
const table = await client.table("x,y\n1,2\n3,4");
[```]

[```]python
table = await async_client.table("x,y\n1,2\n3,4");
[```]

[```]rust
let table = client.table("x,y\n1,2\n3,4").await;
[```]
