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

Perspective's data model is flat, so Arrow `struct` and `list` columns are
normalized on ingest.

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
    leaving the row count unchanged.

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
