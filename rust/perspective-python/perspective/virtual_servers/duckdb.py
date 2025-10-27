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

import duckdb
import perspective

from datetime import datetime
from loguru import logger

from perspective.virtual_servers import VirtualSessionModel

# TODO(texodus): Missing these features
#
# - `min_max` API for value-coloring and value-sizing.
#
# - row expand/collapse in the datagrid needs datamodel support, this is
#   likely a "collapsed" boolean column in the temp table we `UPDATE`.
#
# - `on_update` real-time support will be method which takes sa view name and
#   a handler and calls the handler when the view needs to be recalculated.
#
# Nice to have:
#
# - Optional `view_change` method can be implemented for engine optimization,
#   defaulting to just delete & recreate (as Perspective engine does now).
#
# - Would like to add a metadata API so that e.g. Viewer debug panel could
#   show internal generated SQL.


NUMBER_AGGS = [
    "sum",
    "count",
    "any_value",
    "arbitrary",
    # "arg_max",
    # "arg_max_null",
    # "arg_min",
    # "arg_min_null",
    "array_agg",
    "avg",
    "bit_and",
    "bit_or",
    "bit_xor",
    "bitstring_agg",
    "bool_and",
    "bool_or",
    "countif",
    "favg",
    "fsum",
    "geomean",
    # "histogram",
    # "histogram_values",
    "kahan_sum",
    "last",
    # "list"
    "max",
    # "max_by"
    "min",
    # "min_by"
    "product",
    "string_agg",
    "sumkahan",
    # "weighted_avg",
]

STRING_AGGS = [
    "count",
    "any_value",
    "arbitrary",
    "first",
    "countif",
    "last",
    "string_agg",
]

FILTER_OPS = [
    "==",
    "!=",
    "LIKE",
    "IS DISTINCT FROM",
    "IS NOT DISTINCT FROM",
    ">=",
    "<=",
    ">",
    "<",
]


class DuckDBVirtualSession:
    def __init__(self, callback, db):
        self.session = perspective.VirtualServer(DuckDBVirtualSessionModel(db))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class DuckDBVirtualServer:
    def __init__(self, db):
        self.db = db

    def new_session(self, callback):
        return DuckDBVirtualSession(callback, self.db)


