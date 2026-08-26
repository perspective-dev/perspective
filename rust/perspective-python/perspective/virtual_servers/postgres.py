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


import json
import logging
from datetime import date, datetime, time, timezone
from decimal import Decimal

import psycopg

import perspective
from perspective.virtual_servers import VirtualServerHandler

logger = logging.getLogger(__name__)

# Requires PostgreSQL >= 16: `any_value` is both advertised below and the SQL
# builder's fallback aggregate for columns with no explicit aggregate.
#
# Aggregates, in Postgres's own vocabulary. Only single-argument aggregates
# with scalar results are expressible - the builder emits `{agg}({col})`, so
# e.g. two-argument `string_agg` cannot be advertised.
INT_AGGS = [
    "sum",
    "avg",
    "count",
    "min",
    "max",
    "stddev",
    "stddev_pop",
    "stddev_samp",
    "variance",
    "var_pop",
    "var_samp",
    "bit_and",
    "bit_or",
    "bit_xor",
    "any_value",
]

# `bit_and`/`bit_or`/`bit_xor` are defined for integral types only.
FLOAT_AGGS = [a for a in INT_AGGS if not a.startswith("bit_")]

STRING_AGGS = [
    "count",
    "min",
    "max",
    "any_value",
]

# Postgres has no `min(boolean)`/`max(boolean)`.
BOOL_AGGS = [
    "count",
    "bool_and",
    "bool_or",
    "every",
    "any_value",
]

# Window functions, in Postgres's own vocabulary - the advertised name is the
# SQL function, emitted verbatim. Excluded relative to the DuckDB handler:
# `product` and `median` (no such functions in Postgres), `rate` (its
# synthesis casts the order key to DOUBLE PRECISION, which errors for
# timestamp keys). `range` frames are advertised only for numeric source
# types - Postgres `RANGE n PRECEDING` requires a numeric order key, and
# errors on timestamps without an interval literal.
FRAMES = ["rows", "range", "cumulative"]
FRAMES_ANY = ["rows", "cumulative"]

WINDOW_AGGREGATES = [
    {"name": "sum", "frames": FRAMES, "result_type": "float"},
    {"name": "avg", "frames": FRAMES, "result_type": "float"},
    {"name": "count", "frames": FRAMES, "result_type": "float"},
    {"name": "min", "frames": FRAMES},
    {"name": "max", "frames": FRAMES},
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
    # immaterial for them. Ranks are `bigint`, which Perspective's 32-bit
    # `integer` cannot hold, so they are `float`.
    {"name": "row_number", "result_type": "float"},
    {"name": "rank", "result_type": "float"},
    {"name": "dense_rank", "result_type": "float"},
    {"name": "percent_rank", "result_type": "float"},
    {"name": "cume_dist", "result_type": "float"},
    # `ntile`'s argument is a bucket count rather than a row offset.
    {"name": "ntile", "offset": True, "result_type": "float"},
    # Perspective's own, with no Postgres equivalent - the SQL translation
    # synthesizes it from `lag`.
    {"name": "diff", "offset": True, "result_type": "float"},
]

# Arithmetic is undefined for the non-numeric types; ordering and navigation
# are not.
WINDOW_AGGREGATES_ANY = [
    {"name": "count", "frames": FRAMES_ANY, "result_type": "float"},
    {"name": "min", "frames": FRAMES_ANY},
    {"name": "max", "frames": FRAMES_ANY},
    {"name": "first_value", "frames": FRAMES_ANY},
    {"name": "last_value", "frames": FRAMES_ANY},
    {"name": "nth_value", "frames": FRAMES_ANY, "offset": True},
    {"name": "lag", "offset": True},
    {"name": "lead", "offset": True},
    {"name": "row_number", "result_type": "float"},
    {"name": "rank", "result_type": "float"},
    {"name": "dense_rank", "result_type": "float"},
    {"name": "percent_rank", "result_type": "float"},
    {"name": "cume_dist", "result_type": "float"},
    {"name": "ntile", "offset": True, "result_type": "float"},
]

COMPARE_OPS = [
    "==",
    "!=",
    "IS DISTINCT FROM",
    "IS NOT DISTINCT FROM",
    ">=",
    "<=",
    ">",
    "<",
]

# `LIKE` only for strings - Postgres does not implicitly cast its operand.
STRING_FILTER_OPS = COMPARE_OPS + ["LIKE"]


