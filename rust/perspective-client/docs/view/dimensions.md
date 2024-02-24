Returns this [`View`]'s _dimensions_, row and column count, as well as those of
the [`crate::Table`] from which it was derived.

-   `num_table_rows` - The number of rows in the underlying [`crate::Table`].
-   `num_table_columns` - The number of columns in the underlying [`crate::Table`]
    (including the `index` column if this [`crate::Table`] was constructed with one).
-   `num_view_rows` - The number of rows in this [`View`]. If this [`View`] has a
    `group_by` clause, `num_view_rows` will also include aggregated rows.
-   `num_view_columns` - The number of columns in this [`View`]. If this [`View`]
    has a `split_by` clause, `num_view_columns` will include all _column paths_,
    e.g. the number of `columns` clause times the number of `split_by` groups.
