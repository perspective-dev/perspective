// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

//! Perspective supports _expression columns_, which are virtual columns
//! calculated as part of the [`crate::View`], optionally using values from its
//! underlying [`crate::Table`]'s columns. Such expression columns are defined
//! in Perspective's expression language, an extended version of
//! [ExprTK](https://github.com/ArashPartow/exprtk), which is itself quite similar
//! (in design and features) to expressions in Excel.
//!
//! ## UI
//!
//! Expression columns can be created in `<perspective-viewer>` by clicking the
//! "New Column" button at the bottom of the column list, or via the API by
//! adding the expression to the `expressions` config key when calling
//! `viewer.restore()`.
//!
//! By default, such expression columns are not "used", and will appear above
//! the `Table`'s other deselected columns in the column list, with an
//! additional set of buttons for:
//!
//! - _Editing_ the column's expression. Doing so will update the definitions of
//!   _all_ usage of the expression column.
//! - _Deleting_ the column. Clicking `Reset` (or calling the `reset()` method)
//!   will not delete expressions unless the `Shift` key is held (or `true`
//!   parameter supplied, respectively). This button only appears if the
//!   expression column i unused.
//!
//! To use the column, just drag/select the column as you would a normal column,
//! e.g. as a "Filter", "Group By", etc. Expression columns will recalculate
//! whenever their dependent columns update.
//!
//! ## Perspective Extensions to ExprTK
//!
//! ExprTK has its own
//! [excellent documentation](http://www.partow.net/programming/exprtk/) which
//! covers the core langauge in depth, which is an excellent place to start in
//! learning the basics. In addition to these features, Perspective adds a few
//! of its own custom extensions and syntax.
//!
//! #### Static Typing
//!
//! In addition to `float` values which ExprTK supports natively, Perspective's
//! expression language also supports Perspective's other types `date`,
//! `datetime`, `integer`, `boolean`; as well as rudimentary type-checking,
//! which will report an <span>error</span> when the values/columns supplied as
//! arguments cannot be resolved to the expected type, e.g. `length(x)` expects
//! an argument `x` of type `string` and is not a valid expression for an `x` of
//! another type. Perspective supplies a set of _cast_ functions for converting
//! between types where possible e.g. `string(x)` to cast a variable `x` to a
//! `string`.
//!
//! #### Expression Column Name
//!
//! Expressions are named by their key in the `ViewConfig::expressions`
//! `HashMap`. This name will be used in the `<perspective-viewer>` UI when
//! referring to the column, but will also be used in the API when specifying
//! e.g. `group_by` or `sort` fields. When creating a new column via
//! `<oerspective-viewer>`'s expression editor, new columns will get a default
//! name (which you may delete or change):
//!
//! ```html
//! // New Column 1
//! ```
//!
//! Without such a comment, an expression will show up in the
//! `<perspective-viewer>` API and UI as itself (clipped to a reasonable length
//! for the latter).
//!
//! #### Referencing [`crate::Table`] Columns
//!
//! Columns from the [`crate::Table`] can be referenced in an expression with
//! _double quotes_.
//!
//! ```text
//! // Expected Sales ("Sales" * 10) + "Profit"
//! ```
//!
//! #### String Literals
//!
//! In contrast to standard ExprTK, string literals are declared with _single
//! quotes_:
//!
//! ```text
//! // Profitable
//! if ("Profit" > 0) {
//!   'Stonks'
//! } else {
//!   'Not Stonks'
//! }
//! ```
//!
//! #### Extended Library
//!
//! Perspective adds many of its own functions in addition to `ExprTK`'s
//! standard ones, including common functions for `datetime` and `string` types
//! such as `substring()`, `bucket()`, `day_of_week()`, etc. A full list of
//! available functions is available in the
//! [Expression Columns API](../obj/perspective-viewer-exprtk).
//!
//! ## Examples
//!
//! #### Casting
//!
//! Just `2`, as an `integer` (numeric literals currently default to `float`
//! unless cast).
//!
//! ```text
//! integer(2)
//! ```
//!
//! #### Variables
//!
//! ```text
//! // My Column Name
//! var incrementedBy200 := "Sales" + 200;
//! var half := incrementedBy200 / 2;
//! half
//! ```
//!
//! ```text
//! // Complex Expression
//! var upperCustomer := upper("Customer Name");
//! var separator := concat(upperCustomer, ' | ');
//! var profitRatio := floor(percent_of("Profit", "Sales")); // Remove trailing decimal.
//! var combined := concat(separator, string(profitRatio));
//! var percentDisplay := concat(combined, '%');
//! percentDisplay
//! ```
//!
//! #### Conditionals
//!
//! ```text
//! // Conditional
//! var priceAdjustmentDate := date(2016, 6, 18);
//! var finalPrice := "Sales" - "Discount";
//! var additionalModifier := 0;
//!
//! if("Order Date" > priceAdjustmentDate) {
//!   finalPrice -= 5;
//!   additionalModifier -= 2;
//! }
//! else
//!   finalPrice += 5;
//!
//! finalPrice + additionalModifier
//! ```

