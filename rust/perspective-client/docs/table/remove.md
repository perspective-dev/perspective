Removes rows from this [`Table`] with the `index` column values supplied. If
the [`Table`] doesn't have an `index` column, this operation is inert

-   TODO This operations should be an error, not inert, when lacking an `index`.

Removes propagate to any [`View::on_update`] callbacks for [`View`]s derived
from this [`Table`].

# Arguments

-   [`indices`] A list of `index` column values for rows that should be removed.

# Examples

```python
tbl = Table({"a": [1, 2, 3]}, index="a")
tbl.remove([2, 3])
```
