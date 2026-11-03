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

from datetime import datetime, timedelta, timezone
import json
import logging

from perspective.virtual_servers import VirtualServerHandler, sql_table_describe

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

# Window functions. Renamed from Perspective's `stddev`/`var` to the SQL
# standard spellings DuckDB and ClickHouse both accept, since the advertised
# name is now emitted verbatim.
#
# NOTE: this set is inherited from the DuckDB handler and has NOT been audited
# against a live ClickHouse - see the aggregate lists below, which have the
# same problem. ClickHouse's own navigation functions are `lagInFrame` /
# `leadInFrame`, and its ranking set differs; both need verifying before being
# advertised here.
FRAMES = ["rows", "range", "cumulative"]

WINDOW_AGGREGATES = [
    {"name": "sum", "frames": FRAMES, "result_type": "float"},
    {"name": "avg", "frames": FRAMES, "result_type": "float"},
    {"name": "count", "frames": FRAMES, "result_type": "float"},
    {"name": "min", "frames": FRAMES},
    {"name": "max", "frames": FRAMES},
    {"name": "stddev_samp", "frames": FRAMES, "result_type": "float"},
    {"name": "var_samp", "frames": FRAMES, "result_type": "float"},
    {"name": "lag", "offset": True},
    {"name": "lead", "offset": True},
    {"name": "diff", "offset": True, "result_type": "float"},
    {"name": "rate", "frames": ["range"], "result_type": "float"},
    {"name": "row_number", "result_type": "float"},
]