#![cfg_attr(not(feature = "omit_metadata"), doc = include_str!("../../../docs/expression_gen.md"))]

use std::borrow::Cow;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Deserialize, Serialize, Clone, PartialEq, Debug, Default, TS)]
pub struct Expressions(pub HashMap<String, String>);

impl std::ops::Deref for Expressions {
    type Target = HashMap<String, String>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for Expressions {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[derive(Clone, Debug, PartialEq, TS)]
pub struct Expression<'a> {
    pub name: Cow<'a, str>,
    pub expression: Cow<'a, str>,
}

impl<'a> Expression<'a> {
    /// If name is None, the expression is used as the name.
    pub fn new(name: Option<Cow<'a, str>>, expression: Cow<'a, str>) -> Self {
        Self {
            name: name.unwrap_or_else(|| expression.clone()),
            expression,
        }
    }
}

impl<'a> FromIterator<Expression<'a>> for Expressions {
    fn from_iter<T: IntoIterator<Item = Expression<'a>>>(iter: T) -> Self {
        Self(
            iter.into_iter()
                .map(|x| (x.name.as_ref().to_owned(), x.expression.as_ref().to_owned()))
                .collect(),
        )
    }
}

impl Expressions {
    pub fn insert(&mut self, expr: &Expression) {
        self.0.insert(
            expr.name.as_ref().to_owned(),
            expr.expression.as_ref().to_owned(),
        );
    }
}

#[doc(hidden)]
#[derive(Serialize, Clone, Copy, PartialEq)]
pub struct CompletionItemSuggestion {
    pub label: &'static str,
    pub insert_text: &'static str,
    pub documentation: &'static str,
}

