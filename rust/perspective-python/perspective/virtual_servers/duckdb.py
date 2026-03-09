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
import logging

from perspective.virtual_servers import VirtualServerHandler

logger = logging.getLogger(__name__)

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
        self.session = perspective.VirtualServer(DuckDBVirtualServerHandler(db))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class DuckDBVirtualServer:
    def __init__(self, db):
        self.db = db

    def new_session(self, callback):
        return DuckDBVirtualSession(callback, self.db)


class DuckDBVirtualServerHandler(VirtualServerHandler):
    """
    An implementation of a `perspective.VirtualServerHandler` for DuckDB.
    """

    def __init__(self, db):
        self.db = db
        self.sql_builder = perspective.GenericSQLVirtualServerModel({})

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
        query = self.sql_builder.get_hosted_tables()
        results = run_query(self.db, query)
        return [f"{result[0]}.{result[2]}" for result in results]

    def table_schema(self, table_name, config=None):
        query = self.sql_builder.table_schema(table_name)
        results = run_query(self.db, query)
        schema = {}
        for result in results:
            col_name = result[0]
            if not col_name.startswith("__"):
                schema[col_name] = duckdb_type_to_psp(result[1])

        return schema

    def view_column_size(self, table_name, config):
        query = self.sql_builder.view_column_size(table_name)
        results = run_query(self.db, query)
        gs = len(config["group_by"])
        return results[0][0] - (
            0 if gs == 0 else gs + (1 if len(config["split_by"]) == 0 else 0)
        )

    def table_size(self, table_name):
        query = self.sql_builder.table_size(table_name)
        results = run_query(self.db, query)
        return results[0][0]

    def table_make_view(self, table_name, view_name, config):
        query = self.sql_builder.table_make_view(table_name, view_name, config)
        run_query(self.db, query, execute=True)

    def table_validate_expression(self, view_name, expression):
        query = self.sql_builder.table_validate_expression(view_name, expression)
        results = run_query(self.db, query)
        return duckdb_type_to_psp(results[0][1])

    def view_delete(self, view_name):
        query = self.sql_builder.view_delete(view_name)
        run_query(self.db, query, execute=True)

    def view_get_data(self, view_name, config, schema, viewport, data):
        group_by = config["group_by"]
        split_by = config["split_by"]
        is_group_by = len(group_by) > 0
        is_split_by = len(split_by) > 0
        query = self.sql_builder.view_get_data(view_name, config, viewport, schema)
        results, columns, dtypes = run_query(self.db, query, columns=True)
        for cidx, col in enumerate(columns):
            if cidx == 0 and is_group_by:
                continue

            if is_split_by and not col.startswith("__"):
                col = col.replace("_", "|")

            dtype = duckdb_type_to_psp(str(dtypes[cidx]))
            for ridx, row in enumerate(results):
                grouping_id = row[0] if is_group_by else None
                data.set_col(dtype, col, ridx, row[cidx], grouping_id)


################################################################################
#
# DuckDB Utils


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
