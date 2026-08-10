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

import io
import duckdb
import perspective
import pyarrow.ipc as ipc

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

# Window functions, in DuckDB's own vocabulary - the advertised name is the
# SQL function, emitted verbatim. `frames` are the frame kinds the function
# accepts (empty = none), and `result_type` is the output column type, omitted
# where it is the source column's.
#
# Result types follow `duckdb_type_to_psp`: DuckDB's counts and ranks are
# `BIGINT`, which Perspective's 32-bit `integer` cannot hold, so they are
# `float` - the same mapping the view's own schema will report.
FRAMES = ["rows", "range", "cumulative"]

WINDOW_AGGREGATES = [
    {"name": "sum", "frames": FRAMES, "result_type": "float"},
    {"name": "avg", "frames": FRAMES, "result_type": "float"},
    {"name": "count", "frames": FRAMES, "result_type": "float"},
    {"name": "min", "frames": FRAMES},
    {"name": "max", "frames": FRAMES},
    {"name": "product", "frames": FRAMES, "result_type": "float"},
    {"name": "median", "frames": FRAMES, "result_type": "float"},
    # DuckDB spells sample and population variants separately, so both are
    # offered rather than one being picked on the user's behalf.
    {"name": "stddev_samp", "frames": FRAMES, "result_type": "float"},
    {"name": "stddev_pop", "frames": FRAMES, "result_type": "float"},
    {"name": "var_samp", "frames": FRAMES, "result_type": "float"},
    {"name": "var_pop", "frames": FRAMES, "result_type": "float"},
    # Navigation.
    {"name": "first_value", "frames": FRAMES},
    {"name": "last_value", "frames": FRAMES},
    {"name": "nth_value", "frames": FRAMES, "offset": True},
    {"name": "lag", "offset": True},
    {"name": "lead", "offset": True},
    # Ranking. These take no source column - the window's `order_by` is their
    # input - but Perspective requires one, so the choice of source is
    # immaterial for them.
    {"name": "row_number", "result_type": "float"},
    {"name": "rank", "result_type": "float"},
    {"name": "dense_rank", "result_type": "float"},
    {"name": "percent_rank", "result_type": "float"},
    {"name": "cume_dist", "result_type": "float"},
    # `ntile`'s argument is a bucket count rather than a row offset.
    {"name": "ntile", "offset": True, "result_type": "float"},
    # Perspective's own, with no DuckDB equivalent - the SQL translation
    # synthesizes them from `lag` and `first_value`.
    {"name": "diff", "offset": True, "result_type": "float"},
    {"name": "rate", "frames": ["range"], "result_type": "float"},
]

# Arithmetic is undefined for the non-numeric types; ordering and navigation
# are not.
WINDOW_AGGREGATES_ANY = [
    {"name": "count", "frames": FRAMES, "result_type": "float"},
    {"name": "min", "frames": FRAMES},
    {"name": "max", "frames": FRAMES},
    {"name": "first_value", "frames": FRAMES},
    {"name": "last_value", "frames": FRAMES},
    {"name": "nth_value", "frames": FRAMES, "offset": True},
    {"name": "lag", "offset": True},
    {"name": "lead", "offset": True},
    {"name": "row_number", "result_type": "float"},
    {"name": "rank", "result_type": "float"},
    {"name": "dense_rank", "result_type": "float"},
    {"name": "percent_rank", "result_type": "float"},
    {"name": "cume_dist", "result_type": "float"},
    {"name": "ntile", "offset": True, "result_type": "float"},
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
            "split_rollup_mode": ["flat", "rollup"],
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
            "window_aggregates": {
                "integer": WINDOW_AGGREGATES,
                "float": WINDOW_AGGREGATES,
                "string": WINDOW_AGGREGATES_ANY,
                "boolean": WINDOW_AGGREGATES_ANY,
                "date": WINDOW_AGGREGATES_ANY,
                "datetime": WINDOW_AGGREGATES_ANY,
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

    def view_get_min_max(self, view_name, column_name, config):
        query = self.sql_builder.view_get_min_max(view_name, column_name, config)
        results = run_query(self.db, query)
        row = results[0]
        return (row[0], row[1])

    def view_get_data(self, view_name, config, schema, viewport, data):
        query = self.sql_builder.view_get_data(view_name, config, viewport, schema)
        result = self.db.sql(query)
        arrow_table = result.fetch_arrow_table()
        buf = io.BytesIO()
        with ipc.new_stream(buf, arrow_table.schema) as writer:
            writer.write_table(arrow_table)
        data.from_arrow_ipc(buf.getvalue())


################################################################################
#
# DuckDB Utils


def duckdb_type_to_psp(name):
    """Convert a DuckDB `dtype` to a Perspective `ColumnType`.

    Must agree with `coerce_column` in `perspective-client`, which decides
    the Arrow type the same column's data arrives as - a column declared
    `integer` whose data coerces to `Float64` gets numeric filters the
    engine then rejects. The mapping is duplicated in `duckdb.ts` for
    DuckDB WASM; change both.

    `BIGINT` and wider go to `float` because Perspective's `integer` is
    32-bit, matching the `Int64 -> Float64` coercion. `TIME` goes to
    `datetime` because that is what `Time32`/`Time64` coerce to.
    """
    name = name.upper()

    if name.startswith("BOOL"):
        return "boolean"

    # 32-bit and narrower - `coerce_column` widens these to `Int32`.
    if name in ("TINYINT", "SMALLINT", "INTEGER", "UTINYINT", "USMALLINT"):
        return "integer"

    # Wider than `Int32`, or fractional - all coerce to `Float64`.
    if (
        name in ("BIGINT", "HUGEINT", "UHUGEINT", "UINTEGER", "UBIGINT")
        or name in ("FLOAT", "REAL", "DOUBLE", "VARINT")
        or name.startswith("DECIMAL")
        or name.startswith("NUMERIC")
    ):
        return "float"

    if name.startswith("DATE"):
        return "date"

    # `TIMESTAMP`, `TIMESTAMPTZ`, `TIMESTAMP_NS`, and `TIME`/`TIMETZ`,
    # which coerce to `Timestamp(Millisecond)` rather than to a number.
    if name.startswith("TIME"):
        return "datetime"

    # Everything else renders as text: `VARCHAR`, `ENUM(...)` (which
    # arrives dictionary-encoded), `JSON`, `UUID`, `BLOB`, `INTERVAL`,
    # and the nested types.
    if not (
        name.startswith("VARCHAR")
        or name.startswith("ENUM")
        or name in ("JSON", "UUID", "BLOB", "BIT", "INTERVAL")
        or name.startswith("STRUCT")
        or name.startswith("MAP")
        or name.startswith("UNION")
        or name.endswith("[]")
    ):
        # Unknown, not fatal - the column still renders, as text. Raising
        # here would take down the whole table for one odd column.
        logger.warning(f"Unknown type '{name}'")

    return "string"


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