#[doc(hidden)]
pub static COMPLETIONS: [CompletionItemSuggestion; 79] = [
    CompletionItemSuggestion {
        label: "var",
        insert_text: "var ${1:x := 1}",
        documentation: "Declare a new local variable",
    },
    CompletionItemSuggestion {
        label: "abs",
        insert_text: "abs(${1:x})",
        documentation: "Absolute value of x",
    },
    CompletionItemSuggestion {
        label: "avg",
        insert_text: "avg(${1:x})",
        documentation: "Average of all inputs",
    },
    CompletionItemSuggestion {
        label: "bucket",
        insert_text: "bucket(${1:x}, ${2:y})",
        documentation: "Bucket x by y",
    },
    CompletionItemSuggestion {
        label: "ceil",
        insert_text: "ceil(${1:x})",
        documentation: "Smallest integer >= x",
    },
    CompletionItemSuggestion {
        label: "exp",
        insert_text: "exp(${1:x})",
        documentation: "Natural exponent of x (e ^ x)",
    },
    CompletionItemSuggestion {
        label: "floor",
        insert_text: "floor(${1:x})",
        documentation: "Largest integer <= x",
    },
    CompletionItemSuggestion {
        label: "frac",
        insert_text: "frac(${1:x})",
        documentation: "Fractional portion (after the decimal) of x",
    },
    CompletionItemSuggestion {
        label: "iclamp",
        insert_text: "iclamp(${1:x})",
        documentation: "Inverse clamp x within a range",
    },
    CompletionItemSuggestion {
        label: "inrange",
        insert_text: "inrange(${1:x})",
        documentation: "Returns whether x is within a range",
    },
    CompletionItemSuggestion {
        label: "log",
        insert_text: "log(${1:x})",
        documentation: "Natural log of x",
    },
    CompletionItemSuggestion {
        label: "log10",
        insert_text: "log10(${1:x})",
        documentation: "Base 10 log of x",
    },
    CompletionItemSuggestion {
        label: "log1p",
        insert_text: "log1p(${1:x})",
        documentation: "Natural log of 1 + x where x is very small",
    },
    CompletionItemSuggestion {
        label: "log2",
        insert_text: "log2(${1:x})",
        documentation: "Base 2 log of x",
    },
    CompletionItemSuggestion {
        label: "logn",
        insert_text: "logn(${1:x}, ${2:N})",
        documentation: "Base N log of x where N >= 0",
    },
    CompletionItemSuggestion {
        label: "max",
        insert_text: "max(${1:x})",
        documentation: "Maximum value of all inputs",
    },
    CompletionItemSuggestion {
        label: "min",
        insert_text: "min(${1:x})",
        documentation: "Minimum value of all inputs",
    },
    CompletionItemSuggestion {
        label: "mul",
        insert_text: "mul(${1:x})",
        documentation: "Product of all inputs",
    },
    CompletionItemSuggestion {
        label: "percent_of",
        insert_text: "percent_of(${1:x})",
        documentation: "Percent y of x",
    },
    CompletionItemSuggestion {
        label: "pow",
        insert_text: "pow(${1:x}, ${2:y})",
        documentation: "x to the power of y",
    },
    CompletionItemSuggestion {
        label: "root",
        insert_text: "root(${1:x}, ${2:N})",
        documentation: "N-th root of x where N >= 0",
    },
    CompletionItemSuggestion {
        label: "round",
        insert_text: "round(${1:x})",
        documentation: "Round x to the nearest integer",
    },
    CompletionItemSuggestion {
        label: "sgn",
        insert_text: "sgn(${1:x})",
        documentation: "Sign of x: -1, 1, or 0",
    },
    CompletionItemSuggestion {
        label: "sqrt",
        insert_text: "sqrt(${1:x})",
        documentation: "Square root of x",
    },
    CompletionItemSuggestion {
        label: "sum",
        insert_text: "sum(${1:x})",
        documentation: "Sum of all inputs",
    },
    CompletionItemSuggestion {
        label: "trunc",
        insert_text: "trunc(${1:x})",
        documentation: "Integer portion of x",
    },
    CompletionItemSuggestion {
        label: "acos",
        insert_text: "acos(${1:x})",
        documentation: "Arc cosine of x in radians",
    },
    CompletionItemSuggestion {
        label: "acosh",
        insert_text: "acosh(${1:x})",
        documentation: "Inverse hyperbolic cosine of x in radians",
    },
    CompletionItemSuggestion {
        label: "asin",
        insert_text: "asin(${1:x})",
        documentation: "Arc sine of x in radians",
    },
    CompletionItemSuggestion {
        label: "asinh",
        insert_text: "asinh(${1:x})",
        documentation: "Inverse hyperbolic sine of x in radians",
    },
    CompletionItemSuggestion {
        label: "atan",
        insert_text: "atan(${1:x})",
        documentation: "Arc tangent of x in radians",
    },
    CompletionItemSuggestion {
        label: "atanh",
        insert_text: "atanh(${1:x})",
        documentation: "Inverse hyperbolic tangent of x in radians",
    },
    CompletionItemSuggestion {
        label: "cos",
        insert_text: "cos(${1:x})",
        documentation: "Cosine of x",
    },
    CompletionItemSuggestion {
        label: "cosh",
        insert_text: "cosh(${1:x})",
        documentation: "Hyperbolic cosine of x",
    },
    CompletionItemSuggestion {
        label: "cot",
        insert_text: "cot(${1:x})",
        documentation: "Cotangent of x",
    },
    CompletionItemSuggestion {
        label: "sin",
        insert_text: "sin(${1:x})",
        documentation: "Sine of x",
    },
    CompletionItemSuggestion {
        label: "sinc",
        insert_text: "sinc(${1:x})",
        documentation: "Sine cardinal of x",
    },
    CompletionItemSuggestion {
        label: "sinh",
        insert_text: "sinh(${1:x})",
        documentation: "Hyperbolic sine of x",
    },
    CompletionItemSuggestion {
        label: "tan",
        insert_text: "tan(${1:x})",
        documentation: "Tangent of x",
    },
    CompletionItemSuggestion {
        label: "tanh",
        insert_text: "tanh(${1:x})",
        documentation: "Hyperbolic tangent of x",
    },
    CompletionItemSuggestion {
        label: "deg2rad",
        insert_text: "deg2rad(${1:x})",
        documentation: "Convert x from degrees to radians",
    },
    CompletionItemSuggestion {
        label: "deg2grad",
        insert_text: "deg2grad(${1:x})",
        documentation: "Convert x from degrees to gradians",
    },
    CompletionItemSuggestion {
        label: "rad2deg",
        insert_text: "rad2deg(${1:x})",
        documentation: "Convert x from radians to degrees",
    },
    CompletionItemSuggestion {
        label: "grad2deg",
        insert_text: "grad2deg(${1:x})",
        documentation: "Convert x from gradians to degrees",
    },
    CompletionItemSuggestion {
        label: "concat",
        insert_text: "concat(${1:x}, ${2:y})",
        documentation: "Concatenate string columns and string literals, such \
                        as:\nconcat(\"State\" ', ', \"City\")",
    },
    CompletionItemSuggestion {
        label: "order",
        insert_text: "order(${1:input column}, ${2:value}, ...)",
        documentation: "Generates a sort order for a string column based on the input order of \
                        the parameters, such as:\norder(\"State\", 'Texas', 'New York')",
    },
    CompletionItemSuggestion {
        label: "upper",
        insert_text: "upper(${1:x})",
        documentation: "Uppercase of x",
    },
    CompletionItemSuggestion {
        label: "lower",
        insert_text: "lower(${1:x})",
        documentation: "Lowercase of x",
    },
    CompletionItemSuggestion {
        label: "hour_of_day",
        insert_text: "hour_of_day(${1:x})",
        documentation: "Return a datetime's hour of the day as a string",
    },
    CompletionItemSuggestion {
        label: "month_of_year",
        insert_text: "month_of_year(${1:x})",
        documentation: "Return a datetime's month of the year as a string",
    },
    CompletionItemSuggestion {
        label: "day_of_week",
        insert_text: "day_of_week(${1:x})",
        documentation: "Return a datetime's day of week as a string",
    },
    CompletionItemSuggestion {
        label: "now",
        insert_text: "now()",
        documentation: "The current datetime in local time",
    },
    CompletionItemSuggestion {
        label: "today",
        insert_text: "today()",
        documentation: "The current date in local time",
    },
    CompletionItemSuggestion {
        label: "is_null",
        insert_text: "is_null(${1:x})",
        documentation: "Whether x is a null value",
    },
    CompletionItemSuggestion {
        label: "is_not_null",
        insert_text: "is_not_null(${1:x})",
        documentation: "Whether x is not a null value",
    },
    CompletionItemSuggestion {
        label: "coalesce",
        insert_text: "coalesce(${1:x}, ${2:y})",
        documentation: "Returns the first non-null argument.",
    },
    CompletionItemSuggestion {
        label: "contains",
        insert_text: "contains(${1:x}, ${2:'substr'})",
        documentation: "Whether the string column or value contains the literal substring.",
    },
    CompletionItemSuggestion {
        label: "not",
        insert_text: "not(${1:x})",
        documentation: "not x",
    },
    CompletionItemSuggestion {
        label: "true",
        insert_text: "true",
        documentation: "Boolean value true",
    },
    CompletionItemSuggestion {
        label: "false",
        insert_text: "false",
        documentation: "Boolean value false",
    },
    CompletionItemSuggestion {
        label: "if",
        insert_text: "if (${1:condition}) {} else if (${2:condition}) {} else {}",
        documentation: "An if/else conditional, which evaluates a condition such as:\n if \
                        (\"Sales\" > 100) { true } else { false }",
    },
    CompletionItemSuggestion {
        label: "for",
        insert_text: "for (${1:expression}) {}",
        documentation: "A for loop, which repeatedly evaluates an incrementing expression such \
                        as:\nvar x := 0; var y := 1; for (x < 10; x += 1) { y := x + y }",
    },
    CompletionItemSuggestion {
        label: "string",
        insert_text: "string(${1:x})",
        documentation: "Converts the given argument to a string",
    },
    CompletionItemSuggestion {
        label: "integer",
        insert_text: "integer(${1:x})",
        documentation: "Converts the given argument to a 32-bit integer. If the result \
                        over/under-flows, null is returned",
    },
    CompletionItemSuggestion {
        label: "float",
        insert_text: "float(${1:x})",
        documentation: "Converts the argument to a float",
    },
    CompletionItemSuggestion {
        label: "date",
        insert_text: "date(${1:year}, ${1:month}, ${1:day})",
        documentation: "Given a year, month (1-12) and day, create a new date",
    },
    CompletionItemSuggestion {
        label: "datetime",
        insert_text: "datetime(${1:timestamp})",
        documentation: "Given a POSIX timestamp of milliseconds since epoch, create a new datetime",
    },
    CompletionItemSuggestion {
        label: "boolean",
        insert_text: "boolean(${1:x})",
        documentation: "Converts the given argument to a boolean",
    },
    CompletionItemSuggestion {
        label: "random",
        insert_text: "random()",
        documentation: "Returns a random float between 0 and 1, inclusive.",
    },
    CompletionItemSuggestion {
        label: "match",
        insert_text: "match(${1:string}, ${2:pattern})",
        documentation: "Returns True if any part of string matches pattern, and False otherwise.",
    },
    CompletionItemSuggestion {
        label: "match_all",
        insert_text: "match_all(${1:string}, ${2:pattern})",
        documentation: "Returns True if the whole string matches pattern, and False otherwise.",
    },
    CompletionItemSuggestion {
        label: "search",
        insert_text: "search(${1:string}, ${2:pattern})",
        documentation: "Returns the substring that matches the first capturing group in pattern, \
                        or null if there are no capturing groups in the pattern or if there are \
                        no matches.",
    },
    CompletionItemSuggestion {
        label: "indexof",
        insert_text: "indexof(${1:string}, ${2:pattern}, ${3:output_vector})",
        documentation: "Writes into index 0 and 1 of output_vector the start and end indices of \
                        the substring that matches the first capturing group in \
                        pattern.\n\nReturns true if there is a match and output was written, or \
                        false if there are no capturing groups in the pattern, if there are no \
                        matches, or if the indices are invalid.",
    },
    CompletionItemSuggestion {
        label: "substring",
        insert_text: "substring(${1:string}, ${2:start_idx}, ${3:length})",
        documentation: "Returns a substring of string from start_idx with the given length. If \
                        length is not passed in, returns substring from start_idx to the end of \
                        the string. Returns null if the string or any indices are invalid.",
    },
    CompletionItemSuggestion {
        label: "replace",
        insert_text: "replace(${1:string}, ${2:pattern}, ${3:replacer})",
        documentation: "Replaces the first match of pattern in string with replacer, or return \
                        the original string if no replaces were made.",
    },
    CompletionItemSuggestion {
        label: "replace_all",
        insert_text: "replace_all(${1:string}, ${2:pattern}, ${3:replacer})",
        documentation: "Replaces all non-overlapping matches of pattern in string with replacer, \
                        or return the original string if no replaces were made.",
    },
    CompletionItemSuggestion {
        label: "index",
        insert_text: "index()",
        documentation: "Looks up the index value of the current row",
    },
    CompletionItemSuggestion {
        label: "col",
        insert_text: "col(${1:string})",
        documentation: "Looks up a column value by name",
    },
    CompletionItemSuggestion {
        label: "vlookup",
        insert_text: "vlookup(${1:string}, ${2:uint64})",
        documentation: "Looks up a value in another column by index",
    },
];

#[test]
fn test_completions_insert_text_matches_label() {
    for comp in COMPLETIONS {
        let label = comp.label;
        let insert_text = comp.insert_text;
        assert!(
            insert_text.starts_with(label),
            "insert_text for label {label} does not start with {label}:\n    {insert_text}"
        );
    }
}
