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

import os
import tempfile
import urllib.request
from datetime import datetime

import pytest

psycopg = pytest.importorskip("psycopg")
pq = pytest.importorskip("pyarrow.parquet")

from perspective import Client
from perspective.virtual_servers.postgres import PostgresVirtualServer

# Set `PSP_TEST_POSTGRES_DSN` to point these tests at a server; without a
# reachable PostgreSQL >= 16 they skip rather than fail.
DSN = os.environ.get("PSP_TEST_POSTGRES_DSN", "postgresql:///postgres")

_SUPERSTORE_LOCAL = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "..",
    "node_modules",
    "superstore-arrow",
    "superstore.parquet",
)

_SUPERSTORE_URL = (
    "https://cdn.jsdelivr.net/npm/superstore-arrow@3.2.0/superstore.parquet"
)


def _get_superstore_parquet():
    if os.path.exists(_SUPERSTORE_LOCAL):
        return _SUPERSTORE_LOCAL
    path = os.path.join(tempfile.gettempdir(), "superstore.parquet")
    if not os.path.exists(path):
        urllib.request.urlretrieve(_SUPERSTORE_URL, path)
    return path


# Perspective-relevant Postgres types per superstore column - `BIGINT` and
# `DOUBLE PRECISION` both present as `float`, matching the DuckDB handler's
# schema for the same dataset.
_SUPERSTORE_TYPES = {
    "Row ID": "INTEGER",
    "Order ID": "TEXT",
    "Order Date": "DATE",
    "Ship Date": "DATE",
    "Ship Mode": "TEXT",
    "Customer ID": "TEXT",
    "Customer Name": "TEXT",
    "Segment": "TEXT",
    "Country": "TEXT",
    "City": "TEXT",
    "State": "TEXT",
    "Postal Code": "BIGINT",
    "Region": "TEXT",
    "Product ID": "TEXT",
    "Category": "TEXT",
    "Sub-Category": "TEXT",
    "Product Name": "TEXT",
    "Sales": "DOUBLE PRECISION",
    "Quantity": "INTEGER",
    "Discount": "DOUBLE PRECISION",
    "Profit": "DOUBLE PRECISION",
}


def _load_superstore(conn):
    arrow_table = pq.read_table(_get_superstore_parquet())
    names = arrow_table.schema.names
    cols = ", ".join(f'"{name}" {_SUPERSTORE_TYPES[name]}' for name in names)
    conn.execute(f"CREATE TABLE psp_test.superstore ({cols})")
    with conn.cursor() as cur:
        with cur.copy('COPY psp_test.superstore FROM STDIN') as copy:
            for row in arrow_table.to_pylist():
                copy.write_row(
                    tuple(
                        v.date() if isinstance(v, datetime) else v
                        for v in (row[name] for name in names)
                    )
                )


def _load_coerce_types(conn):
    """A column of each Postgres type whose Perspective type is not its own.

    `mood` is the interesting one: enum OIDs are user-defined and unknown to
    the OID map, so the column must fall back to `string` rather than fail.
    """
    conn.execute("CREATE TYPE psp_test.mood AS ENUM ('happy', 'sad')")
    conn.execute("""
        CREATE TABLE psp_test.coerce_types (
            "small" SMALLINT,
            "big" BIGINT,
            "float" REAL,
            "decimal" NUMERIC(18, 3),
            "time" TIME,
            "timestamp" TIMESTAMP,
            "timestamptz" TIMESTAMPTZ,
            "date" DATE,
            "enum" psp_test.mood,
            "uuid" UUID,
            "json" JSONB,
            "string" TEXT
        )
    """)

    conn.execute("""
        INSERT INTO psp_test.coerce_types VALUES
            (-300, 9007199254740992, 1.5, 1.234, TIME '01:01:01',
             TIMESTAMP '2023-01-01 00:00:00',
             TIMESTAMPTZ '2023-01-01 00:00:00+00', DATE '2023-01-01',
             'happy', '00000000-0000-0000-0000-000000000001',
             '{"a": 1}', 'a'),
            (300, -9007199254740992, -1.5, -5.678, TIME '00:00:01',
             TIMESTAMP '2023-01-02 00:00:00',
             TIMESTAMPTZ '2023-01-02 00:00:00+00', DATE '2023-01-02',
             'sad', '00000000-0000-0000-0000-000000000002',
             '{"b": 2}', 'b')
    """)


