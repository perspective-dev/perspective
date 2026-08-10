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

use indexmap::IndexMap;

use super::GenericSQLError;
use crate::config::{
    Aggregate, Filter, FilterTerm, GroupRollupMode, Scalar, Sort, SortDir, SplitRollupMode,
    ViewConfig, WindowFrame, WindowSortDir, WindowSpec,
};
use crate::proto::ColumnType;

fn aggregate_to_string(agg: &Aggregate) -> String {
    match agg {
        Aggregate::SingleAggregate(name) => name.clone(),
        Aggregate::MultiAggregate(name, _args) => name.clone(),
    }
}

fn sort_dir_to_string(dir: &SortDir) -> &'static str {
    match dir {
        SortDir::None => "",
        SortDir::Asc | SortDir::ColAsc | SortDir::AscAbs | SortDir::ColAscAbs => "ASC",
        SortDir::Desc | SortDir::ColDesc | SortDir::DescAbs | SortDir::ColDescAbs => "DESC",
    }
}

fn is_col_sort(dir: &SortDir) -> bool {
    matches!(
        dir,
        SortDir::ColAsc | SortDir::ColDesc | SortDir::ColAscAbs | SortDir::ColDescAbs
    )
}

enum QueryOrientation {
    /// Default
    Flat,

    /// `group_by` set
    Grouped,

    /// `split_by` set
    Pivoted,

    /// `group_by` and `split_by` set
    GroupedAndPivoted,

    /// `total` set
    Total,

    /// `total` and `split_by`
    TotalPivoted,
}

