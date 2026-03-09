#  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
#  ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
#  ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
#  ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
#  ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
#  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
#  ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
#  ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
#  ┃ This file is part of the Perspective library, distributed under the terms ┃
#  ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
#  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import logging
import polars as pl
import perspective

from datetime import datetime
import re

from perspective.virtual_servers import VirtualServerHandler

logger = logging.getLogger(__name__)

NUMBER_AGGS = [
    "sum",
    "count",
    "any_value",
    "avg",
    "mean",
    "max",
    "min",
    "first",
    "last",
]

STRING_AGGS = [
    "count",
    "any_value",
    "first",
    "last",
]

FILTER_OPS = [
    "==",
    "!=",
    ">=",
    "<=",
    ">",
    "<",
]

AGG_MAP = {
    "sum": lambda e: e.sum(),
    "count": lambda e: e.count(),
    "avg": lambda e: e.mean(),
    "mean": lambda e: e.mean(),
    "min": lambda e: e.min(),
    "max": lambda e: e.max(),
    "first": lambda e: e.first(),
    "last": lambda e: e.last(),
    "any_value": lambda e: e.first(),
    "arbitrary": lambda e: e.first(),
}


class PolarsVirtualSession:
    def __init__(self, callback, tables):
        self.session = perspective.VirtualServer(PolarsVirtualServerHandler(tables))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class PolarsVirtualServer:
    def __init__(self, tables):
        self.tables = tables

    def new_session(self, callback):
        return PolarsVirtualSession(callback, self.tables)