@pytest.fixture(scope="module")
def pg_db():
    try:
        conn = psycopg.connect(DSN, autocommit=True, connect_timeout=5)
    except psycopg.OperationalError as e:
        pytest.skip(f"no PostgreSQL server at '{DSN}': {e}")

    if conn.info.server_version < 160000:
        pytest.skip("PostgreSQL >= 16 required (`any_value`)")

    conn.execute("DROP SCHEMA IF EXISTS psp_test CASCADE")
    conn.execute("CREATE SCHEMA psp_test")
    _load_superstore(conn)
    _load_coerce_types(conn)
    yield conn
    conn.execute("DROP SCHEMA psp_test CASCADE")
    conn.close()


@pytest.fixture
def client(pg_db):
    server = PostgresVirtualServer(DSN)

    def handle_request(msg):
        session.handle_request(msg)

    def handle_response(msg):
        c.handle_response(msg)

    session = server.new_session(handle_response)
    c = Client(handle_request)
    return c


def approx(x):
    # Float aggregation order (and so its rounding) is Postgres's own,
    # not DuckDB's.
    return pytest.approx(x, rel=1e-7)


class TestPostgresClient:
    def test_get_hosted_table_names(self, client):
        tables = client.get_hosted_table_names()
        assert {"psp_test.superstore", "psp_test.coerce_types"} <= set(tables)


class TestPostgresTable:
    def test_schema(self, client):
        table = client.open_table("psp_test.superstore")
        schema = table.schema()
        assert schema == {
            "Product Name": "string",
            "Ship Date": "date",
            "City": "string",
            "Row ID": "integer",
            "Customer Name": "string",
            "Quantity": "integer",
            "Discount": "float",
            "Sub-Category": "string",
            "Segment": "string",
            "Category": "string",
            "Order Date": "date",
            "Order ID": "string",
            "Sales": "float",
            "State": "string",
            "Postal Code": "float",
            "Country": "string",
            "Customer ID": "string",
            "Ship Mode": "string",
            "Region": "string",
            "Profit": "float",
            "Product ID": "string",
        }

    def test_size(self, client):
        table = client.open_table("psp_test.superstore")
        size = table.size()
        assert size == 9994