class DuckDBVirtualSessionModel(VirtualSessionModel):
    """
    An implementation of a `perspective.VirtualSessionModel` for DuckDB.
    """

    def __init__(self, db):
        self.db = db

    def get_features(self):
        return {
            "group_by": True,
            "split_by": True,
            "sort": True,
            "expressions": True,
            "filter_ops": {
                "integer": FILTER_OPS,
                "float": FILTER_OPS,
                "string": FILTER_OPS,
                "boolean": FILTER_OPS,
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
        logger.info("SHOW ALL TABLES")
        results = self.db.sql("SHOW ALL TABLES").fetchall()
        return [result[2] for result in results]

    def table_schema(self, table_name):
        query = f"DESCRIBE {table_name}"
        results = run_query(self.db, query)
        return {
            result[0].split("_")[-1]: duckdb_type_to_psp(result[1])
            for result in results
            if not (result[0].startswith("__") and result[0].endswith("__"))
        }

    def table_columns_size(self, table_name, config):
        # TODO split this into 2 methods
        query = f"SELECT COUNT(*) FROM (DESCRIBE {table_name})"
        results = run_query(self.db, query)
        gs = len(config["group_by"])
        return results[0][0] - (
            0 if gs == 0 else gs + (1 if len(config["split_by"]) == 0 else 0)
        )

    def table_size(self, table_name):
        query = f"SELECT COUNT(*) FROM {table_name}"
        results = run_query(self.db, query)
        return results[0][0]

    def view_schema(self, view_name, config):
        return self.table_schema(view_name)

    def view_size(self, view_name):
        return self.table_size(view_name)

    def table_make_view(self, table_name, view_name, config):
        columns = config["columns"]
        group_by = config["group_by"]
        split_by = config["split_by"]
        aggregates = config["aggregates"]
        sort = config["sort"]

        def col_name(col):
            return expr if (expr := config["expressions"].get(col)) else f'"{col}"'

        def select_clause():
            if len(group_by) > 0:
                for col in columns:
                    yield f'{aggregates.get(col)}({col_name(col)}) as "{col}"'

                if len(split_by) == 0:
                    for idx, group in enumerate(group_by):
                        yield f"{col_name(group)} as __ROW_PATH_{idx}__"

                    groups = ", ".join(col_name(g) for g in group_by)
                    yield f"GROUPING_ID({groups}) AS __GROUPING_ID__"
            elif len(columns) > 0:
                for col in columns:
                    yield f'''{col_name(col)} as "{col.replace('"', '""')}"'''

        def order_by_clause():
            if len(group_by) > 0:
                for gidx in range(len(group_by)):
                    groups = ", ".join(col_name(g) for g in group_by[: (gidx + 1)])
                    if len(split_by) == 0:
                        yield f"""GROUPING_ID({groups}) DESC"""

                    for sort_col, sort_dir in sort:
                        if sort_dir != "none":
                            agg = aggregates.get(sort_col)
                            if gidx >= len(group_by) - 1:
                                yield f"{agg}({col_name(sort_col)}) {sort_dir}"
                            else:
                                yield f"""
                                    first({agg}({col_name(sort_col)}))
                                    OVER __WINDOW_{gidx}__ {sort_dir}
                                """

                    yield f"__ROW_PATH_{gidx}__  ASC"
            else:
                for sort_col, sort_dir in sort:
                    if sort_dir is not None:
                        yield f"{col_name(sort_col)} {sort_dir}"

        def window_clause():
            if len(config["sort"]) == 0:
                return

            for gidx in range(len(group_by) - 1):
                partition = ", ".join(f"__ROW_PATH_{i}__" for i in range(gidx + 1))
                sub_groups = ", ".join(col_name(g) for g in group_by[: (gidx + 1)])
                groups = ", ".join(col_name(g) for g in group_by)
                yield f"""
                    __WINDOW_{gidx}__ AS (
                        PARTITION BY
                            GROUPING_ID({sub_groups}),
                            {partition}
                        ORDER BY
                            {groups}
                )"""

        def where_clause():
            for name, op, value in config["filter"]:
                if value is not None:
                    term_lit = f"'{value}'" if isinstance(value, str) else str(value)
                    yield f"{col_name(name)} {op} {term_lit}"

        if len(split_by) > 0:
            query = "SELECT * FROM {}".format(table_name)
        else:
            query = "SELECT {} FROM {}".format(", ".join(select_clause()), table_name)

        # else:
        # for split in split_by:
        #     extra_cols_query = f"""
        #         SELECT DISTINCT {f'"{split}"'}
        #         FROM {table_name}
        #     """
        #     results = self.db.sql(extra_cols_query).fetchall()
        #     real_columns = []
        #     for result in results:
        #         for idx, col in enumerate(columns):
        #             real_columns.append(
        #                 f'"{result[0]}_{col}" AS "{result[0]}|{col}"'
        #             )

        if len(where := list(where_clause())) > 0:
            query = "{} WHERE {}".format(query, " AND ".join(where))

        if len(split_by) > 0:
            groups = ", ".join(col_name(x) for x in group_by)
            group_aliases = ", ".join(
                f"{col_name(x)} AS __ROW_PATH_{i}__" for i, x in enumerate(group_by)
            )

            query = f"""
            SELECT * EXCLUDE ({groups}), {group_aliases} FROM (
                PIVOT ({query})                
                ON {", ".join(f'"{c}"' for c in split_by)}
                USING {", ".join(select_clause())}
                GROUP BY {groups}
            )
            """

        elif len(group_by) > 0:
            groups = ", ".join(col_name(x) for x in group_by)
            query = f"{query} GROUP BY ROLLUP({groups})"

        if len(window := list(window_clause())) > 0:
            query = f"{query} WINDOW {', '.join(window)}"

        if len(order_by := list(order_by_clause())) > 0:
            query = f"{query} ORDER BY {', '.join(order_by)}"

        query = f"CREATE TEMPORARY TABLE {view_name} AS ({query})"
        run_query(self.db, query, execute=True)

    def table_validate_expression(self, view_name, expression):
        query = f"DESCRIBE (select {expression} from {view_name})"
        results = run_query(self.db, query)
        return duckdb_type_to_psp(results[0][1])

    def view_delete(self, view_name):
        query = f"DROP TABLE {view_name}"
        run_query(self.db, query, execute=True)

    def view_get_data(self, view_name, config, viewport, data):
        group_by = config["group_by"]
        split_by = config["split_by"]
        start_col = viewport.get("start_col")
        end_col = viewport.get("end_col")

        limit = ""
        if (end_row := viewport.get("end_row")) is not None:
            start_row = viewport.get("start_row", 0)
            limit = f"LIMIT {end_row - start_row} OFFSET {start_row}"

        col_limit = ""
        if end_col is not None:
            col_limit = f"LIMIT {end_col - start_col} OFFSET {start_col}"

        group_by_columns = ""
        if len(group_by) > 0:
            if len(split_by) == 0:
                row_paths = ["__GROUPING_ID__"]
            else:
                row_paths = []

            row_paths.extend(f"__ROW_PATH_{idx}__" for idx in range(len(group_by)))
            group_by_columns = f"{', '.join(row_paths)},"

        query = f"""
            SET VARIABLE col_names = (
                SELECT list(column_name) FROM (
                    SELECT column_name 
                    FROM (DESCRIBE {view_name})
                    WHERE not(starts_with(column_name, '__'))
                    {col_limit}
                )
            );

            SELECT
                {group_by_columns}
                COLUMNS(c -> list_contains(getvariable('col_names'), c))
            FROM {view_name} {limit}
        """

        results, columns, dtypes = run_query(self.db, query, columns=True)
        for cidx, col in enumerate(columns):
            if cidx == 0 and len(group_by) > 0 and len(split_by) == 0:
                continue

            group_by_index = None
            max_grouping_id = None
            if len(prefix := col.split("__ROW_PATH_")) > 1:
                group_by_index = int(prefix[1].split("__")[0])
                max_grouping_id = 2 ** (len(group_by) - group_by_index) - 1

            for ridx, row in enumerate(results):
                dtype = duckdb_type_to_psp(dtypes[cidx])
                if (
                    len(split_by) > 0
                    or max_grouping_id is None
                    or row[0] < max_grouping_id
                ):
                    data.set_col(
                        dtype,
                        col.replace("_", "|"),
                        ridx,
                        row[cidx],
                        group_by_index=group_by_index,
                    )


################################################################################
#
# DuckDB Utils


def val_to_duckdb_lit(value):
    """
    Convert a Python value to a string representation of this values suitable
    for SQL injecting.
    """
    if isinstance(value, str):
        return f"'{value}'"
    return str(value)


def sort_to_duckdb_sort(sortdir):
    if sortdir == "asc":
        return "ASC"
    if sortdir == "desc":
        return "DESC"
    return "DESC"


def duckdb_type_to_psp(name):
    """Convert a DuckDB `dtype` to a Perspective `ColumnType`."""
    if name == "VARCHAR":
        return "string"
    if name in ("DOUBLE", "BIGINT", "HUGEINT"):
        return "float"
    if name == "INTEGER":
        return "integer"
    if name == "DATE":
        return "date"
    if name == "BOOLEAN":
        return "boolean"
    if name == "TIMESTAMP":
        return "datetime"

    msg = f"Unknown type '{name}'"
    raise ValueError(msg)


def run_query(db, query, execute=False, columns=False):
    query = " ".join(query.split())
    start = datetime.now()
    result = None
    try:
        if execute:
            db.execute(query)
        else:
            req = db.sql(query)
            result = req.fetchall()
    except (duckdb.ParserException, duckdb.BinderException) as e:
        logger.error(e)
        logger.error(f"{query}")
        raise e
    else:
        logger.debug(f"{datetime.now() - start} {query}")
        if columns:
            return (result, req.columns, req.dtypes)
        else:
            return result