class PolarsVirtualServerHandler(VirtualServerHandler):
    """
    An implementation of a `perspective.VirtualServerHandler` for Polars.
    """

    def __init__(self, tables):
        self.tables = tables
        self.views = {}
        self.view_schemas = {}

    def get_features(self):
        return {
            "group_by": True,
            "split_by": True,
            "sort": True,
            "expressions": True,
            "group_rollup_mode": ["rollup", "flat", "total"],
            "filter_ops": {
                "integer": FILTER_OPS,
                "float": FILTER_OPS,
                "string": FILTER_OPS,
                "boolean": ["==", "!="],
                "date": FILTER_OPS,
                "datetime": FILTER_OPS,
            },
            "aggregates": {
                "integer": NUMBER_AGGS,
                "float": NUMBER_AGGS,
                "string": STRING_AGGS,
                "boolean": STRING_AGGS,
                "date": STRING_AGGS,
                "datetime": STRING_AGGS,
            },
        }

    def get_hosted_tables(self):
        return list(self.tables.keys())

    def table_schema(self, table_name, config=None):
        df = self.tables[table_name]
        schema = {}
        for col_name, dtype in df.schema.items():
            if not col_name.startswith("__"):
                schema[col_name] = polars_type_to_psp(dtype)
        return schema

    def table_size(self, table_name):
        return self.tables[table_name].height

    def view_schema(self, view_name, config):
        if view_name in self.view_schemas:
            return self.view_schemas[view_name]
        return self.table_schema(view_name)

    def view_size(self, view_name):
        if view_name in self.views:
            return self.views[view_name].height
        return self.table_size(view_name)

    def table_validate_expression(self, table_name, expression):
        df = self.tables.get(table_name)
        if df is None:
            return None
        expr = parse_expression(expression)
        result = df.select(expr.alias("__expr__"))
        return polars_type_to_psp(result["__expr__"].dtype)

    def table_make_view(self, table_name, view_name, config):
        start = datetime.now()
        df = self.tables[table_name]
        group_by = config.get("group_by", [])
        columns = [c for c in config.get("columns", []) if c is not None]
        aggregates = config.get("aggregates", {})
        sort = config.get("sort", [])
        filters = config.get("filter", [])
        split_by = config.get("split_by", [])
        expressions = config.get("expressions", {})
        group_rollup_mode = config.get("group_rollup_mode", "rollup")

        if expressions:
            for expr_name, expr_str in expressions.items():
                expr = parse_expression(expr_str)
                df = df.with_columns(expr.alias(expr_name))

        df = apply_filters(df, filters)

        col_alias = lambda c: c.replace("_", "-")
        is_flat = group_rollup_mode == "flat"
        is_total = group_rollup_mode == "total"

        if is_total:
            if split_by:
                result = build_split_by_total(
                    df, split_by, columns, aggregates, col_alias
                )
            else:
                result = build_total(df, columns, aggregates, col_alias)
        elif split_by and group_by:
            if is_flat:
                result = build_split_by_grouped_flat(
                    df, group_by, split_by, columns, aggregates, col_alias
                )
                result = apply_sort_split_by_flat(
                    result, sort, columns, group_by, split_by
                )
            else:
                result = build_split_by_grouped(
                    df, group_by, split_by, columns, aggregates, col_alias
                )
                result = apply_sort_grouped(result, sort, group_by, col_alias)
        elif split_by:
            result = build_split_by_flat(df, split_by, columns, col_alias)
            result = apply_sort_flat(result, sort, col_alias)
        elif group_by:
            if is_flat:
                result = build_flat_group_by(
                    df, group_by, columns, aggregates, col_alias
                )
                result = apply_sort_flat(result, sort, col_alias)
            else:
                result = build_rollup(df, group_by, columns, aggregates, col_alias)
                result = apply_sort_grouped(result, sort, group_by, col_alias)
        else:
            select_exprs = [pl.col(c).alias(col_alias(c)) for c in columns]
            result = df.select(select_exprs)
            result = apply_sort_flat(result, sort, col_alias)

        self.views[view_name] = result
        self.view_schemas[view_name] = compute_view_schema(result)
        logger.debug(
            f"{datetime.now() - start} table_make_view {table_name} -> {view_name}"
        )

    def view_delete(self, view_name):
        self.views.pop(view_name, None)
        self.view_schemas.pop(view_name, None)

    def view_get_data(self, view_name, config, schema, viewport, data):
        df = self.views.get(view_name)
        if df is None:
            return

        group_by = config.get("group_by", [])
        split_by = config.get("split_by", [])
        group_rollup_mode = config.get("group_rollup_mode", "rollup")
        is_split_by = len(split_by) > 0
        is_flat = group_rollup_mode == "flat"

        start_row = viewport.get("start_row", 0) or 0
        end_row = viewport.get("end_row") or df.height
        start_col = viewport.get("start_col", 0) or 0
        end_col = viewport.get("end_col")

        length = min(end_row, df.height) - start_row
        if length <= 0:
            return
        df_slice = df.slice(start_row, length)

        data_columns = [c for c in schema.keys() if not c.startswith("__")]
        if end_col is not None:
            data_columns = data_columns[start_col:end_col]
        else:
            data_columns = data_columns[start_col:]

        has_group_by = len(group_by) > 0
        has_grouping_id = has_group_by and not is_flat

        all_cols = []
        if has_grouping_id:
            all_cols.append("__GROUPING_ID__")
        for idx in range(len(group_by)):
            all_cols.append(f"__ROW_PATH_{idx}__")
        all_cols.extend(data_columns)

        grouping_ids = None
        if has_grouping_id:
            grouping_ids = df_slice["__GROUPING_ID__"].to_list()

        for cidx, col in enumerate(all_cols):
            if cidx == 0 and has_grouping_id:
                continue

            series = df_slice[col]
            dtype = polars_type_to_psp(series.dtype)
            values = series.to_list()

            push_col = col
            if is_split_by and not col.startswith("__"):
                push_col = col.replace("_", "|")

            for ridx, value in enumerate(values):
                grouping_id = grouping_ids[ridx] if grouping_ids else None

                if value is not None and isinstance(value, float) and value != value:
                    value = None

                data.set_col(dtype, push_col, ridx, value, grouping_id)


################################################################################
#
# Polars Utils


def polars_type_to_psp(dtype):
    """Convert a Polars `dtype` to a Perspective `ColumnType`."""
    if dtype in (pl.Utf8, pl.String):
        return "string"
    if dtype == pl.Categorical:
        return "string"
    if dtype in (pl.Int8, pl.Int16, pl.Int32, pl.UInt8, pl.UInt16):
        return "integer"
    if dtype in (pl.Int64, pl.UInt64, pl.UInt32, pl.Float32, pl.Float64):
        return "float"
    if dtype == pl.Date:
        return "date"
    if dtype == pl.Boolean:
        return "boolean"
    if isinstance(dtype, pl.Datetime) or dtype == pl.Datetime:
        return "datetime"

    msg = f"Unknown Polars type '{dtype}'"
    raise ValueError(msg)