class TestPostgresView:
    def test_num_rows(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Profit"])
        num_rows = view.num_rows()
        assert num_rows == 9994
        view.delete()

    def test_num_columns(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Profit", "State"])
        num_columns = view.num_columns()
        assert num_columns == 3
        view.delete()

    def test_schema(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Profit", "State"])
        schema = view.schema()
        assert schema == {
            "Sales": "float",
            "Profit": "float",
            "State": "string",
        }
        view.delete()

    def test_to_json(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Quantity"])
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 261.96, "Quantity": 2},
            {"Sales": 731.94, "Quantity": 3},
            {"Sales": 14.62, "Quantity": 2},
            {"Sales": 957.5775, "Quantity": 5},
            {"Sales": 22.368, "Quantity": 2},
        ]
        view.delete()

    def test_to_columns(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Quantity"])
        columns = view.to_columns(start_row=0, end_row=5)
        assert columns == {
            "Sales": [261.96, 731.94, 14.62, 957.5775, 22.368],
            "Quantity": [2, 3, 2, 5, 2],
        }
        view.delete()

    def test_column_paths(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Profit", "State"])
        paths = view.column_paths()
        assert paths == ["Sales", "Profit", "State"]
        view.delete()


class TestPostgresGroupBy:
    def test_single_group_by(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
        )
        num_rows = view.num_rows()
        assert num_rows == 5
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": approx(2297200.860299955)},
            {"__ROW_PATH__": ["Central"], "Sales": approx(501239.8908000005)},
            {"__ROW_PATH__": ["East"], "Sales": approx(678781.2399999979)},
            {"__ROW_PATH__": ["South"], "Sales": approx(391721.9050000003)},
            {"__ROW_PATH__": ["West"], "Sales": approx(725457.8245000006)},
        ]
        view.delete()

    def test_multi_level_group_by(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region", "Category"],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": approx(2297200.860299955)},
            {"__ROW_PATH__": ["Central"], "Sales": approx(501239.8908000005)},
            {
                "__ROW_PATH__": ["Central", "Furniture"],
                "Sales": approx(163797.16380000004),
            },
            {
                "__ROW_PATH__": ["Central", "Office Supplies"],
                "Sales": approx(167026.41500000027),
            },
            {
                "__ROW_PATH__": ["Central", "Technology"],
                "Sales": approx(170416.3119999999),
            },
            {"__ROW_PATH__": ["East"], "Sales": approx(678781.2399999979)},
            {
                "__ROW_PATH__": ["East", "Furniture"],
                "Sales": approx(208291.20400000009),
            },
            {
                "__ROW_PATH__": ["East", "Office Supplies"],
                "Sales": approx(205516.0549999999),
            },
            {
                "__ROW_PATH__": ["East", "Technology"],
                "Sales": approx(264973.9810000003),
            },
            {"__ROW_PATH__": ["South"], "Sales": approx(391721.9050000003)},
            {
                "__ROW_PATH__": ["South", "Furniture"],
                "Sales": approx(117298.6840000001),
            },
            {
                "__ROW_PATH__": ["South", "Office Supplies"],
                "Sales": approx(125651.31299999992),
            },
            {
                "__ROW_PATH__": ["South", "Technology"],
                "Sales": approx(148771.9079999999),
            },
            {"__ROW_PATH__": ["West"], "Sales": approx(725457.8245000006)},
            {
                "__ROW_PATH__": ["West", "Furniture"],
                "Sales": approx(252612.7435000003),
            },
            {
                "__ROW_PATH__": ["West", "Office Supplies"],
                "Sales": approx(220853.24900000007),
            },
            {
                "__ROW_PATH__": ["West", "Technology"],
                "Sales": approx(251991.83199999997),
            },
        ]
        view.delete()

    def test_group_by_with_count_aggregate(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "count"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": 9994},
            {"__ROW_PATH__": ["Central"], "Sales": 2323},
            {"__ROW_PATH__": ["East"], "Sales": 2848},
            {"__ROW_PATH__": ["South"], "Sales": 1620},
            {"__ROW_PATH__": ["West"], "Sales": 3203},
        ]
        view.delete()

    def test_group_by_with_avg_aggregate(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            aggregates={"Sales": "avg"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": approx(229.8580008304938)},
            {"__ROW_PATH__": ["Furniture"], "Sales": approx(349.83488698727007)},
            {
                "__ROW_PATH__": ["Office Supplies"],
                "Sales": approx(119.32410089611732),
            },
            {"__ROW_PATH__": ["Technology"], "Sales": approx(452.70927612344155)},
        ]
        view.delete()

    def test_group_by_with_min_aggregate(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Quantity"],
            group_by=["Region"],
            aggregates={"Quantity": "min"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Quantity": 1},
            {"__ROW_PATH__": ["Central"], "Quantity": 1},
            {"__ROW_PATH__": ["East"], "Quantity": 1},
            {"__ROW_PATH__": ["South"], "Quantity": 1},
            {"__ROW_PATH__": ["West"], "Quantity": 1},
        ]
        view.delete()

    def test_group_by_with_max_aggregate(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Quantity"],
            group_by=["Region"],
            aggregates={"Quantity": "max"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Quantity": 14},
            {"__ROW_PATH__": ["Central"], "Quantity": 14},
            {"__ROW_PATH__": ["East"], "Quantity": 14},
            {"__ROW_PATH__": ["South"], "Quantity": 14},
            {"__ROW_PATH__": ["West"], "Quantity": 14},
        ]
        view.delete()

    def test_group_by_with_stddev_aggregate(self, client):
        # A Postgres-vocabulary aggregate with a `numeric` result, which
        # arrives as `Decimal` and must normalize to `float`.
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Quantity"],
            group_by=["Region"],
            aggregates={"Quantity": "stddev_samp"},
        )
        json = view.to_json()
        assert len(json) == 5
        assert all(isinstance(row["Quantity"], float) for row in json)
        view.delete()


class TestPostgresFilter:
    def test_filter_with_equals(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Region"],
            filter=[["Region", "==", "West"]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 14.62, "Region": "West"},
            {"Sales": 48.86, "Region": "West"},
            {"Sales": 7.28, "Region": "West"},
            {"Sales": 907.152, "Region": "West"},
            {"Sales": 18.504, "Region": "West"},
        ]
        view.delete()

    def test_filter_with_not_equals(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Region"],
            filter=[["Region", "!=", "West"]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 261.96, "Region": "South"},
            {"Sales": 731.94, "Region": "South"},
            {"Sales": 957.5775, "Region": "South"},
            {"Sales": 22.368, "Region": "South"},
            {"Sales": 15.552, "Region": "South"},
        ]
        view.delete()

    def test_filter_with_greater_than(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            filter=[["Quantity", ">", 5]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 48.86, "Quantity": 7},
            {"Sales": 907.152, "Quantity": 6},
            {"Sales": 1706.184, "Quantity": 9},
            {"Sales": 665.88, "Quantity": 6},
            {"Sales": 19.46, "Quantity": 7},
        ]
        view.delete()

    def test_filter_with_less_than(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            filter=[["Quantity", "<", 3]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 261.96, "Quantity": 2},
            {"Sales": 14.62, "Quantity": 2},
            {"Sales": 22.368, "Quantity": 2},
            {"Sales": 55.5, "Quantity": 2},
            {"Sales": 8.56, "Quantity": 2},
        ]
        view.delete()

    def test_filter_with_like(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "State"],
            filter=[["State", "LIKE", "Cal%"]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 14.62, "State": "California"},
            {"Sales": 48.86, "State": "California"},
            {"Sales": 7.28, "State": "California"},
            {"Sales": 907.152, "State": "California"},
            {"Sales": 18.504, "State": "California"},
        ]
        view.delete()

    def test_multiple_filters(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Region", "Quantity"],
            filter=[
                ["Region", "==", "West"],
                ["Quantity", ">", 3],
            ],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 48.86, "Region": "West", "Quantity": 7},
            {"Sales": 7.28, "Region": "West", "Quantity": 4},
            {"Sales": 907.152, "Region": "West", "Quantity": 6},
            {"Sales": 114.9, "Region": "West", "Quantity": 5},
            {"Sales": 1706.184, "Region": "West", "Quantity": 9},
        ]
        view.delete()

    def test_filter_with_group_by(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            filter=[["Region", "==", "West"]],
            aggregates={"Sales": "sum"},
        )
        num_rows = view.num_rows()
        assert num_rows == 4
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": approx(725457.8245000006)},
            {"__ROW_PATH__": ["Furniture"], "Sales": approx(252612.7435000003)},
            {
                "__ROW_PATH__": ["Office Supplies"],
                "Sales": approx(220853.24900000007),
            },
            {"__ROW_PATH__": ["Technology"], "Sales": approx(251991.83199999997)},
        ]
        view.delete()


class TestPostgresSort:
    def test_sort_ascending(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            sort=[["Sales", "asc"]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 0.444, "Quantity": 1},
            {"Sales": 0.556, "Quantity": 1},
            {"Sales": 0.836, "Quantity": 1},
            {"Sales": 0.852, "Quantity": 1},
            {"Sales": 0.876, "Quantity": 1},
        ]
        view.delete()

    def test_sort_descending(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            sort=[["Sales", "desc"]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 22638.48, "Quantity": 6},
            {"Sales": 17499.95, "Quantity": 5},
            {"Sales": 13999.96, "Quantity": 4},
            {"Sales": 11199.968, "Quantity": 4},
            {"Sales": 10499.97, "Quantity": 3},
        ]
        view.delete()

    def test_sort_with_group_by(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": approx(2297200.860299955)},
            {"__ROW_PATH__": ["West"], "Sales": approx(725457.8245000006)},
            {"__ROW_PATH__": ["East"], "Sales": approx(678781.2399999979)},
            {"__ROW_PATH__": ["Central"], "Sales": approx(501239.8908000005)},
            {"__ROW_PATH__": ["South"], "Sales": approx(391721.9050000003)},
        ]
        view.delete()

    def test_sort_with_multi_level_group_by(self, client):
        # Hierarchical rollup sort - exercises the `first_value(...) OVER
        # __WINDOW_N__` emission, which must be that spelling for Postgres
        # (DuckDB's `first` does not exist).
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region", "Category"],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json[0]["__ROW_PATH__"] == []
        assert json[1]["__ROW_PATH__"] == ["West"]
        assert json[2]["__ROW_PATH__"] == ["West", "Furniture"]
        assert json[5]["__ROW_PATH__"] == ["East"]
        view.delete()

    def test_multi_column_sort(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Region", "Sales", "Quantity"],
            sort=[
                ["Region", "asc"],
                ["Sales", "desc"],
            ],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Region": "Central", "Sales": 17499.95, "Quantity": 5},
            {"Region": "Central", "Sales": 9892.74, "Quantity": 13},
            {"Region": "Central", "Sales": 9449.95, "Quantity": 5},
            {"Region": "Central", "Sales": 8159.952, "Quantity": 8},
            {"Region": "Central", "Sales": 5443.96, "Quantity": 4},
        ]
        view.delete()


class TestPostgresExpressions:
    def test_simple_expression(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "doublesales"],
            expressions={"doublesales": '"Sales" * 2'},
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 261.96, "doublesales": 523.92},
            {"Sales": 731.94, "doublesales": 1463.88},
            {"Sales": 14.62, "doublesales": 29.24},
            {"Sales": 957.5775, "doublesales": 1915.155},
            {"Sales": 22.368, "doublesales": 44.736},
        ]
        view.delete()

    def test_expression_with_multiple_columns(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Profit", "margin"],
            expressions={"margin": '"Profit" / "Sales"'},
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 261.96, "Profit": 41.9136, "margin": approx(0.16)},
            {"Sales": 731.94, "Profit": 219.582, "margin": approx(0.3)},
            {"Sales": 14.62, "Profit": 6.8714, "margin": approx(0.47)},
            {"Sales": 957.5775, "Profit": -383.031, "margin": approx(-0.4)},
            {"Sales": 22.368, "Profit": 2.5164, "margin": approx(0.1125)},
        ]
        view.delete()

    def test_expression_with_group_by(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["total"],
            group_by=["Region"],
            expressions={"total": '"Sales" + "Profit"'},
            aggregates={"total": "sum"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "total": approx(2583597.882000014)},
            {"__ROW_PATH__": ["Central"], "total": approx(540946.2532999996)},
            {"__ROW_PATH__": ["East"], "total": approx(770304.0199999991)},
            {"__ROW_PATH__": ["South"], "total": approx(438471.33530000027)},
            {"__ROW_PATH__": ["West"], "total": approx(833876.2733999988)},
        ]
        view.delete()


