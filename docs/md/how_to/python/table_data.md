# DataFrame and Arrow Compatibility

`perspective-python` accepts a `Table` constructor argument from any of the
common Python columnar data libraries. In all three cases, `perspective.table`
(and `Table.update()`) consume the input directly — there is no need to
serialize to Apache Arrow IPC bytes yourself. However, note is
still the most efficient way to bulk load data into `Table`.

## PyArrow

```python
import pyarrow as pa
import perspective

arrow_table = pa.table({
    "int": pa.array([1, 2, 3], type=pa.int64()),
    "float": pa.array([1.5, 2.5, 3.5], type=pa.float64()),
    "string": pa.array(["a", "b", "c"], type=pa.string()),
})

table = perspective.table(arrow_table)
```

The same applies to `Table.update()`:

```python
table.update(arrow_table)
```

If you have Arrow data already in IPC format (e.g. read from disk, received
over the wire, or produced by another tool), pass the raw `bytes` directly —
both stream and file formats are auto-detected:

```python
with open("data.arrow", "rb") as f:
    table = perspective.table(f.read())
```

### Nested columns

Perspective's data model is flat, so Arrow `struct`, `map` and `list` columns
are normalized on ingest.

A `struct` column is hoisted into one dotted column per leaf, recursively. A
null parent nulls every descendant leaf:

```python
arrow_table = pa.table({
    "id": pa.array([1, 2], type=pa.int64()),
    "s": pa.array([{"a": 10}, {"a": 20}], type=pa.struct([("a", pa.int64())])),
})

# Schema is `{"id": "integer", "s.a": "integer"}`
table = perspective.table(arrow_table)
```

Because the flattened names are ordinary columns, a `Table` created from an
explicit schema accepts nested updates with no further configuration:

```python
table = perspective.table({"id": "integer", "s.a": "integer"})
table.update(arrow_table)
```

A `list` column is controlled by the `list_flatten` argument:

-   `"zip"` (default) expands a row into one row per list element, repeating
    its non-list siblings. An empty or null list yields a single row with a
    null in that column, rather than dropping the row. When a row has more than
    one list column, their non-empty lengths must match.
-   `"cartesian"` expands a row into the product of its list columns' lengths,
    with an empty or null list counting as a single null element.
-   `"stringify"` encodes each list as a JSON array in a single string column,
    leaving the row count unchanged. Datetimes and dates inside the text are
    epoch milliseconds, as in `to_json`; decimals are strings and binary is
    base64.
-   `"stringify_formatted"` is `"stringify"` with datetimes and dates written
    as the text `to_json` emits under `formatted`.

```python
arrow_table = pa.table({
    "x": pa.array([1, 2], type=pa.int64()),
    "y": pa.array([[10, 20], [30]], type=pa.list_(pa.int64())),
})

# `{"x": [1, 1, 2], "y": [10, 20, 30]}`
perspective.table(arrow_table)

# `{"x": [1, 2], "y": ["[10,20]", "[30]"]}`
perspective.table(arrow_table, list_flatten="stringify")
```

A `map` column is pivoted into one column per distinct key, `m.<key>`, of the
map's item type, so an Arrow map and a JSON object produce the same columns. A
key absent from a row yields a null in that row. A key absent from the whole
batch yields no column, which on an indexed update leaves that cell unchanged,
so declare the keys in a schema when updates must be stable. Only string keys
are supported, and pivoting suits maps with a bounded key set since each key
becomes a column:

```python
arrow_table = pa.table({
    "id": pa.array([1, 2], type=pa.int64()),
    "m": pa.array(
        [[("a", 1), ("b", 2)], [("b", 3)]],
        type=pa.map_(pa.string(), pa.int64()),
    ),
})

# `{"id": [1, 2], "m.a": [1, None], "m.b": [2, 3]}`
perspective.table(arrow_table)
```

A `struct` column is controlled by the `struct_flatten` argument and a `map`
column by the `map_flatten` argument, each taking:

-   `"pivot"` (default) hoists each field or key into its own dotted column,
    as above.
-   `"stringify"` keeps the whole value as JSON text in a single string
    column, with datetimes and dates as epoch milliseconds, as in `to_json`.
-   `"stringify_formatted"` is `"stringify"` with datetimes and dates written
    as the text `to_json` emits under `formatted`.

An unset `map_flatten` follows `struct_flatten`, so `struct_flatten="stringify"`
alone stringifies both. JSON objects always follow `struct_flatten`.

The arguments compose from the outside in. A list inside a stringified struct
is an array within its JSON text and is never expanded, while a struct inside
an expanded list is stringified once per element row:

```python
arrow_table = pa.table({
    "s": pa.array(
        [{"a": 1, "tags": ["x", "y"]}],
        type=pa.struct([("a", pa.int64()), ("tags", pa.list_(pa.string()))]),
    ),
})

# `{"s": ['{"a":1,"tags":["x","y"]}']}`
perspective.table(arrow_table, struct_flatten="stringify")
```

Setting the two independently keeps a map with an open key set as text while
its sibling structs still pivot, or stringifies each struct under a pivoted
map:

```python
arrow_table = pa.table({
    "s": pa.array([{"a": 1}], type=pa.struct([("a", pa.int64())])),
    "m": pa.array([[("k", 1)]], type=pa.map_(pa.string(), pa.int64())),
})

# `{"s.a": [1], "m": ['{"k":1}']}`
perspective.table(arrow_table, map_flatten="stringify")

# `{"s": ['{"a":1}'], "m.k": [1]}`
perspective.table(arrow_table, struct_flatten="stringify", map_flatten="pivot")
```

## Polars

```python
import polars as pl
import perspective

df = pl.DataFrame({
    "a": [1, 2, 3, 4, 5],
    "b": ["x", "y", "z", "x", "y"],
})

table = perspective.table(df)
```

Internally, the `DataFrame` is converted to a `pyarrow.Table` before
ingestion, so Polars columns inherit the Arrow type mapping above.

See also Perspective [Virtual Server support for `polars.DataFrame`](./virtual_server/polars.md)

## Pandas

`pandas.DataFrame` is supported via `pyarrow.Table.from_pandas`, which
dictates behavior including type support — see the
[pyarrow pandas docs](https://arrow.apache.org/docs/python/pandas.html) for
details on which pandas dtypes round-trip cleanly.

```python
from datetime import date, datetime
import numpy as np
import pandas as pd
import perspective

data = pd.DataFrame({
    "int": np.arange(100),
    "float": [i * 1.5 for i in range(100)],
    "bool": [True for i in range(100)],
    "date": [date.today() for i in range(100)],
    "datetime": [datetime.now() for i in range(100)],
    "string": [str(i) for i in range(100)],
})

table = perspective.table(data, index="float")
```