fn window_over_clause(
    w: &WindowSpec,
    frame: Option<&str>,
    order_expr: Option<&str>,
    row_id: &str,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if !w.partition_by.is_empty() {
        parts.push(format!(
            "PARTITION BY {}",
            w.partition_by
                .iter()
                .map(|c| format!("\"{}\"", quote_ident(c)))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    // NULLS FIRST matches the engine's invalid-keys-sort-first ordering (in
    // both directions). The engine additionally breaks order-key ties by
    // primary key; SQL row order within ties is dialect-defined, so tied
    // ROWS frames may differ. An OMITTED `order_by` takes the model's
    // natural row order - `rowid`, the same identity unsorted view results
    // are already ordered by.
    match &w.order_by {
        Some(order_by) => {
            let key = match order_expr {
                Some(expr) => expr.to_string(),
                None => format!("\"{}\"", quote_ident(&order_by.0)),
            };
            parts.push(format!(
                "ORDER BY {} {} NULLS FIRST",
                key,
                match order_by.1 {
                    WindowSortDir::Asc => "ASC",
                    WindowSortDir::Desc => "DESC",
                }
            ))
        },
        None => parts.push(format!("ORDER BY {} ASC", row_id)),
    }
    if let Some(f) = frame {
        parts.push(f.to_string());
    }

    parts.join(" ")
}

fn window_frame_sql(frame: Option<&WindowFrame>) -> String {
    match frame {
        Some(WindowFrame::Rows(n)) => {
            format!("ROWS BETWEEN {} PRECEDING AND CURRENT ROW", n)
        },
        Some(WindowFrame::Range(x)) => {
            format!("RANGE BETWEEN {} PRECEDING AND CURRENT ROW", x)
        },
        Some(WindowFrame::Cumulative) | None => {
            "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW".to_string()
        },
    }
}

/// One `WindowSpec` as a SQL window-function expression - the 1:1 `OVER`
/// mapping that keeps hot-tier and virtual-server semantics interchangeable
/// (WINDOW_FUNCTIONS_PLAN Phase 5). `resolve` inlines expression-alias
fn window_sql(
    w: &WindowSpec,
    resolve: &dyn Fn(&str) -> String,
    order_type: Option<ColumnType>,
    row_id: &str,
) -> Result<String, GenericSQLError> {
    // `range` frame interval arithmetic is defined on the order key's
    // units - the natural (`rowid`) fallback is meaningless for it, so an
    // explicit `order_by` is required (mirrors the engine's validation).
    if w.order_by.is_none() && matches!(w.frame, Some(WindowFrame::Range(_))) {
        return Err(GenericSQLError::UnsupportedOperation(
            "window `range` frames require an explicit `order_by`".to_string(),
        ));
    }

    let lin_order = match (&w.order_by, &w.frame) {
        (Some(order_by), Some(WindowFrame::Range(_))) => {
            let quoted = format!("\"{}\"", quote_ident(&order_by.0));
            match order_type {
                Some(ColumnType::Date) => Some(format!("({} - DATE '1970-01-01')", quoted)),
                Some(ColumnType::Datetime) => Some(format!("epoch_ms({})", quoted)),
                _ => None,
            }
        },
        _ => None,
    };

    let src = resolve(&w.column);
    let op = w.aggregate.as_str();
    if matches!(
        op,
        "sum"
            | "avg"
            | "count"
            | "min"
            | "max"
            | "product"
            | "median"
            | "stddev_samp"
            | "stddev_pop"
            | "var_samp"
            | "var_pop"
            | "first_value"
            | "last_value"
    ) {
        let frame = window_frame_sql(w.frame.as_ref());
        return Ok(format!(
            "{}({}) OVER ({})",
            op,
            src,
            window_over_clause(w, Some(&frame), lin_order.as_deref(), row_id)
        ));
    }

    if matches!(
        op,
        "row_number" | "rank" | "dense_rank" | "percent_rank" | "cume_dist"
    ) {
        return Ok(format!(
            "{}() OVER ({})",
            op,
            window_over_clause(w, None, None, row_id)
        ));
    }

    match op {
        "lag" | "lead" => Ok(format!(
            "{}({}, {}) OVER ({})",
            op,
            src,
            w.offset.unwrap_or(1),
            window_over_clause(w, None, None, row_id)
        )),
        "nth_value" => {
            let frame = window_frame_sql(w.frame.as_ref());
            Ok(format!(
                "nth_value({}, {}) OVER ({})",
                src,
                w.offset.unwrap_or(1),
                window_over_clause(w, Some(&frame), lin_order.as_deref(), row_id)
            ))
        },
        "ntile" => Ok(format!(
            "ntile({}) OVER ({})",
            w.offset.unwrap_or(1),
            window_over_clause(w, None, None, row_id)
        )),
        // `diff` and `rate` are Perspective's, not any SQL dialect's - they
        // are synthesized here so a config authored against the engine keeps
        // working against a SQL virtual server.
        "diff" => Ok(format!(
            "({} - lag({}, {}) OVER ({}))",
            src,
            src,
            w.offset.unwrap_or(1),
            window_over_clause(w, None, None, row_id)
        )),
        "rate" => {
            let Some(order_by) = &w.order_by else {
                return Err(GenericSQLError::UnsupportedOperation(
                    "window `rate` requires an explicit `order_by`".to_string(),
                ));
            };

            // The engine's validation matrix rejects frameless `rate`
            // (an omitted frame means cumulative only for aggregating
            // ops) - mirror it rather than diverge.
            if !matches!(w.frame, Some(WindowFrame::Range(_))) {
                return Err(GenericSQLError::UnsupportedOperation(
                    "window `rate` requires a `range` frame".to_string(),
                ));
            }

            let frame = window_frame_sql(w.frame.as_ref());
            let over = window_over_clause(w, Some(&frame), lin_order.as_deref(), row_id);
            // Δk in the denominator is measured on the same linear scale
            // the frame is defined on (a raw temporal key would not CAST
            // to DOUBLE PRECISION at all).
            let okey = lin_order
                .clone()
                .unwrap_or_else(|| format!("\"{}\"", quote_ident(&order_by.0)));
            Ok(format!(
                "(({} - first_value({}) OVER ({})) / NULLIF(CAST({} AS DOUBLE PRECISION) - \
                 CAST(first_value({}) OVER ({}) AS DOUBLE PRECISION), 0))",
                src, src, over, okey, okey, over
            ))
        },
        "ema" => Err(GenericSQLError::UnsupportedOperation(
            "`ema` windows cannot be translated to a SQL window function (recursive); compute it \
             in the Perspective engine instead"
                .to_string(),
        )),
        op => Err(GenericSQLError::UnsupportedOperation(format!(
            "window op `{}` is not supported by the SQL translation",
            op
        ))),
    }
}

fn quote_ident(name: &str) -> String {
    name.replace('"', "\"\"")
}

fn quote_literal(value: &str) -> String {
    value.replace('\'', "''")
}

/// Encodes a string as a quoted SQL literal. `backslash_escaped` doubles
/// backslashes for dialects whose literal parser consumes C-style escapes
/// (ClickHouse); standard-conforming dialects (DuckDB) leave them intact.
pub(super) fn string_literal(value: &str, backslash_escaped: bool) -> String {
    let value = if backslash_escaped {
        value.replace('\\', "\\\\")
    } else {
        value.to_string()
    };

    format!("'{}'", quote_literal(&value))
}

/// Backslash-escapes the `LIKE` pattern metacharacters (`\`, `%`, `_`) so a
/// filter term matches literally inside a generated `ILIKE` pattern.
fn like_escape(term: &str) -> String {
    let mut out = String::with_capacity(term.len());
    for c in term.chars() {
        if matches!(c, '\\' | '%' | '_') {
            out.push('\\');
        }

        out.push(c);
    }

    out
}

/// Precomputed context for building a SQL view query from a [`ViewConfig`].
///
/// Holds the resolved column names, grouping function, and row-path aliases
/// needed to emit the correct `SELECT`, `GROUP BY`, `PIVOT`, `ORDER BY`, and
/// `WINDOW` clauses for every combination of `group_by` / `split_by`.
pub(crate) struct ViewQueryContext<'a> {
    from_expr: String,
    config: &'a ViewConfig,
    group_col_names: Vec<String>,
    grouping_fn: &'a str,
    column_separator: &'a str,
    like_escape_clause: Option<&'a str>,
    backslash_escaped_literals: bool,
    regex_fn: Option<&'a str>,
    row_id_expr: &'a str,
    row_path_aliases: Vec<String>,
}

impl<'a> ViewQueryContext<'a> {
    /// Creates a new query context by resolving expressions, the grouping
    /// function, and row-path aliases from the given model and config.
    /// `schema` types the table's columns for window order-key
    /// linearization; an empty map degrades to untyped emission.
    pub(crate) fn new(
        model: &'a super::GenericSQLVirtualServerModel,
        table: &'a str,
        config: &'a ViewConfig,
        schema: &IndexMap<String, ColumnType>,
    ) -> Result<Self, GenericSQLError> {
        let expressions = &config.expressions.0;
        let col_name_resolve = |col: &str| -> String {
            expressions
                .get(col)
                .cloned()
                .unwrap_or_else(|| format!("\"{}\"", col))
        };

        let row_id_expr = model.0.row_id_expr.as_deref().unwrap_or("rowid");

        // Window columns materialize in a wrapping sub-select, so every
        // downstream clause (filter, group_by, aggregate, sort) sees them as
        // plain columns in all four query orientations - mirroring the
        // engine, where windows compute over raw rows before pivoting.
        let from_expr = if config.windows.is_empty() {
            table.to_string()
        } else {
            // Sorted by alias so the generated SQL is deterministic (the
            // `windows` map itself is unordered).
            let mut windows = config.windows.iter().collect::<Vec<_>>();
            windows.sort_by_key(|(name, _)| name.as_str());
            let mut selects = Vec::with_capacity(windows.len());
            for (name, w) in windows {
                let order_type = w
                    .order_by
                    .as_ref()
                    .and_then(|order_by| schema.get(&order_by.0))
                    .copied();

                selects.push(format!(
                    "{} AS \"{}\"",
                    window_sql(w, &col_name_resolve, order_type, row_id_expr)?,
                    quote_ident(name)
                ));
            }

            // The natural row identity (`rowid`, `ctid`) is a system
            // pseudo-column bound only on base tables - it does not survive
            // `SELECT *` into the sub-select, so the natural row order is
            // re-exported under an internal alias for the outer query's
            // `ORDER BY` (see [`Self::natural_order_col`]).
            format!(
                "(SELECT *, {} AS \"__PSP_ROWID__\", {} FROM {}) AS __PSP_WINDOW_SRC__",
                row_id_expr,
                selects.join(", "),
                table
            )
        };

        let grouping_fn = model.0.grouping_fn.as_deref().unwrap_or("GROUPING_ID");
        let column_separator = model.0.column_separator.as_deref().unwrap_or("|");
        let group_col_names: Vec<String> = config
            .group_by
            .iter()
            .map(|c| col_name_resolve(c))
            .collect();

        let row_path_aliases: Vec<String> = (0..config.group_by.len())
            .map(|i| format!("\"__ROW_PATH_{}__\"", i))
            .collect();

        Ok(Self {
            from_expr,
            config,
            group_col_names,
            grouping_fn,
            column_separator,
            like_escape_clause: model.0.like_escape_clause.as_deref(),
            backslash_escaped_literals: model.0.backslash_escaped_literals.unwrap_or(false),
            regex_fn: model.0.regex_fn.as_deref(),
            row_id_expr,
            row_path_aliases,
        })
    }

    /// Builds the inner `SELECT` query (without the outer `CREATE TABLE`
    /// wrapper) for the four `group_by` x `split_by` combinations, appending
    /// `WINDOW` and `ORDER BY` clauses as needed.
    pub(crate) fn build_query(&self) -> String {
        let where_sql = self.where_sql();
        let order_by = self.order_by_clauses();
        let windows = self.window_clauses();
        let mut query = match self.query_orientation() {
            QueryOrientation::Flat => {
                let select = self.select_clauses().join(", ");
                format!("SELECT {} FROM {}{}", select, self.from_expr, where_sql)
            },
            QueryOrientation::Grouped => {
                let mut clauses = self.select_clauses();
                clauses.extend(self.row_path_select_clauses());
                if self.is_flat_mode() {
                    format!(
                        "SELECT {} FROM {}{} GROUP BY {}",
                        clauses.join(", "),
                        self.from_expr,
                        where_sql,
                        self.group_col_names.join(", ")
                    )
                } else {
                    clauses.push(self.grouping_id_clause());
                    format!(
                        "SELECT {} FROM {}{} GROUP BY ROLLUP({})",
                        clauses.join(", "),
                        self.from_expr,
                        where_sql,
                        self.group_col_names.join(", ")
                    )
                }
            },
            QueryOrientation::Pivoted => {
                let mut src_clauses = self.select_clauses();
                src_clauses.extend(self.split_select_clauses());
                src_clauses.push(format!(
                    "ROW_NUMBER() OVER (ORDER BY {}) as \"__ROW_NUM__\"",
                    self.pivot_row_num_order()
                ));

                let src = format!(
                    "SELECT {} FROM {}{}",
                    src_clauses.join(", "),
                    self.from_expr,
                    where_sql
                );

                let cols: Vec<&String> = self.config.columns.iter().flatten().collect();
                if self.is_split_rollup() && !cols.is_empty() {
                    let n = self.config.split_by.len();
                    let union = std::iter::once(0u64)
                        .chain((1..=n).map(|k| (1u64 << k) - 1))
                        .map(|mask| {
                            format!(
                                "SELECT *, {} AS \"__CGROUPING_ID__\" FROM __PSP_PIVOT_BASE__",
                                mask
                            )
                        })
                        .collect::<Vec<_>>()
                        .join(" UNION ALL ");

                    format!(
                        "WITH __PSP_PIVOT_BASE__ AS ({}), __PSP_PIVOT_SRC__ AS ({}) SELECT * \
                         EXCLUDE (\"__ROW_NUM__\") FROM {}",
                        src,
                        union,
                        self.pivot_join(&cols, &["\"__ROW_NUM__\"".to_string()])
                    )
                } else {
                    let from = if cols.is_empty() {
                        "__PSP_PIVOT_SRC__".to_string()
                    } else {
                        self.pivot_join(&cols, &["\"__ROW_NUM__\"".to_string()])
                    };

                    format!(
                        "WITH __PSP_PIVOT_SRC__ AS ({}) SELECT * EXCLUDE (\"__ROW_NUM__\") FROM {}",
                        src, from
                    )
                }
            },
            QueryOrientation::GroupedAndPivoted => {
                let groups_joined = self.group_col_names.join(", ");
                let split_cols_joined = if self.is_split_rollup() {
                    format!("ROLLUP({})", self.pivot_on_expr())
                } else {
                    self.pivot_on_expr()
                };

                let mut inner_clauses = self.select_clauses();
                inner_clauses.extend(self.row_path_select_clauses());
                if !self.is_flat_mode() {
                    inner_clauses.push(self.grouping_id_clause());
                }
                inner_clauses.extend(self.split_select_clauses());
                if self.is_split_rollup() {
                    inner_clauses.push(self.cgrouping_id_clause());
                }

                for (sidx, Sort(sort_col, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                        let sort_source = self.sort_source_expr(sort_col);
                        if self.is_flat_mode() {
                            inner_clauses.push(format!(
                                "sum({}) OVER (PARTITION BY {}) AS \"__SORT_{}__\"",
                                sort_source, groups_joined, sidx,
                            ));
                        } else {
                            inner_clauses.push(format!(
                                "sum({}) OVER (PARTITION BY {}({}), {}) AS \"__SORT_{}__\"",
                                sort_source, self.grouping_fn, groups_joined, groups_joined, sidx,
                            ));
                        }
                    }
                }

                let inner_query = if self.is_flat_mode() {
                    format!(
                        "SELECT {} FROM {}{} GROUP BY {}, {}",
                        inner_clauses.join(", "),
                        self.from_expr,
                        where_sql,
                        groups_joined,
                        split_cols_joined,
                    )
                } else {
                    format!(
                        "SELECT {} FROM {}{} GROUP BY ROLLUP({}), {}",
                        inner_clauses.join(", "),
                        self.from_expr,
                        where_sql,
                        groups_joined,
                        split_cols_joined,
                    )
                };

                let mut row_id_cols = self.row_path_aliases.clone();
                if !self.is_flat_mode() {
                    row_id_cols.push("\"__GROUPING_ID__\"".to_string());
                }
                for (sidx, Sort(_, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                        row_id_cols.push(format!("\"__SORT_{}__\"", sidx));
                    }
                }

                let cols: Vec<&String> = self.config.columns.iter().flatten().collect();
                let from = if cols.is_empty() {
                    "__PSP_PIVOT_SRC__".to_string()
                } else {
                    self.pivot_join(&cols, &row_id_cols)
                };

                format!(
                    "WITH __PSP_PIVOT_SRC__ AS ({}) SELECT * FROM {}",
                    inner_query, from
                )
            },
            QueryOrientation::Total => {
                let select = self.select_clauses().join(", ");
                format!("SELECT {} FROM {}{}", select, self.from_expr, where_sql)
            },
            QueryOrientation::TotalPivoted if self.is_split_rollup() => {
                let cols: Vec<&String> = self.config.columns.iter().flatten().collect();
                let mut src_clauses = self.select_clauses();
                src_clauses.push("1 AS \"__TOTAL_KEY__\"".to_string());
                src_clauses.extend(self.split_select_clauses());
                src_clauses.push(self.cgrouping_id_clause());
                let src = format!(
                    "SELECT {} FROM {}{} GROUP BY ROLLUP({})",
                    src_clauses.join(", "),
                    self.from_expr,
                    where_sql,
                    self.pivot_on_expr(),
                );

                let from = if cols.is_empty() {
                    "__PSP_PIVOT_SRC__".to_string()
                } else {
                    self.pivot_join(&cols, &["\"__TOTAL_KEY__\"".to_string()])
                };

                format!(
                    "WITH __PSP_PIVOT_SRC__ AS ({}) SELECT * EXCLUDE (\"__TOTAL_KEY__\") FROM {}",
                    src, from
                )
            },
            QueryOrientation::TotalPivoted => {
                let mut src_clauses: Vec<String> = self
                    .config
                    .columns
                    .iter()
                    .flatten()
                    .map(|col| format!("{} as \"{}\"", self.col_name(col), quote_ident(col)))
                    .collect();

                src_clauses.extend(self.split_select_clauses());
                let src = format!(
                    "SELECT {} FROM {}{}",
                    src_clauses.join(", "),
                    self.from_expr,
                    where_sql
                );

                let cols: Vec<&String> = self.config.columns.iter().flatten().collect();
                let from = if cols.is_empty() {
                    "__PSP_PIVOT_SRC__".to_string()
                } else {
                    // Without a `GROUP BY`, `PIVOT` implicitly groups by every
                    // non-pivoted source column, so each per-column pivot must
                    // project only its own column and the `split_by` columns.
                    cols.iter()
                        .map(|col| {
                            let mut proj = vec![format!("\"{}\"", quote_ident(col))];
                            for c in &self.config.split_by {
                                if c != *col {
                                    proj.push(format!("\"{}\"", quote_ident(c)));
                                }
                            }

                            format!(
                                "(PIVOT (SELECT {} FROM __PSP_PIVOT_SRC__) ON {} USING {}(\"{}\"))",
                                proj.join(", "),
                                self.pivot_on_expr_for(col),
                                self.get_aggregate(col),
                                quote_ident(col),
                            )
                        })
                        .collect::<Vec<_>>()
                        .join(" CROSS JOIN ")
                };

                format!("WITH __PSP_PIVOT_SRC__ AS ({}) SELECT * FROM {}", src, from)
            },
        };

        if !windows.is_empty() {
            query = format!("{} WINDOW {}", query, windows.join(", "));
        }

        if !order_by.is_empty() {
            query = format!("{} ORDER BY {}", query, order_by.join(", "));
        } else if self.is_flat_mode() && !self.config.group_by.is_empty() {
            let default_order: Vec<String> = self
                .row_path_aliases
                .iter()
                .map(|alias| format!("{} ASC", alias))
                .collect();
            query = format!("{} ORDER BY {}", query, default_order.join(", "));
        } else if self.config.group_by.is_empty()
            && self.config.group_rollup_mode != GroupRollupMode::Total
        {
            let default_order = if self.config.split_by.is_empty() {
                self.natural_order_col()
            } else {
                "\"__ROW_NUM__\""
            };

            query = format!("{} ORDER BY {}", query, default_order);
        }

        query
    }

    fn is_flat_mode(&self) -> bool {
        self.config.group_rollup_mode == GroupRollupMode::Flat
    }

    fn needs_aggregation(&self) -> bool {
        !self.config.group_by.is_empty() || self.config.group_rollup_mode == GroupRollupMode::Total
    }

    fn query_orientation(&self) -> QueryOrientation {
        if self.config.group_rollup_mode == GroupRollupMode::Total {
            return if self.config.split_by.is_empty() {
                QueryOrientation::Total
            } else {
                QueryOrientation::TotalPivoted
            };
        }

        match (
            self.config.group_by.is_empty(),
            self.config.split_by.is_empty(),
        ) {
            (true, true) => QueryOrientation::Flat,
            (false, true) => QueryOrientation::Grouped,
            (true, false) => QueryOrientation::Pivoted,
            (false, false) => QueryOrientation::GroupedAndPivoted,
        }
    }

    fn col_name(&self, col: &str) -> String {
        self.config
            .expressions
            .0
            .get(col)
            .cloned()
            .unwrap_or_else(|| format!("\"{}\"", col))
    }

    fn get_aggregate(&self, col: &str) -> String {
        self.config
            .aggregates
            .get(col)
            .map(aggregate_to_string)
            .unwrap_or_else(|| "any_value".to_string())
    }

    fn sort_source_expr(&self, sort_col: &str) -> String {
        let base = format!(
            "{}({})",
            self.get_aggregate(sort_col),
            self.col_name(sort_col)
        );

        if self.is_split_rollup() {
            format!(
                "CASE WHEN {}({}) = 0 THEN {} END",
                self.grouping_fn,
                self.pivot_on_expr(),
                base
            )
        } else {
            base
        }
    }

    fn select_clauses(&self) -> Vec<String> {
        let mut clauses = Vec::new();
        if self.needs_aggregation() {
            for col in self.config.columns.iter().flatten() {
                let agg = self.get_aggregate(col);
                clauses.push(format!(
                    "{}({}) as \"{}\"",
                    agg,
                    self.col_name(col),
                    quote_ident(col)
                ));
            }
        } else if !self.config.columns.is_empty() {
            for col in self.config.columns.iter().flatten() {
                clauses.push(format!(
                    "{} as \"{}\"",
                    self.col_name(col),
                    quote_ident(col)
                ));
            }
        }

        clauses
    }

    /// `SELECT` clauses aliasing each `split_by` column for a pivot source
    /// query, skipping any that already appear in `config.columns` (whose
    /// alias would collide).
    fn split_select_clauses(&self) -> Vec<String> {
        self.config
            .split_by
            .iter()
            .filter(|c| !self.config.columns.iter().flatten().any(|x| &x == c))
            .map(|c| format!("{} as \"{}\"", self.col_name(c), quote_ident(c)))
            .collect()
    }

    /// The `PIVOT ... ON` expression for one data column: the `split_by`
    /// columns and the column name literal joined with `column_separator`,
    /// so DuckDB names each output column `value<sep>value<sep>column`
    /// verbatim. `||` concatenation propagates NULL split values, which
    /// DuckDB's `PIVOT` then drops (matching its native `ON` behavior).
    fn pivot_on_expr_for(&self, col: &str) -> String {
        let sep = quote_literal(self.column_separator);
        let leaf = format!(
            "{} || '{}{}'",
            self.split_prefix_expr(self.config.split_by.len(), &sep),
            sep,
            quote_literal(col)
        );

        if !self.is_split_rollup() {
            return leaf;
        }

        let n = self.config.split_by.len();
        let mut arms = Vec::with_capacity(n);
        for rolled in (1..=n).rev() {
            let mask = (1u64 << rolled) - 1;
            let kept = n - rolled;
            let name = if kept == 0 {
                format!("'{}'", quote_literal(col))
            } else {
                format!(
                    "{} || '{}{}'",
                    self.split_prefix_expr(kept, &sep),
                    sep,
                    quote_literal(col)
                )
            };

            arms.push(format!("WHEN {} THEN {}", mask, name));
        }

        format!(
            "CASE \"__CGROUPING_ID__\" {} ELSE {} END",
            arms.join(" "),
            leaf
        )
    }

    fn split_prefix_expr(&self, kept: usize, sep: &str) -> String {
        self.config.split_by[..kept]
            .iter()
            .map(|c| format!("\"{}\"", quote_ident(c)))
            .collect::<Vec<_>>()
            .join(&format!(" || '{}' || ", sep))
    }

    fn is_split_rollup(&self) -> bool {
        self.config.split_rollup_mode == SplitRollupMode::Rollup && !self.config.split_by.is_empty()
    }

    fn cgrouping_id_clause(&self) -> String {
        format!(
            "{}({}) AS \"__CGROUPING_ID__\"",
            self.grouping_fn,
            self.pivot_on_expr()
        )
    }

    /// Builds a `FROM` expression pivoting `__PSP_PIVOT_SRC__` once per data
    /// column and joining the results on `keys`. Each pivot uses a single
    /// unaliased `USING` aggregate — the only form for which DuckDB names
    /// output columns by the `ON` value alone, with no `_`-joined alias
    /// suffix. Joins compare with `IS NOT DISTINCT FROM` because rollup rows
    /// carry NULL `__ROW_PATH_N__` keys.
    fn pivot_join(&self, cols: &[&String], keys: &[String]) -> String {
        let keys_joined = keys.join(", ");
        let pivots: Vec<String> = cols
            .iter()
            .map(|col| {
                format!(
                    "(PIVOT __PSP_PIVOT_SRC__ ON {} USING first(\"{}\") GROUP BY {})",
                    self.pivot_on_expr_for(col),
                    quote_ident(col),
                    keys_joined
                )
            })
            .collect();

        if pivots.len() == 1 {
            return pivots.into_iter().next().unwrap();
        }

        let mut select_terms = vec!["__PSP_PIVOT_0__.*".to_string()];
        let mut from = format!("{} __PSP_PIVOT_0__", pivots[0]);
        for (i, pivot) in pivots.iter().enumerate().skip(1) {
            let alias = format!("__PSP_PIVOT_{}__", i);
            select_terms.push(format!("{}.* EXCLUDE ({})", alias, keys_joined));
            let on = keys
                .iter()
                .map(|k| format!("__PSP_PIVOT_0__.{} IS NOT DISTINCT FROM {}.{}", k, alias, k))
                .collect::<Vec<_>>()
                .join(" AND ");

            from.push_str(&format!(" JOIN {} {} ON {}", pivot, alias, on));
        }

        format!("(SELECT {} FROM {})", select_terms.join(", "), from)
    }

    fn where_sql(&self) -> String {
        let clauses: Vec<String> = self
            .config
            .filter
            .iter()
            .filter_map(|flt| self.filter_clause_sql(flt))
            .collect();

        if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        }
    }

    /// Translates one filter into a SQL `WHERE` clause, or `None` when it
    /// cannot be expressed (missing term, regex with no `regex_fn`).
    fn filter_clause_sql(&self, flt: &Filter) -> Option<String> {
        let col = self.col_name(flt.column());
        let op = flt.op();
        match op {
            "is null" => Some(format!("{col} IS NULL")),
            "is not null" => Some(format!("{col} IS NOT NULL")),
            "begins with" | "not begins with" | "ends with" | "not ends with" | "contains"
            | "not contains" => {
                let FilterTerm::Scalar(Scalar::String(term)) = flt.term() else {
                    return None;
                };

                let term = like_escape(term);
                let pattern = match op {
                    "begins with" | "not begins with" => format!("{term}%"),
                    "ends with" | "not ends with" => format!("%{term}"),
                    _ => format!("%{term}%"),
                };

                let not = if op.starts_with("not ") { "NOT " } else { "" };
                let escape = self
                    .like_escape_clause
                    .map(|c| {
                        format!(
                            " ESCAPE {}",
                            string_literal(c, self.backslash_escaped_literals)
                        )
                    })
                    .unwrap_or_default();

                Some(format!(
                    "{col} {not}ILIKE {}{escape}",
                    string_literal(&pattern, self.backslash_escaped_literals)
                ))
            },
            "matches" | "not matches" => {
                let regex_fn = self.regex_fn?;
                let FilterTerm::Scalar(Scalar::String(term)) = flt.term() else {
                    return None;
                };

                let not = if op == "not matches" { "NOT " } else { "" };
                Some(format!(
                    "{not}{regex_fn}({col}, {})",
                    string_literal(term, self.backslash_escaped_literals)
                ))
            },
            "in" | "not in" => {
                let term = super::GenericSQLVirtualServerModel::filter_term_to_sql(
                    flt.term(),
                    self.backslash_escaped_literals,
                )?;

                let sql_op = if op == "in" { "IN" } else { "NOT IN" };
                Some(format!("{col} {sql_op} {term}"))
            },
            op => {
                let term = super::GenericSQLVirtualServerModel::filter_term_to_sql(
                    flt.term(),
                    self.backslash_escaped_literals,
                )?;

                let sql_op = if op == "==" { "=" } else { op };
                Some(format!("{col} {sql_op} {term}"))
            },
        }
    }

    /// The natural row-order column as visible to clauses that select `FROM
    fn natural_order_col(&self) -> &str {
        if self.config.windows.is_empty() {
            self.row_id_expr
        } else {
            "\"__PSP_ROWID__\""
        }
    }

    /// Builds the `ORDER BY` expression for the `ROW_NUMBER()` window
    /// function used inside `PIVOT` queries. Uses sort config if available,
    /// otherwise falls back to the natural row order.
    fn pivot_row_num_order(&self) -> String {
        let sort_exprs: Vec<String> = self
            .config
            .sort
            .iter()
            .filter(|Sort(_, dir)| *dir != SortDir::None && !is_col_sort(dir))
            .map(|Sort(col, dir)| format!("{} {}", self.col_name(col), sort_dir_to_string(dir)))
            .collect();

        if sort_exprs.is_empty() {
            self.natural_order_col().to_string()
        } else {
            sort_exprs.join(", ")
        }
    }

    fn pivot_on_expr(&self) -> String {
        self.config
            .split_by
            .iter()
            .map(|c| format!("\"{}\"", c))
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn grouping_id_clause(&self) -> String {
        format!(
            "{}({}) AS \"__GROUPING_ID__\"",
            self.grouping_fn,
            self.group_col_names.join(", ")
        )
    }

    fn row_path_select_clauses(&self) -> Vec<String> {
        self.config
            .group_by
            .iter()
            .enumerate()
            .map(|(i, col)| format!("{} as \"__ROW_PATH_{}__\"", self.col_name(col), i))
            .collect()
    }

    fn order_by_clauses(&self) -> Vec<String> {
        let mut clauses = Vec::new();
        if !self.config.group_by.is_empty() && self.is_flat_mode() {
            let has_row_sort = self
                .config
                .sort
                .iter()
                .any(|Sort(_, dir)| *dir != SortDir::None && !is_col_sort(dir));
            if self.config.group_by.len() > 1 && has_row_sort {
                // Hierarchical flat sort — mirrors rollup logic but without GROUPING_ID
                for gidx in 0..self.config.group_by.len() {
                    let is_leaf = gidx >= self.config.group_by.len() - 1;
                    for (sidx, Sort(sort_col, sort_dir)) in self.config.sort.iter().enumerate() {
                        if *sort_dir == SortDir::None || is_col_sort(sort_dir) {
                            continue;
                        }

                        let dir = sort_dir_to_string(sort_dir);
                        if !self.config.split_by.is_empty() {
                            if is_leaf {
                                clauses.push(format!("\"__SORT_{}__\" {}", sidx, dir));
                            } else {
                                clauses.push(format!(
                                    "first_value(\"__SORT_{}__\") OVER __WINDOW_{}__ {}",
                                    sidx, gidx, dir
                                ));
                            }
                        } else {
                            let agg = self.get_aggregate(sort_col);
                            if is_leaf {
                                clauses.push(format!(
                                    "{}({}) {}",
                                    agg,
                                    self.col_name(sort_col),
                                    dir
                                ));
                            } else {
                                clauses.push(format!(
                                    "first_value({}({})) OVER __WINDOW_{}__ {}",
                                    agg,
                                    self.col_name(sort_col),
                                    gidx,
                                    dir
                                ));
                            }
                        }
                    }

                    clauses.push(format!("{} ASC", self.row_path_aliases[gidx]));
                }
            } else {
                // Single group level — simple sort, no window needed
                for (sidx, Sort(sort_col, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                        let dir = sort_dir_to_string(sort_dir);
                        if !self.config.split_by.is_empty() {
                            clauses.push(format!("\"__SORT_{}__\" {}", sidx, dir));
                        } else {
                            let agg = self.get_aggregate(sort_col);
                            clauses.push(format!("{}({}) {}", agg, self.col_name(sort_col), dir));
                        }
                    }
                }
            }
        } else if !self.config.group_by.is_empty() {
            for gidx in 0..self.config.group_by.len() {
                if !self.config.split_by.is_empty() {
                    let shift = self.config.group_by.len() - 1 - gidx;
                    if shift > 0 {
                        clauses.push(format!("(\"__GROUPING_ID__\" >> {}) DESC", shift));
                    } else {
                        clauses.push("\"__GROUPING_ID__\" DESC".to_string());
                    }
                } else {
                    let groups_up_to = self.config.group_by[..=gidx]
                        .iter()
                        .map(|c| self.col_name(c))
                        .collect::<Vec<_>>()
                        .join(", ");
                    clauses.push(format!("{}({}) DESC", self.grouping_fn, groups_up_to));
                }

                let is_leaf = gidx >= self.config.group_by.len() - 1;
                for (sidx, Sort(sort_col, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir == SortDir::None || is_col_sort(sort_dir) {
                        continue;
                    }

                    let dir = sort_dir_to_string(sort_dir);
                    if !self.config.split_by.is_empty() {
                        if is_leaf {
                            clauses.push(format!("\"__SORT_{}__\" {}", sidx, dir));
                        } else {
                            clauses.push(format!(
                                "first_value(\"__SORT_{}__\") OVER __WINDOW_{}__ {}",
                                sidx, gidx, dir
                            ));
                        }
                    } else {
                        let agg = self.get_aggregate(sort_col);
                        if is_leaf {
                            clauses.push(format!("{}({}) {}", agg, self.col_name(sort_col), dir));
                        } else {
                            clauses.push(format!(
                                "first_value({}({})) OVER __WINDOW_{}__ {}",
                                agg,
                                self.col_name(sort_col),
                                gidx,
                                dir
                            ));
                        }
                    }
                }

                clauses.push(format!("{} ASC", self.row_path_aliases[gidx]));
            }
        } else if self.config.split_by.is_empty() {
            for Sort(sort_col, sort_dir) in &self.config.sort {
                if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                    let dir = sort_dir_to_string(sort_dir);
                    clauses.push(format!("{} {}", self.col_name(sort_col), dir));
                }
            }
        }

        clauses
    }

    fn window_clauses(&self) -> Vec<String> {
        if self.config.sort.is_empty() || self.config.group_by.len() <= 1 {
            return Vec::new();
        }

        let mut clauses = Vec::new();
        for gidx in 0..(self.config.group_by.len() - 1) {
            let partition = self.row_path_aliases[..=gidx].join(", ");
            if self.is_flat_mode() {
                // Flat mode: partition by row path only (no GROUPING_ID)
                if !self.config.split_by.is_empty() {
                    let order = self.row_path_aliases.join(", ");
                    clauses.push(format!(
                        "__WINDOW_{}__ AS (PARTITION BY {} ORDER BY {})",
                        gidx, partition, order,
                    ));
                } else {
                    clauses.push(format!(
                        "__WINDOW_{}__ AS (PARTITION BY {} ORDER BY {})",
                        gidx,
                        partition,
                        self.group_col_names.join(", ")
                    ));
                }
            } else if !self.config.split_by.is_empty() {
                let shift = self.config.group_by.len() - 1 - gidx;
                let grouping_expr = if shift > 0 {
                    format!("(\"__GROUPING_ID__\" >> {})", shift)
                } else {
                    "\"__GROUPING_ID__\"".to_string()
                };

                let order = self.row_path_aliases.join(", ");
                clauses.push(format!(
                    "__WINDOW_{}__ AS (PARTITION BY {}, {} ORDER BY {})",
                    gidx, grouping_expr, partition, order,
                ));
            } else {
                let sub_groups = self.config.group_by[..=gidx]
                    .iter()
                    .map(|c| self.col_name(c))
                    .collect::<Vec<_>>()
                    .join(", ");
                clauses.push(format!(
                    "__WINDOW_{}__ AS (PARTITION BY {}({}), {} ORDER BY {})",
                    gidx,
                    self.grouping_fn,
                    sub_groups,
                    partition,
                    self.group_col_names.join(", ")
                ));
            }
        }

        clauses
    }
}