class TestPostgresViewport:
    def test_start_row_and_end_row(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales", "Profit"])
        json = view.to_json(start_row=10, end_row=15)
        assert json == [
            {"Sales": 1706.184, "Profit": 85.3092},
            {"Sales": 911.424, "Profit": 68.3568},
            {"Sales": 15.552, "Profit": 5.4432},
            {"Sales": 407.976, "Profit": 132.5922},
            {"Sales": 68.81, "Profit": -123.858},
        ]
        view.delete()

    def test_start_col_and_end_col(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales", "Profit", "Quantity", "Discount"],
        )
        json = view.to_json(start_row=0, end_row=5, start_col=1, end_col=3)
        assert json == [
            {"Profit": 41.9136, "Quantity": 2},
            {"Profit": 219.582, "Quantity": 3},
            {"Profit": 6.8714, "Quantity": 2},
            {"Profit": -383.031, "Quantity": 5},
            {"Profit": 2.5164, "Quantity": 2},
        ]
        view.delete()


class TestPostgresDataTypes:
    def test_date_columns(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Order Date"])
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Order Date": 1478563200000},
            {"Order Date": 1478563200000},
            {"Order Date": 1465689600000},
            {"Order Date": 1444521600000},
            {"Order Date": 1444521600000},
        ]
        view.delete()


class TestPostgresCombinedOperations:
    def test_group_by_filter_sort(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            filter=[["Region", "==", "West"]],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "Sales": approx(725457.8245000006)},
            {"__ROW_PATH__": ["Furniture"], "Sales": approx(252612.7435000003)},
            {"__ROW_PATH__": ["Technology"], "Sales": approx(251991.83199999997)},
            {
                "__ROW_PATH__": ["Office Supplies"],
                "Sales": approx(220853.24900000007),
            },
        ]
        view.delete()

    def test_expressions_group_by_sort(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["profitmargin"],
            group_by=["Region"],
            expressions={"profitmargin": '"Profit" / "Sales" * 100'},
            sort=[["profitmargin", "desc"]],
            aggregates={"profitmargin": "avg"},
        )
        json = view.to_json()
        assert json == [
            {"__ROW_PATH__": [], "profitmargin": approx(12.031392972104467)},
            {"__ROW_PATH__": ["West"], "profitmargin": approx(21.948661793784012)},
            {"__ROW_PATH__": ["East"], "profitmargin": approx(16.722695960406636)},
            {"__ROW_PATH__": ["South"], "profitmargin": approx(16.35190329218107)},
            {
                "__ROW_PATH__": ["Central"],
                "profitmargin": approx(-10.407293926323575),
            },
        ]
        view.delete()


