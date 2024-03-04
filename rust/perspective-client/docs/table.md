[`Table`] is Perspective's columnar data frame, analogous to a Pandas `DataFrame`
or Apache Arrow. [`Table`] supports appending data, in-place updates, removal
by index, and notifications on update.

A [`Table`] contains columns, each of which have a unique name, are strongly and
consistently typed, and contains rows of data conforming to the column's type.
Each column in a [`Table`] must have the same number of rows, though not every row
must contain data; null-values are used to indicate missing values in the
dataset.

The columns of a [`Table`] are _immutable after creation_, which means their names
and data types cannot be changed after the [`Table`] has been created. Columns
cannot be added or deleted after creation, but a [`View`] can be used to select an
arbitrary set of columns from the [`Table`].
