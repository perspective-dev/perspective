# Expressions

The `expressions` property specifies _new_ columns in Perspective that are
created using existing column values or arbitrary scalar values defined within
the expression. In `<perspective-viewer>`, expressions are added using the "New
Column" button in the side panel.

Expressions are strings parsed by Perspective's expression engine (based on
[ExprTK](https://github.com/ArashPartow/exprtk)). Column names are referenced by
wrapping them in double quotes, e.g. `"Sales"`:

<div class="javascript">

```javascript
const view = await table.view({
    expressions: {
        "Profit Ratio": '"Profit" / "Sales"',
    },
});
```

</div>
<div class="python">

```python
view = table.view(expressions={'Profit Ratio': '"Profit" / "Sales"'})
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    expressions: Some(Expressions([
        ("Profit Ratio", "\"Profit\" / \"Sales\"".into())
    ].into_iter().collect())),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

## Type Conversion and Coercion

Perspective expressions are typed: every column, literal and function result has
a fixed type, and the validator reports an error before the expression is ever
computed if the types do not fit the operator. To move between types explicitly,
use the conversion functions:

| Function        | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `to_string(x)`  | Convert any type to string                                   |
| `to_integer(x)` | Convert to integer (null if not parsable)                    |
| `to_float(x)`   | Convert to float (null if not parsable)                      |
| `to_boolean(x)` | Convert to boolean (truthy/falsy)                            |
| `integer(x)`    | Alias for `to_integer(x)`                                    |
| `float(x)`      | Alias for `to_float(x)`                                      |
| `datetime(x)`   | Construct a datetime from a POSIX timestamp (ms since epoch) |
| `date(y, m, d)` | Construct a date from year, month, day                       |

### How coercion works

Numeric types promote to each other. Arithmetic on any mix of `integer` and
`float` operands is computed in floating point and produces a `float`. The
comparison operators compare values across every numeric type: integers are
compared exactly (including signed against unsigned), and as soon as one side is
a `float` both sides are compared as doubles. Numeric literals are `float`, so
`"Quantity" > 3` works on an `integer` column without a cast.

No other implicit coercion exists. `boolean`, `string`, `date` and `datetime`
values can only be compared with values of the same type; comparing a `string`
column to a number, a `boolean` to `1`, or a `date` to a `datetime` is a
validation error that names the operator and both types, for example
`Type Error - cannot compare string and float with '=='`. Similarly, `datetime`
and `date` values are not numeric: to perform arithmetic on them, you must first
convert to a numeric representation, do the math, then convert back.

Boolean contexts cast instead. The condition of `if` and `? :`, and the operands
of `and`, `or`, `not`, `xor`, `nand`, `nor` and `xnor`, accept any type: `null`
is `false`, a `boolean` is its own value, a number is `true` when non-zero, and
a `string` is `true` when non-null. `x == null` and `x != null` test `x` for
null and return `boolean`, the same as `is_null(x)` and `is_not_null(x)`; the
`null` literal is otherwise a value like any null cell: `"x" > 2 ? null : "x"`
yields null in the first case, and `"x" + null` or `"x" < null` are null, exactly
as they would be for a column with a null value.

Internally, `datetime` values are stored as milliseconds since the Unix epoch
(1970-01-01T00:00:00Z). Converting a `datetime` to a `float` yields this
millisecond timestamp, and `datetime()` accepts a millisecond timestamp to
produce a `datetime`.

### Example: offsetting a datetime by 7 days

This expression takes a `"Shipped Date"` column, converts it to its
millisecond-epoch representation, adds 7 days worth of milliseconds (7 &times;
24 &times; 60 &times; 60 &times; 1000 = 604800000), and converts the result back
to a `datetime`:

```
// Due Date
datetime(float("Shipped Date") + 604800000)
```

## Operators

Standard arithmetic and comparison operators are supported:

| Operator                         | Description |
| -------------------------------- | ----------- |
| `+`, `-`, `*`, `/`               | Arithmetic  |
| `%`                              | Modulo      |
| `==`, `!=`, `<`, `>`, `<=`, `>=` | Comparison  |
| `and`, `or`, `not`               | Logical     |
| `if ... else ...`                | Conditional |

## Numeric Functions

ExprTK provides a rich set of built-in numeric functions including `abs`,
`ceil`, `floor`, `round`, `exp`, `log`, `log10`, `sqrt`, `min`, `max`, `pow`,
`clamp`, `iclamp`, `inrange`, and trigonometric functions (`sin`, `cos`, `tan`,
`asin`, `acos`, `atan`).

## String Functions

| Function                        | Description                                             |
| ------------------------------- | ------------------------------------------------------- |
| `concat(a, b, ...)`             | Concatenate strings                                     |
| `upper(s)`                      | Convert to uppercase                                    |
| `lower(s)`                      | Convert to lowercase                                    |
| `length(s)`                     | String length                                           |
| `contains(s, substr)`           | Whether `s` contains `substr`                           |
| `order(col, 'B', 'C', 'A')`     | Custom sort order for a string column                   |
| `match(s, pattern)`             | Regex partial match (returns boolean)                   |
| `match_all(s, pattern)`         | Regex full match (returns boolean)                      |
| `search(s, pattern)`            | First capturing group match                             |
| `indexof(s, pattern)`           | Start index of first regex match                        |
| `substring(s, start, end)`      | Substring from `start` (inclusive) to `end` (exclusive) |
| `replace(s, repl, pattern)`     | Replace first regex match                               |
| `replace_all(s, repl, pattern)` | Replace all regex matches                               |

## Date/Datetime Functions

| Function                 | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `today()`                | Current date                                                             |
| `now()`                  | Current datetime                                                         |
| `date(year, month, day)` | Construct a date                                                         |
| `datetime(timestamp_ms)` | Construct a datetime from a POSIX timestamp (ms since epoch)             |
| `hour_of_day(dt)`        | Hour component (0-23)                                                    |
| `day_of_week(dt)`        | Day of the week as a string                                              |
| `month_of_year(dt)`      | Month of the year as a string                                            |
| `bucket(dt, unit)`       | Bucket datetime by unit: `'s'`, `'m'`, `'h'`, `'D'`, `'W'`, `'M'`, `'Y'` |

`bucket` also works on numeric columns: `bucket("Price", 10)` rounds values down
to the nearest multiple of 10.

## Other Functions

| Function                  | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `is_null(x)`              | Whether the value is null                             |
| `is_not_null(x)`          | Whether the value is not null                         |
| `percent_of(a, b)`        | `a` as a percentage of `b`                            |
| `inrange(low, val, high)` | Whether `val` is between `low` and `high` (inclusive) |
| `min(a, b, ...)`          | Minimum of inputs                                     |
| `max(a, b, ...)`          | Maximum of inputs                                     |
| `random()`                | Random float between 0.0 and 1.0                      |
| `col(name)`               | Look up a column by string name at runtime            |
| `vlookup(col, key)`       | Look up a value in another column by row key          |

## See also

Expressions are row-local — each output cell is computed from that row's
values alone. For calculations which span rows, such as moving averages,
cumulative sums or period-over-period differences, see
[Window Columns](./windows.md).