class TestPostgresMinMax:
    def test_min_max_integer(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Quantity"])
        min_val, max_val = view.get_min_max("Quantity")
        assert min_val == 1
        assert max_val == 14
        view.delete()

    def test_min_max_float(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Sales"])
        min_val, max_val = view.get_min_max("Sales")
        assert min_val == 0.444
        assert max_val == 22638.48
        view.delete()

    def test_min_max_string(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(columns=["Category"])
        min_val, max_val = view.get_min_max("Category")
        assert min_val == "Furniture"
        assert max_val == "Technology"
        view.delete()

    def test_min_max_with_group_by(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
        )
        min_val, max_val = view.get_min_max("Sales")
        assert min_val > 0
        assert max_val > 0
        assert max_val >= min_val
        view.delete()

    def test_min_max_with_filter(self, client):
        table = client.open_table("psp_test.superstore")
        view = table.view(
            columns=["Quantity"],
            filter=[["Quantity", ">", 10]],
        )
        min_val, max_val = view.get_min_max("Quantity")
        assert min_val >= 11
        assert max_val == 14
        view.delete()


class TestPostgresCoerceTypes:
    """The Postgres types whose Perspective type is not their own."""

    def test_schema(self, client):
        table = client.open_table("psp_test.coerce_types")
        assert table.schema() == {
            "small": "integer",
            "big": "float",
            "float": "float",
            "decimal": "float",
            "time": "datetime",
            "timestamp": "datetime",
            "timestamptz": "datetime",
            "date": "date",
            "enum": "string",
            "uuid": "string",
            "json": "string",
            "string": "string",
        }

    def test_numbers_flat(self, client):
        table = client.open_table("psp_test.coerce_types")
        view = table.view(columns=["small", "big", "float", "decimal"])
        assert view.to_json() == [
            {
                "small": -300,
                "big": 9007199254740992.0,
                "float": 1.5,
                "decimal": pytest.approx(1.234),
            },
            {
                "small": 300,
                "big": -9007199254740992.0,
                "float": -1.5,
                "decimal": pytest.approx(-5.678),
            },
        ]
        view.delete()

    def test_temporal_flat(self, client):
        table = client.open_table("psp_test.coerce_types")
        view = table.view(columns=["time", "timestamp", "timestamptz", "date"])
        assert view.to_json() == [
            {
                "time": 3661000,
                "timestamp": 1672531200000,
                "timestamptz": 1672531200000,
                "date": 1672531200000,
            },
            {
                "time": 1000,
                "timestamp": 1672617600000,
                "timestamptz": 1672617600000,
                "date": 1672617600000,
            },
        ]
        view.delete()

    def test_stringly_flat(self, client):
        # Enums are unknown OIDs (string with a warning), uuid/jsonb
        # stringify.
        table = client.open_table("psp_test.coerce_types")
        view = table.view(columns=["enum", "uuid", "json", "string"])
        assert view.to_json() == [
            {
                "enum": "happy",
                "uuid": "00000000-0000-0000-0000-000000000001",
                "json": '{"a": 1}',
                "string": "a",
            },
            {
                "enum": "sad",
                "uuid": "00000000-0000-0000-0000-000000000002",
                "json": '{"b": 2}',
                "string": "b",
            },
        ]
        view.delete()

    def test_enum_group_by(self, client):
        table = client.open_table("psp_test.coerce_types")
        view = table.view(
            group_by=["enum"],
            columns=["small"],
            aggregates={"small": "sum"},
        )
        assert view.to_json() == [
            {"__ROW_PATH__": [], "small": 0},
            {"__ROW_PATH__": ["happy"], "small": -300},
            {"__ROW_PATH__": ["sad"], "small": 300},
        ]
        view.delete()

    def test_column_values_view(self, client):
        # The filter dropdown's query shape - group by the column, select
        # no columns at all.
        table = client.open_table("psp_test.coerce_types")
        view = table.view(group_by=["enum"], columns=[])
        csv = view.to_csv()
        assert [line for line in csv.splitlines() if line] == [
            "__ROW_PATH_0__",
            "null",
            '"happy"',
            '"sad"',
        ]
        view.delete()

    def test_filter_matching_nothing(self, client):
        table = client.open_table("psp_test.coerce_types")
        view = table.view(
            columns=["small"],
            filter=[["string", "==", "no such value"]],
        )
        assert view.num_rows() == 0
        assert view.to_json() == []
        view.delete()
