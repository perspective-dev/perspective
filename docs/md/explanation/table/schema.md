# Schema and column types

The mapping of a `Table`'s column names to data types is referred to as a
`schema`. Each column has a unique name and a single data type, one of

-   `float`
-   `integer`
-   `boolean`
-   `date`
-   `datetime`
-   `string`

A `Table` schema is fixed at construction, either by explicitly passing a schema
dictionary to the `Client::table` method, or by passing _data_ to this method
from which the schema is _inferred_ (if CSV or JSON format) or inherited (if
Arrow).

## Arrow type mapping

Perspective's six column types are narrower than Arrow's type system, so Arrow
input is mapped on ingest:

| Arrow type | Perspective type |
| --- | --- |
| `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64` | `integer` |
| `float`, `double` | `float` |
| `decimal`, `decimal128` | `float` |
| `bool` | `boolean` |
| `date32`, `date64` | `date` |
| `timestamp` | `datetime` |
| `time32`, `time64` | `integer` |
| `utf8`, `large_utf8`, `binary`, `dictionary`, `list`, `null` | `string` |

Two mappings are worth calling out:

- Arrow `decimal` columns become `float` — a `DECIMAL` value of `3.14` reads
  as `3.14`, not as its unscaled integer representation.
- Arrow `time32`/`time64` (a time-of-day with no date component) becomes
  `integer`, not `datetime`. Use a `timestamp` column for a true `datetime`.

Arrow types not listed above — including `decimal256` and the nested types —
are rejected with an error rather than silently coerced.

Arrow input is fully validated before its buffers are read. A malformed IPC
payload — bad offsets, out-of-range dictionary indices, inconsistent chunk
lengths — is rejected with an error rather than producing corrupt data.

## Type inference

When passing CSV or JSON data to the `Client::table` constructor, the type of
each column is inferred automatically. In some cases, the inference algorithm
may not return exactly what you'd like. For example, a column may be interpreted
as a `datetime` when you intended it to be a `string`, or a column may have no
values at all (yet), as it will be updated with values from a real-time data
source later on. In these cases, create a `table()` with a _schema_.

Once the `Table` has been created, further `Table::update` calls will perform
limited type _coercion_ based on the schema. While _coercion_ works similarly to
_inference_, in that input data may be parsed based on the expected column type,
`Table::update` will not _change_ the column's type further. For example, a
number literal `1234` would be _inferred_ as an `"integer"`, but _in the context
of an `Table::update` call on a known `"string"` column_, this will be parsed as
the _string_ `"1234"`.

## `date` and `datetime` inference

Various string representations of `date` and `datetime` format columns can be
_inferred_ as well _coerced_ from strings if they match one of Perspective's
internal known datetime parsing formats, for example
[ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) (which is also the format
Perspective will _output_ these types for CSV).
