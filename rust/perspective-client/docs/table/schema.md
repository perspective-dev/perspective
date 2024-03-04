Returns a table's [`Schema`], a mapping of column names to column types.

The mapping of a [`Table`]'s column names to data types is referred to as a
[`Schema`]. Each column has a unique name and a data type, one of:

-   [`"boolean"`] - A boolean type
-   [`"date"`] - A timesonze-agnostic date type (month/day/year)
-   [`"datetime"`] - A millisecond-precision datetime type in the UTC timezone
-   [`"float"`] - A 64 bit float
-   [`"integer"`] - A signed 32 bit integer (the integer type supported by JavaScript)
-   [`"string"`] - A [`String`] data type (encoded internally as a _dictionary_)

Note that all [`Table`] columns are _nullable_, regardless of the data type.