def apply_filters(df, filters):
    """Apply a list of filter configs to a DataFrame."""
    if not filters:
        return df

    mask = pl.lit(True)
    for filt in filters:
        col_name = filt[0]
        op = filt[1]
        value = filt[2] if len(filt) > 2 else None

        if value is None:
            continue

        col_expr = pl.col(col_name)
        if op == "==":
            mask = mask & (col_expr == value)
        elif op == "!=":
            mask = mask & (col_expr != value)
        elif op == ">":
            mask = mask & (col_expr > value)
        elif op == "<":
            mask = mask & (col_expr < value)
        elif op == ">=":
            mask = mask & (col_expr >= value)
        elif op == "<=":
            mask = mask & (col_expr <= value)

    return df.filter(mask)


def get_polars_agg_expr(col, agg_name, filter_expr=None):
    """Convert an aggregate name to a Polars expression."""
    if isinstance(agg_name, list):
        agg_name = agg_name[0]
    if isinstance(agg_name, dict):
        agg_name = "first"
    expr = pl.col(col)
    if filter_expr is not None:
        expr = expr.filter(filter_expr)
    if agg_name in AGG_MAP:
        return AGG_MAP[agg_name](expr)

    msg = f"Unknown aggregate '{agg_name}'"
    raise ValueError(msg)


def default_aggregate(col_name, df):
    """Return the default aggregate for a column based on its type."""
    dtype = df[col_name].dtype
    psp_type = polars_type_to_psp(dtype)
    if psp_type in ("integer", "float"):
        return "sum"
    return "count"


def build_rollup(df, group_by, columns, aggregates, col_alias):
    """Emulate GROUP BY ROLLUP using multiple group_by operations."""
    n = len(group_by)
    frames = []
    data_columns = [c for c in columns if c not in group_by]

    for level in range(n + 1):
        num_groups = n - level
        active_groups = group_by[:num_groups]

        agg_exprs = []
        for col in data_columns:
            agg_name = aggregates.get(col, default_aggregate(col, df))
            agg_exprs.append(get_polars_agg_expr(col, agg_name).alias(col_alias(col)))

        if active_groups:
            grouped = df.group_by(active_groups, maintain_order=True).agg(agg_exprs)
        else:
            grouped = df.select(agg_exprs)

        for idx in range(n):
            if idx < num_groups:
                grouped = grouped.with_columns(
                    pl.col(group_by[idx]).alias(f"__ROW_PATH_{idx}__")
                )
            else:
                src_dtype = df[group_by[idx]].dtype
                grouped = grouped.with_columns(
                    pl.lit(None).cast(src_dtype).alias(f"__ROW_PATH_{idx}__")
                )

        grouping_id = sum(1 << i for i in range(num_groups, n))
        grouped = grouped.with_columns(
            pl.lit(grouping_id).cast(pl.Int64).alias("__GROUPING_ID__")
        )

        for gb_col in active_groups:
            if gb_col in grouped.columns:
                grouped = grouped.drop(gb_col)

        frames.append(grouped)

    result = pl.concat(frames, how="diagonal")
    path_cols = [f"__ROW_PATH_{i}__" for i in range(n)]
    data_col_aliases = [col_alias(c) for c in data_columns]
    final_order = ["__GROUPING_ID__"] + path_cols + data_col_aliases
    result = result.select([c for c in final_order if c in result.columns])
    return result


def build_flat_group_by(df, group_by, columns, aggregates, col_alias):
    """Build a simple GROUP BY (no rollup) - only leaf-level rows."""
    n = len(group_by)
    data_columns = [c for c in columns if c not in group_by]

    agg_exprs = []
    for col in data_columns:
        agg_name = aggregates.get(col, default_aggregate(col, df))
        agg_exprs.append(get_polars_agg_expr(col, agg_name).alias(col_alias(col)))

    grouped = df.group_by(group_by, maintain_order=True).agg(agg_exprs)

    for idx in range(n):
        grouped = grouped.with_columns(
            pl.col(group_by[idx]).alias(f"__ROW_PATH_{idx}__")
        )

    for gb_col in group_by:
        if gb_col in grouped.columns:
            grouped = grouped.drop(gb_col)

    path_cols = [f"__ROW_PATH_{i}__" for i in range(n)]
    data_col_aliases = [col_alias(c) for c in data_columns]
    final_order = path_cols + data_col_aliases
    result = grouped.select([c for c in final_order if c in grouped.columns])
    return result.sort(path_cols)


