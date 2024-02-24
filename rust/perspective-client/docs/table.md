Creates a new `Table` instance from either a _schema_ or _data_. `Table` is
Perspective's columnar data frame, analogous to a Pandas `DataFrame` or Apache
Arrow. `Table` supports appending data, in-place updates, removal by index, and
notifications on update.

A `Table` contains columns, each of which have a unique name, are strongly and
consistently typed, and contains rows of data conforming to the column's type.
Each column in a `Table` must have the same number of rows, though not every row
must contain data; null-values are used to indicate missing values in the
dataset.

The columns of a `Table` are _immutable after creation_, which means their names
and data types cannot be changed after the `Table` has been created. Columns
cannot be added or deleted after creation, but a `View` can be used to select an
arbitrary set of columns from the `Table`.

The `table()` factory function can be initialized with either a _schema_, or
data in one of these formats:

-   Apache Arrow, as `bytes` (python) or `ArrayBuffer` (js)
-   CSV as a `string`
-   Row-oriented `list` (python) or `Array` (js)
-   Column-oriented `dict` (python) or `Object` (js)

When instantiated with _data_, the schema is inferred from this data. Future
calls to `table.update()` will _coerce_ to the inferred type this schema.
While this is convenient, inferrence is sometimes imperfect e.g. when
the input is empty, null or ambiguous. For these cases, `table()` can be
instantiated with a explicit schema.

When instantiated with a _schema_, the resulting `Table` is empty but with
known column names and column types. When subsqeuently populated with
`table.update()`, these columns will be _coerced_ to the schema's type. This
behavior can be useful when `table()`'s column type inferences doesn't work.

The resulting `Table` is _virtual_, and invoking its methods dispatches events
to the client from which it was instantiated (e.g. a Web Worker or WebSocket
client), where the data is stored and all calculation occurs.

# Arguments

-   `arg` - Either _schema_ or initialization _data_.
-   `options` - Optional configuration which provides one of:
    -   `limit` - The max number of rows the resulting `Table` can store.
    -   `index` - The column name to use as an _index_ column. If this `table()`
        is being instantiated by _data_, this column name must be present in the
        data.

# Examples

```js
const table = await client.table("x,y\n1,2\n3,4");
```

```python
table = await async_client.table("x,y\n1,2\n3,4");
```

```rust
let table = client.table("x,y\n1,2\n3,4").await;
```