WINDOW_AGGREGATES_ANY = [
    {"name": "count", "frames": FRAMES, "result_type": "float"},
    {"name": "min", "frames": FRAMES},
    {"name": "max", "frames": FRAMES},
    {"name": "lag", "offset": True},
    {"name": "lead", "offset": True},
    {"name": "row_number", "result_type": "float"},
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

    def close(self):
        session, self.session, self.callback = self.session, None, None
        if session is not None:
            session.close()


class ClickhouseVirtualServer:
    def __init__(self, db):
        self.db = db

    def new_session(self, callback):
        return ClickhouseVirtualSession(callback, self.db)


SYSTEM_DATABASES = ("system", "INFORMATION_SCHEMA", "information_schema")


class ClickhouseVirtualServerHandler(VirtualServerHandler):
    """
    An implementation of a `perspective.VirtualServerHandler` for ClickHouse.

    Hosts every table and view of every database the connection can read,
    except ClickHouse's own catalog - by bare name in the connection's
    current database, otherwise as `database.table`. The views this handler
    creates (named by the client's random view ids) are tracked and never
    hosted.
    """

    def __init__(self, db):
        self.db = db
        self.sql_builder = perspective.GenericSQLVirtualServerModel(
            {"create_entity": "VIEW", "grouping_fn": "GROUPING", "unordered": True}
        )
        self._own_entities = set()

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
            # ClickHouse has no stable `rowid`, so natural-order windows are
            # unsupported.
            "unordered": True,
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
        excluded = ", ".join(f"'{db}'" for db in SYSTEM_DATABASES)
        query = f"""
            SELECT database, name, database = currentDatabase()
            FROM system.tables
            WHERE database NOT IN ({excluded}) AND NOT is_temporary
            ORDER BY database, name
        """
        results = run_query(self.db, query)
        return [
            self.sql_builder.table_path([name] if current else [database, name])
            for database, name, current in results
            if not (current and name in self._own_entities)
        ]

    def table_schema(self, table_name, config=None):
        query = self.sql_builder.table_schema(table_name)
        results = run_query(self.db, query)
        schema = {}
        for result in results:
            col_name = result[0]
            if not col_name.startswith("__"):
                schema[col_name] = clickhouse_type_to_psp(result[1], col_name)

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
        # Window order keys need column types for `range` frame emission.
        schema = self.table_schema(table_name) if config.get("windows") else None
        query = self.sql_builder.table_make_view(table_name, view_name, config, schema)
        run_query(self.db, query, execute=True)
        self._own_entities.add(view_name)

    def table_describe(self, table_name, config):
        schema = self.table_schema(table_name) if config.get("windows") else None
        return sql_table_describe(
            self.sql_builder, table_name, config, self._describe_query, schema
        )

    def _describe_query(self, query):
        return {
            row[0]: clickhouse_type_to_psp(row[1], row[0])
            for row in run_query(self.db, query)
            if not row[0].startswith("__")
        }

    def view_delete(self, view_name):
        query = self.sql_builder.view_delete(view_name)
        run_query(self.db, query, execute=True)
        self._own_entities.discard(view_name)

    def view_get_min_max(self, view_name, column_name, config):
        query = self.sql_builder.view_get_min_max(view_name, column_name, config)
        results, _columns, dtypes = run_query(self.db, query, columns=True)
        row = results[0]
        return tuple(
            clickhouse_to_py(value, clickhouse_type_to_psp(str(dtype)))
            for value, dtype in zip(row, dtypes)
        )

    def view_get_data(self, view_name, config, schema, viewport, data):
        group_by = config["group_by"]
        is_flat = config.get("group_rollup_mode", "rollup") == "flat"
        query = self.sql_builder.view_get_data(view_name, config, viewport, schema)
        results, columns, dtypes = run_query(self.db, query, columns=True)
        grouping_idx = (
            columns.index("__GROUPING_ID__") if "__GROUPING_ID__" in columns else None
        )

        for cidx, col in enumerate(columns):
            dtype = clickhouse_type_to_psp(str(dtypes[cidx]), col)
            for ridx, row in enumerate(results):
                if len(group_by) == 0:
                    grouping_id = None
                elif is_flat or grouping_idx is None:
                    grouping_id = 0
                else:
                    grouping_id = row[grouping_idx]

                value = clickhouse_to_py(row[cidx], dtype)
                data.set_col(dtype, col, ridx, value, grouping_id)


################################################################################
#
# ClickHouse Utils


_INTEGER_TYPES = frozenset(["Int8", "Int16", "Int32", "UInt8", "UInt16"])
_FLOAT_TYPES = frozenset(
    [
        "UInt32",
        "UInt64",
        "UInt128",
        "UInt256",
        "Int64",
        "Int128",
        "Int256",
        "Float32",
        "Float64",
        "BFloat16",
    ]
)
_DATE_TYPES = frozenset(["Date", "Date32"])

_TRANSPARENT_WRAPPERS = ("Nullable(", "LowCardinality(", "SimpleAggregateFunction(")


def _unwrap_type(name):
    name = name.strip()
    while True:
        for wrapper in _TRANSPARENT_WRAPPERS:
            if name.startswith(wrapper) and name.endswith(")"):
                inner = name[len(wrapper) : -1]
                if wrapper == "SimpleAggregateFunction(":
                    inner = inner.split(",", 1)[-1]

                name = inner.strip()
                break
        else:
            return name


def clickhouse_type_to_psp(name, col_name=""):
    base = _unwrap_type(name)
    if base in _INTEGER_TYPES:
        return "integer"

    if base in _FLOAT_TYPES or base.startswith("Decimal"):
        return "float"

    if base == "Bool":
        return "boolean"

    if base in _DATE_TYPES:
        return "date"

    if base.startswith("DateTime") or base.startswith("Time"):
        return "datetime"

    if not (
        base.startswith("String")
        or base.startswith("FixedString")
        or base.startswith("Enum")
    ):
        logger.debug(f"Rendering type '{name}' of column '{col_name}' as string")

    return "string"


def clickhouse_to_py(value, dtype):
    if value is None:
        return None

    if dtype == "datetime":
        if isinstance(value, timedelta):
            return int(value.total_seconds() * 1000)

        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)

            return int(value.timestamp() * 1000)

        return value

    if dtype == "float":
        return float(value)

    if dtype == "string":
        if isinstance(value, str):
            return value

        if isinstance(value, bytes):
            return value.rstrip(b"\x00").decode("utf-8", errors="replace")

        if isinstance(value, (dict, list, tuple)):
            return json.dumps(value, default=str)

        return str(value)

    return value


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
