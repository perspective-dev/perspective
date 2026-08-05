# Selection and Ordering

## Columns

The `columns` property specifies which columns should be included in the
`View`'s output. This allows users to show or hide a specific subset of columns,
as well as control the order in which columns appear to the user. This is
represented in Perspective as an array of string column names:

<div class="javascript">

```javascript
const view = await table.view({
    columns: ["a"],
});
```

</div>
<div class="python">

```python
view = table.view(columns=["a"])
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    columns: Some(vec![Some("a".into())]),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

## Sort

The `sort` property specifies columns on which the query should be sorted,
analogous to `ORDER BY` in SQL. A column can be sorted regardless of its data
type, and sorts can be applied in ascending or descending order. Perspective
represents `sort` as an array of arrays, with the values of each inner array
being a string column name and a string sort direction. When `split_by` are
applied, the additional sort directions `"col asc"` and `"col desc"` will
determine the order of pivot column groups.

<div class="javascript">

```javascript
const view = await table.view({
    sort: [["a", "asc"]],
});
```

</div>
<div class="python">

```python
view = table.view(sort=[["a", "asc"]])
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    sort: Some(vec![Sort("a".into(), SortDir::Asc)]),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

The available sort directions are:

| Direction | Description |
|---|---|
| `"asc"` | Ascending order |
| `"desc"` | Descending order |
| `"asc abs"` | Ascending by absolute value |
| `"desc abs"` | Descending by absolute value |
| `"col asc"` | Ascending order for pivot column groups (requires `split_by`) |
| `"col desc"` | Descending order for pivot column groups (requires `split_by`) |
| `"col asc abs"` | Ascending by absolute value for pivot column groups |
| `"col desc abs"` | Descending by absolute value for pivot column groups |

## Filter

The `filter` property specifies columns on which the query can be filtered,
returning rows that pass the specified filter condition. This is analogous to
the `WHERE` clause in SQL. There is no limit on the number of columns where
`filter` is applied, but the resulting dataset is one that passes all the filter
conditions, i.e. the filters are joined with an `AND` condition. The join
condition can be changed to `OR` via the `filter_op` property.

Perspective represents `filter` as an array of arrays, with the values of each
inner array being a string column name, a string filter operator, and a filter
operand in the type of the column:

<div class="javascript">

```javascript
const view = await table.view({
    filter: [["a", "<", 100]],
});
```

</div>
<div class="python">

```python
view = table.view(filter=[["a", "<", 100]])
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    filter: Some(vec![Filter::new("a", "<", FilterTerm::Scalar(Scalar::Float(100.0)))]),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

The available filter operators depend on the column type:

**String columns**: `==`, `!=`, `>`, `>=`, `<`, `<=`, `begins with`,
`not begins with`, `contains`, `not contains`, `ends with`, `not ends with`,
`matches`, `not matches`, `in`, `not in`, `is not null`, `is null`.

The string matching operators (`begins with`, `contains`, `ends with` and
their negations) are case-insensitive, and `matches` / `not matches` are
case-sensitive partial-match [RE2](https://github.com/google/re2) regular
expressions. Null cells match none of these operators, including the negated
forms - filter on `is null` to select them.

**Numeric columns** (`integer`, `float`): `==`, `!=`, `>`, `>=`, `<`, `<=`,
`is not null`, `is null`.

**Boolean columns**: `==`, `is not null`, `is null`.

**Date/Datetime columns**: `==`, `!=`, `>`, `>=`, `<`, `<=`, `is not null`,
`is null`.
