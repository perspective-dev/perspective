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
    "kahan_sum",
    "last",
    "max",
    "min",
    "product",
    "string_agg",
    "sumkahan",
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


class ClickhouseVirtualSession:
    def __init__(self, callback, db):
        self.session = perspective.VirtualServer(ClickhouseVirtualServerHandler(db))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class ClickhouseVirtualServer:
    def __init__(self, db):
        self.db = db

    def new_session(self, callback):
        return ClickhouseVirtualSession(callback, self.db)


class ClickhouseVirtualServerHandler(VirtualServerHandler):
    """
    An implementation of a `perspective.VirtualServerHandler` for ClickHouse.
    """

    def __init__(self, db):
        self.db = db
        self.sql_builder = perspective.GenericSQLVirtualServerModel(
            {"create_entity": "VIEW", "grouping_fn": "GROUPING"}
        )

    def get_features(self):
        return {
            "group_by": True,
            "split_by": False,
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
        query = "SHOW TABLES"
        results = run_query(self.db, query)
        return [result[0] for result in results]

    def table_schema(self, table_name, config=None):
        query = self.sql_builder.table_schema(table_name)
        results = run_query(self.db, query)
        schema = {}
        for result in results:
            col_name = result[0]
            if not col_name.startswith("__"):
                schema[col_name] = clickhouse_type_to_psp(result[1])

        return schema

    def view_column_size(self, view_name, config):
        query = f"SELECT COUNT() FROM system.columns WHERE table = '{view_name}'"
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
        return clickhouse_type_to_psp(results[0][1])

    def view_delete(self, view_name):
        query = self.sql_builder.view_delete(view_name)
        run_query(self.db, query, execute=True)

    def view_get_data(self, view_name, config, schema, viewport, data):
        group_by = config["group_by"]
        split_by = config["split_by"]
        query = self.sql_builder.view_get_data(view_name, config, viewport, schema)
        results, columns, dtypes = run_query(self.db, query, columns=True)
        for cidx, col in enumerate(columns):
            if cidx == 0 and len(group_by) > 0 and len(split_by) == 0:
                continue

            if len(split_by) > 0 and not col.startswith("__ROW_PATH_"):
                col = col.replace("_", "|")

            # print(
            #     dtypes[cidx], type(dtypes[cidx]), dir(dtypes[cidx]), dtypes[cidx].name
            # )

            dtype = clickhouse_type_to_psp(str(dtypes[cidx]))
            for ridx, row in enumerate(results):
                grouping_id = (
                    row[0] if len(group_by) > 0 and len(split_by) == 0 else None
                )

                value = row[cidx]
                if dtype == "string" and not isinstance(value, str):
                    value = str(value)

                data.set_col(dtype, col, ridx, value, grouping_id)


################################################################################
#
# ClickHouse Utils


def clickhouse_type_to_psp(name):
    """Convert a ClickHouse `dtype` to a Perspective `ColumnType`."""
    if name.startswith("Nullable(") and name.endswith(")"):
        name = name[9:-1]

    if name.startswith("Array"):
        return "string"

    if name in ("Int64", "UInt64", "Float64"):
        return "float"

    if name == "String":
        return "string"

    if name == "DateTime":
        return "datetime"

    if name == "Date":
        return "date"

    msg = f"Unknown type '{name}'"
    raise ValueError(msg)


def run_query(db, query, execute=False, columns=False):
    query = " ".join(query.split())
    start = datetime.now()
    result = None
    try:
        if execute:
            db.command(query)
        else:
            req = db.query(query)
            result = req.result_rows
    except Exception as e:
        logger.error(e)
        logger.error(f"{query}")
        raise e
    else:
        logger.debug(f"{datetime.now() - start} {query}")
        if columns:
            return (
                result,
                req.column_names,
                [(x.name if hasattr(x, "name") else str(x)) for x in req.column_types],
            )
        else:
            return result