def build_total(df, columns, aggregates, col_alias):
    """Build a single total row aggregating the entire dataset."""
    agg_exprs = []
    for col in columns:
        agg_name = aggregates.get(col, default_aggregate(col, df))
        agg_exprs.append(get_polars_agg_expr(col, agg_name).alias(col_alias(col)))
    return df.select(agg_exprs)


def build_split_by_total(df, split_by, columns, aggregates, col_alias):
    """Build a single total row with split_by (pivot) columns."""
    split_col = split_by[0]
    data_columns = [c for c in columns if c not in split_by]
    split_values = sorted(df[split_col].unique().to_list())

    agg_exprs = []
    for sv in split_values:
        filter_expr = pl.col(split_col) == sv
        for dc in data_columns:
            agg_name = aggregates.get(dc, default_aggregate(dc, df))
            col_name = f"{sv}_{col_alias(dc)}"
            agg_exprs.append(
                get_polars_agg_expr(dc, agg_name, filter_expr=filter_expr).alias(
                    col_name
                )
            )

    return df.select(agg_exprs)


def build_split_by_grouped_flat(df, group_by, split_by, columns, aggregates, col_alias):
    """Build a flat grouped view with split_by (pivot) columns - no rollup rows."""
    n = len(group_by)
    split_col = split_by[0]
    data_columns = [c for c in columns if c not in group_by and c not in split_by]
    split_values = sorted(df[split_col].unique().to_list())

    agg_exprs = []
    for sv in split_values:
        filter_expr = pl.col(split_col) == sv
        for dc in data_columns:
            agg_name = aggregates.get(dc, default_aggregate(dc, df))
            col_name = f"{sv}_{col_alias(dc)}"
            agg_exprs.append(
                get_polars_agg_expr(dc, agg_name, filter_expr=filter_expr).alias(
                    col_name
                )
            )

    for dc in data_columns:
        agg_name = aggregates.get(dc, default_aggregate(dc, df))
        agg_exprs.append(get_polars_agg_expr(dc, agg_name).alias(f"__SORT_{dc}__"))

    grouped = df.group_by(group_by, maintain_order=True).agg(agg_exprs)

    for idx in range(n):
        grouped = grouped.with_columns(
            pl.col(group_by[idx]).alias(f"__ROW_PATH_{idx}__")
        )

    for gb_col in group_by:
        if gb_col in grouped.columns:
            grouped = grouped.drop(gb_col)

    path_cols = [f"__ROW_PATH_{i}__" for i in range(n)]
    data_col_names = []
    for sv in split_values:
        for dc in data_columns:
            data_col_names.append(f"{sv}_{col_alias(dc)}")
    sort_col_names = [f"__SORT_{dc}__" for dc in data_columns]
    final_order = path_cols + data_col_names + sort_col_names
    result = grouped.select([c for c in final_order if c in grouped.columns])
    return result.sort(path_cols)


def apply_sort_grouped(df, sort_config, group_by, col_alias):
    """Apply sort to a ROLLUP result DataFrame."""
    n = len(group_by)

    sort_cols = []
    sort_desc = []
    for entry in sort_config:
        col = entry[0]
        direction = entry[1]
        if direction != "none":
            aliased = col_alias(col)
            if aliased in df.columns:
                sort_cols.append(aliased)
                sort_desc.append(direction in ("desc", "col desc"))

    if not sort_cols:
        # Default: tree order by row path, nulls first
        path_cols = [f"__ROW_PATH_{i}__" for i in range(n)]
        return df.sort(path_cols, descending=[False] * n, nulls_last=False)

    # With explicit sort: grand total first, then rest sorted
    is_total = pl.lit(True)
    for i in range(n):
        is_total = is_total & pl.col(f"__ROW_PATH_{i}__").is_null()

    total_row = df.filter(is_total)
    rest = df.filter(~is_total)
    rest = rest.sort(sort_cols, descending=sort_desc)
    return pl.concat([total_row, rest])


def apply_sort_split_by_flat(df, sort_config, columns, group_by, split_by):
    """Apply sort to a flat split_by grouped DataFrame using __SORT__ columns."""
    data_columns = [c for c in columns if c not in group_by and c not in split_by]
    sort_cols = []
    sort_desc = []
    for entry in sort_config:
        col = entry[0]
        direction = entry[1]
        if direction != "none":
            sort_name = f"__SORT_{col}__"
            if sort_name in df.columns:
                sort_cols.append(sort_name)
                sort_desc.append(direction in ("desc", "col desc"))

    if sort_cols:
        df = df.sort(sort_cols, descending=sort_desc)

    drop_cols = [
        f"__SORT_{dc}__" for dc in data_columns if f"__SORT_{dc}__" in df.columns
    ]
    if drop_cols:
        df = df.drop(drop_cols)
    return df


