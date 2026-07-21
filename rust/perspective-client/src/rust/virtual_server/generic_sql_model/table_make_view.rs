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

use crate::config::{Aggregate, GroupRollupMode, Sort, SortDir, ViewConfig};

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

fn quote_ident(name: &str) -> String {
    name.replace('"', "\"\"")
}

fn quote_literal(value: &str) -> String {
    value.replace('\'', "''")
}

/// Precomputed context for building a SQL view query from a [`ViewConfig`].
///
/// Holds the resolved column names, grouping function, and row-path aliases
/// needed to emit the correct `SELECT`, `GROUP BY`, `PIVOT`, `ORDER BY`, and
/// `WINDOW` clauses for every combination of `group_by` / `split_by`.
pub(crate) struct ViewQueryContext<'a> {
    table: &'a str,
    config: &'a ViewConfig,
    group_col_names: Vec<String>,
    grouping_fn: &'a str,
    column_separator: &'a str,
    row_path_aliases: Vec<String>,
}

impl<'a> ViewQueryContext<'a> {
    /// Creates a new query context by resolving expressions, the grouping
    /// function, and row-path aliases from the given model and config.
    pub(crate) fn new(
        model: &'a super::GenericSQLVirtualServerModel,
        table: &'a str,
        config: &'a ViewConfig,
    ) -> Self {
        let expressions = &config.expressions.0;
        let col_name_resolve = |col: &str| -> String {
            expressions
                .get(col)
                .cloned()
                .unwrap_or_else(|| format!("\"{}\"", col))
        };

        let grouping_fn = model.0.grouping_fn.as_deref().unwrap_or("GROUPING_ID");
        let column_separator = model.0.column_separator.as_deref().unwrap_or("|");
        let group_col_names: Vec<String> = config
            .group_by
            .iter()
            .map(|c| col_name_resolve(c))
            .collect();

        let row_path_aliases: Vec<String> = (0..config.group_by.len())
            .map(|i| format!("__ROW_PATH_{}__", i))
            .collect();

        Self {
            table,
            config,
            group_col_names,
            grouping_fn,
            column_separator,
            row_path_aliases,
        }
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
                format!("SELECT {} FROM {}{}", select, self.table, where_sql)
            },
            QueryOrientation::Grouped => {
                let mut clauses = self.select_clauses();
                clauses.extend(self.row_path_select_clauses());
                if self.is_flat_mode() {
                    format!(
                        "SELECT {} FROM {}{} GROUP BY {}",
                        clauses.join(", "),
                        self.table,
                        where_sql,
                        self.group_col_names.join(", ")
                    )
                } else {
                    clauses.push(self.grouping_id_clause());
                    format!(
                        "SELECT {} FROM {}{} GROUP BY ROLLUP({})",
                        clauses.join(", "),
                        self.table,
                        where_sql,
                        self.group_col_names.join(", ")
                    )
                }
            },
            QueryOrientation::Pivoted => {
                let mut src_clauses = self.select_clauses();
                src_clauses.extend(self.split_select_clauses());
                src_clauses.push(format!(
                    "ROW_NUMBER() OVER (ORDER BY {}) as __ROW_NUM__",
                    self.pivot_row_num_order()
                ));

                let src = format!(
                    "SELECT {} FROM {}{}",
                    src_clauses.join(", "),
                    self.table,
                    where_sql
                );

                let cols: Vec<&String> = self.config.columns.iter().flatten().collect();
                let from = if cols.is_empty() {
                    "__PSP_PIVOT_SRC__".to_string()
                } else {
                    self.pivot_join(&cols, &["__ROW_NUM__".to_string()])
                };

                format!(
                    "WITH __PSP_PIVOT_SRC__ AS ({}) SELECT * EXCLUDE (__ROW_NUM__) FROM {}",
                    src, from
                )
            },
            QueryOrientation::GroupedAndPivoted => {
                let groups_joined = self.group_col_names.join(", ");
                let split_cols_joined = self.pivot_on_expr();
                let mut inner_clauses = self.select_clauses();
                inner_clauses.extend(self.row_path_select_clauses());
                if !self.is_flat_mode() {
                    inner_clauses.push(self.grouping_id_clause());
                }
                inner_clauses.extend(self.split_select_clauses());

                for (sidx, Sort(sort_col, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                        let agg = self.get_aggregate(sort_col);
                        if self.is_flat_mode() {
                            inner_clauses.push(format!(
                                "sum({}({})) OVER (PARTITION BY {}) AS __SORT_{}__",
                                agg,
                                self.col_name(sort_col),
                                groups_joined,
                                sidx,
                            ));
                        } else {
                            inner_clauses.push(format!(
                                "sum({}({})) OVER (PARTITION BY {}({}), {}) AS __SORT_{}__",
                                agg,
                                self.col_name(sort_col),
                                self.grouping_fn,
                                groups_joined,
                                groups_joined,
                                sidx,
                            ));
                        }
                    }
                }

                let inner_query = if self.is_flat_mode() {
                    format!(
                        "SELECT {} FROM {}{} GROUP BY {}, {}",
                        inner_clauses.join(", "),
                        self.table,
                        where_sql,
                        groups_joined,
                        split_cols_joined,
                    )
                } else {
                    format!(
                        "SELECT {} FROM {}{} GROUP BY ROLLUP({}), {}",
                        inner_clauses.join(", "),
                        self.table,
                        where_sql,
                        groups_joined,
                        split_cols_joined,
                    )
                };

                let mut row_id_cols = self.row_path_aliases.clone();
                if !self.is_flat_mode() {
                    row_id_cols.push("__GROUPING_ID__".to_string());
                }
                for (sidx, Sort(_, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                        row_id_cols.push(format!("__SORT_{}__", sidx));
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
                format!("SELECT {} FROM {}{}", select, self.table, where_sql)
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
                    self.table,
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
                "rowid"
            } else {
                "__ROW_NUM__"
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
        let splits = self
            .config
            .split_by
            .iter()
            .map(|c| format!("\"{}\"", quote_ident(c)))
            .collect::<Vec<_>>()
            .join(&format!(" || '{}' || ", sep));

        format!("{} || '{}{}'", splits, sep, quote_literal(col))
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
            .filter_map(|flt| {
                super::GenericSQLVirtualServerModel::filter_term_to_sql(flt.term()).map(
                    |term_lit| format!("{} {} {}", self.col_name(flt.column()), flt.op(), term_lit),
                )
            })
            .collect();

        if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        }
    }

    /// Builds the `ORDER BY` expression for the `ROW_NUMBER()` window
    /// function used inside `PIVOT` queries. Uses sort config if available,
    /// otherwise falls back to `rowid`.
    fn pivot_row_num_order(&self) -> String {
        let sort_exprs: Vec<String> = self
            .config
            .sort
            .iter()
            .filter(|Sort(_, dir)| *dir != SortDir::None && !is_col_sort(dir))
            .map(|Sort(col, dir)| format!("{} {}", self.col_name(col), sort_dir_to_string(dir)))
            .collect();

        if sort_exprs.is_empty() {
            "rowid".to_string()
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
            "{}({}) AS __GROUPING_ID__",
            self.grouping_fn,
            self.group_col_names.join(", ")
        )
    }

    fn row_path_select_clauses(&self) -> Vec<String> {
        self.config
            .group_by
            .iter()
            .enumerate()
            .map(|(i, col)| format!("{} as __ROW_PATH_{}__", self.col_name(col), i))
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
                                clauses.push(format!("__SORT_{}__ {}", sidx, dir));
                            } else {
                                clauses.push(format!(
                                    "first(__SORT_{}__) OVER __WINDOW_{}__ {}",
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
                                    "first({}({})) OVER __WINDOW_{}__ {}",
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
                            clauses.push(format!("__SORT_{}__ {}", sidx, dir));
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
                        clauses.push(format!("(__GROUPING_ID__ >> {}) DESC", shift));
                    } else {
                        clauses.push("__GROUPING_ID__ DESC".to_string());
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
                            clauses.push(format!("__SORT_{}__ {}", sidx, dir));
                        } else {
                            clauses.push(format!(
                                "first(__SORT_{}__) OVER __WINDOW_{}__ {}",
                                sidx, gidx, dir
                            ));
                        }
                    } else {
                        let agg = self.get_aggregate(sort_col);
                        if is_leaf {
                            clauses.push(format!("{}({}) {}", agg, self.col_name(sort_col), dir));
                        } else {
                            clauses.push(format!(
                                "first({}({})) OVER __WINDOW_{}__ {}",
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
                    format!("(__GROUPING_ID__ >> {})", shift)
                } else {
                    "__GROUPING_ID__".to_string()
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