class PostgresVirtualSession:
    def __init__(self, callback, conninfo):
        self.session = perspective.VirtualServer(PostgresVirtualServerHandler(conninfo))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class PostgresVirtualServer:
    def __init__(self, conninfo=""):
        self.conninfo = conninfo

    def new_session(self, callback):
        return PostgresVirtualSession(callback, self.conninfo)


class PostgresVirtualServerHandler(VirtualServerHandler):
    """
    An implementation of a `perspective.VirtualServerHandler` for PostgreSQL
    (16 or later, for `any_value`).

    Each handler owns one connection, and views are created as `TEMPORARY
    VIEW`s: view names are connection-scoped so sessions cannot collide, every
    viewport read re-plans the view's inner `ORDER BY` (a materialized
    `CREATE TABLE AS` would depend on seq-scan order, which Postgres does not
    guarantee), and all views drop automatically on disconnect.
    """

    def __init__(self, conninfo):
        self.db = psycopg.connect(conninfo, autocommit=True)
        self.sql_builder = perspective.GenericSQLVirtualServerModel(
            {
                "create_entity": "TEMPORARY VIEW",
                "drop_entity": "VIEW",
                "grouping_fn": "GROUPING",
                "row_id_expr": "ctid",
                "like_escape_clause": "\\",
                "regex_fn": "regexp_like",
            }
        )

    def get_features(self):
        return {
            "group_by": True,
            # Postgres has no `PIVOT`; pivoting needs a two-pass
            # filtered-aggregate strategy the SQL builder does not yet have.
            "split_by": False,
            "sort": True,
            "expressions": True,
            "group_rollup_mode": ["rollup", "flat", "total"],
            # `ctid` is not a stable row identity, so natural-order windows
            # are unsupported.
            "unordered": True,
            "filter_ops": {
                "integer": COMPARE_OPS,
                "float": COMPARE_OPS,
                "string": STRING_FILTER_OPS,
                "boolean": COMPARE_OPS,
                "date": COMPARE_OPS,
                "datetime": COMPARE_OPS,
            },
            "aggregates": {
                "integer": INT_AGGS,
                "float": FLOAT_AGGS,
                "string": STRING_AGGS,
                "boolean": BOOL_AGGS,
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
        # `information_schema.tables` omits materialized views, so query the
        # catalog directly.
        query = """
            SELECT n.nspname, c.relname
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'v', 'm', 'f', 'p')
                AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                AND n.nspname NOT LIKE 'pg_toast%'
                AND n.nspname NOT LIKE 'pg_temp%'
            ORDER BY 1, 2
        """
        results = run_query(self.db, query)
        return [f"{result[0]}.{result[1]}" for result in results]

    def _describe(self, entity_id):
        """The column name/OID pairs of any relation or query result.

        `SELECT ... LIMIT 0` planning is the one schema mechanism that works
        uniformly for tables, temporary views (which hide in `pg_temp`), and
        expression validation - Postgres has no `DESCRIBE`.
        """
        cur = run_query(self.db, f"SELECT * FROM {entity_id} LIMIT 0", cursor=True)
        return [(d.name, d.type_code) for d in cur.description]

    def table_schema(self, table_name, config=None):
        schema = {}
        for col_name, oid in self._describe(table_name):
            if not col_name.startswith("__"):
                schema[col_name] = pg_oid_to_psp(oid, col_name)

        return schema

    def view_column_size(self, view_name, config):
        n = len(self._describe(view_name))
        gs = len(config["group_by"])
        if gs > 0:
            # Group views carry `__ROW_PATH_N__` columns, plus
            # `__GROUPING_ID__` except in flat mode.
            n -= gs
            if config.get("group_rollup_mode", "rollup") != "flat":
                n -= 1

        return n

    def table_size(self, table_name):
        query = self.sql_builder.table_size(table_name)
        results = run_query(self.db, query)
        return results[0][0]

    def table_make_view(self, table_name, view_name, config):
        # Window order keys need column types for `range` frame emission.
        schema = self.table_schema(table_name) if config.get("windows") else None
        query = self.sql_builder.table_make_view(table_name, view_name, config, schema)
        run_query(self.db, query, execute=True)

    def table_validate_expression(self, view_name, expression):
        cur = run_query(
            self.db,
            f"SELECT {expression} FROM {view_name} LIMIT 0",
            cursor=True,
        )

        return pg_oid_to_psp(cur.description[0].type_code, expression)

    def view_delete(self, view_name):
        query = self.sql_builder.view_delete(view_name)
        run_query(self.db, query, execute=True)

    def view_get_min_max(self, view_name, column_name, config):
        query = self.sql_builder.view_get_min_max(view_name, column_name, config)
        results = run_query(self.db, query)
        row = results[0]
        return (pg_to_py(row[0]), pg_to_py(row[1]))

    def view_get_data(self, view_name, config, schema, viewport, data):
        group_by = config["group_by"]
        is_flat = config.get("group_rollup_mode", "rollup") == "flat"
        query = self.sql_builder.view_get_data(view_name, config, viewport, schema)
        cur = run_query(self.db, query, cursor=True)
        results = cur.fetchall()
        for cidx, desc in enumerate(cur.description):
            dtype = pg_oid_to_psp(desc.type_code, desc.name)
            for ridx, row in enumerate(results):
                # `__ROW_PATH_N__` cells are kept only while the row's
                # grouping id marks that level as un-rolled-up; flat views
                # have no `__GROUPING_ID__` column and keep every level.
                if len(group_by) == 0:
                    grouping_id = None
                elif is_flat:
                    grouping_id = 0
                else:
                    grouping_id = row[0]

                value = pg_to_py(row[cidx])
                if (
                    dtype == "string"
                    and value is not None
                    and not isinstance(value, str)
                ):
                    value = str(value)

                data.set_col(dtype, desc.name, ridx, value, grouping_id)


################################################################################
#
# Postgres Utils

# Standard `pg_type` OIDs, stable across every supported Postgres version.
_BOOL_OIDS = frozenset([16])
_INT_OIDS = frozenset([21, 23])  # int2, int4
_FLOAT_OIDS = frozenset(
    [20, 26, 700, 701, 790, 1700]
)  # int8, oid, float4/8, money, numeric
_DATE_OIDS = frozenset([1082])
_DATETIME_OIDS = frozenset([1083, 1114, 1184, 1266])  # time, timestamp(tz), timetz
_STRING_OIDS = frozenset(
    [
        17,  # bytea
        18,  # char
        19,  # name
        25,  # text
        114,  # json
        142,  # xml
        1042,  # bpchar
        1043,  # varchar
        1186,  # interval
        2950,  # uuid
        3802,  # jsonb
    ]
)


def pg_oid_to_psp(oid, col_name=""):
    """Convert a `pg_type` OID to a Perspective `ColumnType`.

    Must agree with the value normalization in `pg_to_py`, which decides the
    Python value the same column's data arrives as - the two are halves of
    one contract.

    `int8` and `numeric` go to `float` because Perspective's `integer` is
    32-bit; `time` goes to `datetime` because it renders as one. Everything
    unrecognized - arrays, enums, ranges, user-defined types - renders as
    text. Unknown is not fatal: raising here would take down the whole table
    for one odd column.
    """
    if oid in _BOOL_OIDS:
        return "boolean"

    if oid in _INT_OIDS:
        return "integer"

    if oid in _FLOAT_OIDS:
        return "float"

    if oid in _DATE_OIDS:
        return "date"

    if oid in _DATETIME_OIDS:
        return "datetime"

    if oid not in _STRING_OIDS:
        logger.warning(f"Unknown type OID '{oid}' for column '{col_name}'")

    return "string"


def pg_to_py(value):
    """Normalize a psycopg result value for `PerspectiveColumn.set_col`.

    `datetime` first: it subclasses `date`, and the binding's date branch
    would truncate the time-of-day. Naive timestamps are taken as UTC (the
    engine's convention); `time` renders on the epoch date, matching how
    narrower temporal types coerce in the Arrow path.
    """
    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return int(value.timestamp() * 1000)

    if isinstance(value, time):
        return pg_to_py(datetime.combine(date(1970, 1, 1), value))

    if isinstance(value, (dict, list)):
        return json.dumps(value)

    return value


def run_query(db, query, execute=False, cursor=False):
    query = " ".join(query.split())
    start = datetime.now(datetime.UTC)
    try:
        cur = db.execute(query)
    except psycopg.Error as e:
        logger.error(e)
        logger.error(f"{query}")
        raise
    else:
        logger.debug(f"{datetime.now(datetime.UTC) - start} {query}")
        if cursor:
            return cur
        elif not execute:
            return cur.fetchall()