def apply_sort_flat(df, sort_config, col_alias):
    """Apply sort to a flat (non-grouped) DataFrame."""
    if not sort_config:
        return df

    sort_cols = []
    sort_descending = []
    for sort_entry in sort_config:
        col = sort_entry[0]
        direction = sort_entry[1]
        if direction != "none":
            aliased = col_alias(col)
            if aliased in df.columns:
                sort_cols.append(aliased)
                sort_descending.append(direction in ("desc", "col desc"))

    if sort_cols:
        return df.sort(sort_cols, descending=sort_descending)
    return df


def compute_view_schema(df):
    """Compute the Perspective schema for a view DataFrame."""
    schema = {}
    for col_name, dtype in df.schema.items():
        if col_name.startswith("__"):
            continue
        schema[col_name] = polars_type_to_psp(dtype)
    return schema


def build_split_by_grouped(df, group_by, split_by, columns, aggregates, col_alias):
    """Build a grouped rollup with split_by (pivot) columns."""
    n = len(group_by)
    split_col = split_by[0]
    data_columns = [c for c in columns if c not in group_by and c not in split_by]
    split_values = sorted(df[split_col].unique().to_list())

    frames = []
    for level in range(n + 1):
        num_groups = n - level
        active_groups = group_by[:num_groups]

        agg_exprs = []
        for sv in split_values:
            filter_expr = pl.col(split_col) == sv
            for dc in data_columns:
                agg_name = aggregates.get(dc, default_aggregate(dc, df))
                col_name = f"{sv}_{col_alias(dc)}"
                agg_exprs.append(
                    get_polars_agg_expr(dc, agg_name, filter_expr=filter_expr).alias(
                        col_name
                    )
                )

        if active_groups:
            grouped = df.group_by(active_groups, maintain_order=True).agg(agg_exprs)
        else:
            grouped = df.select(agg_exprs)

        for idx in range(n):
            if idx < num_groups:
                grouped = grouped.with_columns(
                    pl.col(group_by[idx]).alias(f"__ROW_PATH_{idx}__")
                )
            else:
                src_dtype = df[group_by[idx]].dtype
                grouped = grouped.with_columns(
                    pl.lit(None).cast(src_dtype).alias(f"__ROW_PATH_{idx}__")
                )

        grouping_id = sum(1 << i for i in range(num_groups, n))
        grouped = grouped.with_columns(
            pl.lit(grouping_id).cast(pl.Int64).alias("__GROUPING_ID__")
        )

        for gb_col in active_groups:
            if gb_col in grouped.columns:
                grouped = grouped.drop(gb_col)

        frames.append(grouped)

    result = pl.concat(frames, how="diagonal")
    path_cols = [f"__ROW_PATH_{i}__" for i in range(n)]
    data_col_names = []
    for sv in split_values:
        for dc in data_columns:
            data_col_names.append(f"{sv}_{col_alias(dc)}")
    final_order = ["__GROUPING_ID__"] + path_cols + data_col_names
    result = result.select([c for c in final_order if c in result.columns])
    return result


def build_split_by_flat(df, split_by, columns, col_alias):
    """Build a flat (non-grouped) split_by view."""
    split_col = split_by[0]
    data_columns = [c for c in columns if c not in split_by]
    split_values = sorted(df[split_col].unique().to_list())

    exprs = []
    for sv in split_values:
        for dc in data_columns:
            col_name = f"{sv}_{col_alias(dc)}"
            exprs.append(
                pl.when(pl.col(split_col) == sv)
                .then(pl.col(dc))
                .otherwise(None)
                .alias(col_name)
            )

    return df.select(exprs)


def parse_expression(expr_str):
    """Parse a Perspective expression string into a Polars expression."""
    pattern = r'"([^"]*)"'
    parts = []
    last_end = 0
    for match in re.finditer(pattern, expr_str):
        parts.append(expr_str[last_end : match.start()])
        col_name = match.group(1)
        parts.append(f'pl.col("{col_name}")')
        last_end = match.end()
    parts.append(expr_str[last_end:])
    polars_expr_str = "".join(parts)
    return eval(polars_expr_str, {"pl": pl, "__builtins__": {}})
