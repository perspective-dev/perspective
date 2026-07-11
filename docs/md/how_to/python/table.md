# Loading data into a Table

A `Table` can be created from a dataset or a schema, the specifics of which are
[discussed](#loading-data-with-table) in the JavaScript section of the user's
guide. In Python, however, Perspective supports additional data types that are
commonly used when processing data:

- `pandas.DataFrame`
- `polars.DataFrame`
- `bytes` (encoding an Apache Arrow)
- `objects` (either extracting a repr or via reference)
- `str` (encoding as a CSV)

A `Table` is created in a similar fashion to its JavaScript equivalent:

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
    "string": [str(i) for i in range(100)]
})

table = perspective.table(data, index="float")
```

Likewise, a `View` can be created via the `view()` method:

```python
view = table.view(group_by=["float"], filter=[["bool", "==", True]])
column_data = view.to_columns()
row_data = view.to_json()
```

## Polars Support

Polars `DataFrame` types work similarly to Apache Arrow input, which Perspective
uses to interface with Polars.

```python
df = polars.DataFrame({"a": [1,2,3,4,5]})
table = perspective.table(df)
```

## Pandas Support

Perspective's `Table` can be constructed from `pandas.DataFrame` objects.
Internally, this just uses
[`pyarrow::from_pandas`](https://arrow.apache.org/docs/python/pandas.html),
which dictates behavior of this feature including type support.

If the dataframe does not have an index set, an integer-typed column named
`"index"` is created. If you want to preserve the indexing behavior of the
dataframe passed into Perspective, simply create the `Table` with
`index="index"` as a keyword argument. This tells Perspective to once again
treat the index as a primary key:

```python
data.set_index("datetime")
table = perspective.table(data, index="index")
```

## Time Zone Handling

When parsing `"datetime"` strings, times without an explicit timezone offset are
interpreted as _UTC_. Strings with a timezone offset (e.g., `+05:00`) are
converted to UTC. All `"datetime"` values are stored internally as milliseconds
since the Unix epoch, and are _output_ as integer timestamps (milliseconds since
epoch) from methods like `to_columns()` and `to_json()`.

Python `datetime` objects are serialized to strings before parsing. Naive
`datetime` objects (without `tzinfo`) produce strings without timezone
information and are therefore treated as UTC. Timezone-aware `datetime` objects
include their offset in the serialized string, which is used to convert to UTC.

`"date"` values are timezone-agnostic calendar days with no time component.
They are _output_ as integer timestamps at _UTC midnight_ of the calendar day
(equivalent to Arrow `date32` day arithmetic), and integer timestamp _input_ to
a `"date"` column is likewise interpreted as UTC. The host process timezone
never affects `"date"` values — a `Viewer` renders them in UTC, recovering the
stored calendar day exactly. Datetime expression functions such as
`bucket("x", 'D')`, `day_of_week("x")` and `hour_of_day("x")` also compute in
UTC.
