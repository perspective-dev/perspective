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
                let select = self.select_clauses();
                let pivot_using: Vec<String> = self
                    .config
                    .columns
                    .iter()
                    .flatten()
                    .map(|col| {
                        let escaped = col.replace('"', "\"\"").replace('_', "-");
                        format!("first(\"{}\") as \"{}\"", escaped, escaped)
                    })
                    .collect();

                let split_cols: String = self
                    .config
                    .split_by
                    .iter()
                    .map(|c| format!("\"{}\"", c))
                    .collect::<Vec<_>>()
                    .join(", ");

                let row_num_order = self.pivot_row_num_order();
                format!(
                    "SELECT * EXCLUDE (__ROW_NUM__) FROM (PIVOT (SELECT {}, {}, ROW_NUMBER() OVER \
                     (ORDER BY {}) as __ROW_NUM__ FROM {}{}) ON {} USING {} GROUP BY __ROW_NUM__)",
                    select.join(", "),
                    split_cols,
                    row_num_order,
                    self.table,
                    where_sql,
                    self.pivot_on_expr(),
                    pivot_using.join(", "),
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
                for sb_col in &self.config.split_by {
                    inner_clauses.push(self.col_name(sb_col));
                }

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

                let pivot_using = self.select_clauses().join(", ");
                let mut row_id_cols = self.row_path_aliases.clone();
                if !self.is_flat_mode() {
                    row_id_cols.push("__GROUPING_ID__".to_string());
                }
                for (sidx, Sort(_, sort_dir)) in self.config.sort.iter().enumerate() {
                    if *sort_dir != SortDir::None && !is_col_sort(sort_dir) {
                        row_id_cols.push(format!("__SORT_{}__", sidx));
                    }
                }

                format!(
                    "SELECT * FROM (PIVOT ({}) ON {} USING {} GROUP BY {})",
                    inner_query,
                    self.pivot_on_expr(),
                    pivot_using,
                    row_id_cols.join(", ")
                )
            },
            QueryOrientation::Total => {
                let select = self.select_clauses().join(", ");
                format!("SELECT {} FROM {}{}", select, self.table, where_sql)
            },
            QueryOrientation::TotalPivoted => {
                let raw_cols: Vec<String> = self
                    .config
                    .columns
                    .iter()
                    .flatten()
                    .map(|col| self.col_name(col))
                    .collect();

                let split_cols: String = self
                    .config
                    .split_by
                    .iter()
                    .map(|c| format!("\"{}\"", c))
                    .collect::<Vec<_>>()
                    .join(", ");

                let pivot_using: Vec<String> = self
                    .config
                    .columns
                    .iter()
                    .flatten()
                    .map(|col| {
                        let agg = self.get_aggregate(col);
                        let escaped = col.replace('"', "\"\"").replace('_', "-");
                        format!("{}(\"{}\") as \"{}\"", agg, escaped, escaped)
                    })
                    .collect();

                format!(
                    "SELECT * FROM (PIVOT (SELECT {}, {} FROM {}{}) ON {} USING {})",
                    raw_cols.join(", "),
                    split_cols,
                    self.table,
                    where_sql,
                    self.pivot_on_expr(),
                    pivot_using.join(", "),
                )
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
                let escaped = col.replace('"', "\"\"").replace("_", "-");
                clauses.push(format!(
                    "{}({}) as \"{}\"",
                    agg,
                    self.col_name(col),
                    escaped
                ));
            }
        } else if !self.config.columns.is_empty() {
            for col in self.config.columns.iter().flatten() {
                let escaped = col.replace('"', "\"\"").replace("_", "-");
                clauses.push(format!("{} as \"{}\"", self.col_name(col), escaped));
            }
        }

        clauses
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
        if self.is_flat_mode() || self.config.sort.is_empty() || self.config.group_by.len() <= 1 {
            return Vec::new();
        }

        let mut clauses = Vec::new();
        for gidx in 0..(self.config.group_by.len() - 1) {
            let partition = self.row_path_aliases[..=gidx].join(", ");
            if !self.config.split_by.is_empty() {
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
