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
import pytest
import polars as pl

from perspective import Client
from perspective.virtual_servers.polars import PolarsVirtualServer


def approx_json(expected):
    """Wrap float values in pytest.approx for approximate comparison."""
    return [
        {k: pytest.approx(v) if isinstance(v, float) else v for k, v in row.items()}
        for row in expected
    ]


SUPERSTORE_PARQUET = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "..",
    "node_modules",
    "superstore-arrow",
    "superstore.parquet",
)


@pytest.fixture(scope="module")
def client():
    df = pl.read_parquet(SUPERSTORE_PARQUET)
    server = PolarsVirtualServer({"superstore": df})

    def handle_request(msg):
        session.handle_request(msg)

    def handle_response(msg):
        c.handle_response(msg)

    session = server.new_session(handle_response)
    c = Client(handle_request)
    return c


class TestPolarsClient:
    def test_get_hosted_table_names(self, client):
        tables = client.get_hosted_table_names()
        assert tables == ["superstore"]


class TestPolarsTable:
    def test_schema(self, client):
        table = client.open_table("superstore")
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

    def test_columns(self, client):
        table = client.open_table("superstore")
        columns = table.columns()
        assert columns == [
            "Row ID",
            "Order ID",
            "Order Date",
            "Ship Date",
            "Ship Mode",
            "Customer ID",
            "Customer Name",
            "Segment",
            "Country",
            "City",
            "State",
            "Postal Code",
            "Region",
            "Product ID",
            "Category",
            "Sub-Category",
            "Product Name",
            "Sales",
            "Quantity",
            "Discount",
            "Profit",
        ]

    def test_size(self, client):
        table = client.open_table("superstore")
        size = table.size()
        assert size == 9994


class TestPolarsView:
    def test_num_rows(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Sales", "Profit"])
        num_rows = view.num_rows()
        assert num_rows == 9994
        view.delete()

    def test_num_columns(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Sales", "Profit", "State"])
        num_columns = view.num_columns()
        assert num_columns == 3
        view.delete()

    def test_schema(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Sales", "Profit", "State"])
        schema = view.schema()
        assert schema == {
            "Sales": "float",
            "Profit": "float",
            "State": "string",
        }
        view.delete()

    def test_to_json(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
        view = table.view(columns=["Sales", "Quantity"])
        columns = view.to_columns(start_row=0, end_row=5)
        assert columns == {
            "Sales": [261.96, 731.94, 14.62, 957.5775, 22.368],
            "Quantity": [2, 3, 2, 5, 2],
        }
        view.delete()

    def test_column_paths(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Sales", "Profit", "State"])
        paths = view.column_paths()
        assert paths == ["Sales", "Profit", "State"]
        view.delete()


class TestPolarsGroupBy:
    def test_single_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
        )
        num_rows = view.num_rows()
        assert num_rows == 5
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "Sales": 2297200.860299955},
                {"__ROW_PATH__": ["Central"], "Sales": 501239.8908000005},
                {"__ROW_PATH__": ["East"], "Sales": 678781.2399999979},
                {"__ROW_PATH__": ["South"], "Sales": 391721.9050000003},
                {"__ROW_PATH__": ["West"], "Sales": 725457.8245000006},
            ]
        )
        view.delete()

    def test_multi_level_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region", "Category"],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "Sales": 2297200.860299955},
                {"__ROW_PATH__": ["Central"], "Sales": 501239.8908000005},
                {"__ROW_PATH__": ["Central", "Furniture"], "Sales": 163797.16380000004},
                {
                    "__ROW_PATH__": ["Central", "Office Supplies"],
                    "Sales": 167026.41500000027,
                },
                {"__ROW_PATH__": ["Central", "Technology"], "Sales": 170416.3119999999},
                {"__ROW_PATH__": ["East"], "Sales": 678781.2399999979},
                {"__ROW_PATH__": ["East", "Furniture"], "Sales": 208291.20400000009},
                {
                    "__ROW_PATH__": ["East", "Office Supplies"],
                    "Sales": 205516.0549999999,
                },
                {"__ROW_PATH__": ["East", "Technology"], "Sales": 264973.9810000003},
                {"__ROW_PATH__": ["South"], "Sales": 391721.9050000003},
                {"__ROW_PATH__": ["South", "Furniture"], "Sales": 117298.6840000001},
                {
                    "__ROW_PATH__": ["South", "Office Supplies"],
                    "Sales": 125651.31299999992,
                },
                {"__ROW_PATH__": ["South", "Technology"], "Sales": 148771.9079999999},
                {"__ROW_PATH__": ["West"], "Sales": 725457.8245000006},
                {"__ROW_PATH__": ["West", "Furniture"], "Sales": 252612.7435000003},
                {
                    "__ROW_PATH__": ["West", "Office Supplies"],
                    "Sales": 220853.24900000007,
                },
                {"__ROW_PATH__": ["West", "Technology"], "Sales": 251991.83199999997},
            ]
        )
        view.delete()

    def test_group_by_with_count_aggregate(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            aggregates={"Sales": "avg"},
        )
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "Sales": 229.8580008304938},
                {"__ROW_PATH__": ["Furniture"], "Sales": 349.83488698727007},
                {"__ROW_PATH__": ["Office Supplies"], "Sales": 119.32410089611732},
                {"__ROW_PATH__": ["Technology"], "Sales": 452.70927612344155},
            ]
        )
        view.delete()

    def test_group_by_with_min_aggregate(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
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


class TestPolarsFilter:
    def test_filter_with_equals(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
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

    def test_filter_with_greater_than_or_equal(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            filter=[["Quantity", ">=", 10]],
        )
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 40.096, "Quantity": 14},
            {"Sales": 43.12, "Quantity": 14},
            {"Sales": 384.45, "Quantity": 11},
            {"Sales": 3347.37, "Quantity": 13},
            {"Sales": 100.24, "Quantity": 10},
        ]
        view.delete()

    def test_filter_with_less_than_or_equal(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            filter=[["Quantity", "<=", 2]],
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

    def test_multiple_filters(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            filter=[["Region", "==", "West"]],
            aggregates={"Sales": "sum"},
        )
        num_rows = view.num_rows()
        assert num_rows == 4
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "Sales": 725457.8245000006},
                {"__ROW_PATH__": ["Furniture"], "Sales": 252612.7435000003},
                {"__ROW_PATH__": ["Office Supplies"], "Sales": 220853.24900000007},
                {"__ROW_PATH__": ["Technology"], "Sales": 251991.83199999997},
            ]
        )
        view.delete()


class TestPolarsSplitBy:
    def test_single_split_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            split_by=["Region"],
            group_by=["Category"],
            aggregates={"Sales": "sum"},
        )

        column_paths = view.column_paths()
        assert column_paths == [
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
        ]

        json = view.to_json()
        assert json == approx_json(
            [
                {
                    "__ROW_PATH__": [],
                    "Central|Sales": 501239.8908000005,
                    "East|Sales": 678781.2399999979,
                    "South|Sales": 391721.9050000003,
                    "West|Sales": 725457.8245000006,
                },
                {
                    "__ROW_PATH__": ["Furniture"],
                    "Central|Sales": 163797.16380000004,
                    "East|Sales": 208291.20400000009,
                    "South|Sales": 117298.6840000001,
                    "West|Sales": 252612.7435000003,
                },
                {
                    "__ROW_PATH__": ["Office Supplies"],
                    "Central|Sales": 167026.41500000027,
                    "East|Sales": 205516.0549999999,
                    "South|Sales": 125651.31299999992,
                    "West|Sales": 220853.24900000007,
                },
                {
                    "__ROW_PATH__": ["Technology"],
                    "Central|Sales": 170416.3119999999,
                    "East|Sales": 264973.9810000003,
                    "South|Sales": 148771.9079999999,
                    "West|Sales": 251991.83199999997,
                },
            ]
        )
        view.delete()

    def test_split_by_without_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            split_by=["Category"],
        )
        paths = view.column_paths()
        assert any("Furniture" in c for c in paths)
        assert any("Office Supplies" in c for c in paths)
        assert any("Technology" in c for c in paths)
        view.delete()


class TestPolarsSort:
    def test_sort_ascending(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "Sales": 2297200.860299955},
                {"__ROW_PATH__": ["West"], "Sales": 725457.8245000006},
                {"__ROW_PATH__": ["East"], "Sales": 678781.2399999979},
                {"__ROW_PATH__": ["Central"], "Sales": 501239.8908000005},
                {"__ROW_PATH__": ["South"], "Sales": 391721.9050000003},
            ]
        )
        view.delete()

    def test_multi_column_sort(self, client):
        table = client.open_table("superstore")
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


class TestPolarsViewport:
    def test_start_row_and_end_row(self, client):
        table = client.open_table("superstore")
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
        table = client.open_table("superstore")
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


class TestPolarsDataTypes:
    def test_integer_columns(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Quantity"])
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Quantity": 2},
            {"Quantity": 3},
            {"Quantity": 2},
            {"Quantity": 5},
            {"Quantity": 2},
        ]
        view.delete()

    def test_float_columns(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Sales", "Profit"])
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Sales": 261.96, "Profit": 41.9136},
            {"Sales": 731.94, "Profit": 219.582},
            {"Sales": 14.62, "Profit": 6.8714},
            {"Sales": 957.5775, "Profit": -383.031},
            {"Sales": 22.368, "Profit": 2.5164},
        ]
        view.delete()

    def test_string_columns(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Region", "State", "City"])
        json = view.to_json(start_row=0, end_row=5)
        assert json == [
            {"Region": "South", "State": "Kentucky", "City": "Henderson"},
            {"Region": "South", "State": "Kentucky", "City": "Henderson"},
            {"Region": "West", "State": "California", "City": "Los Angeles"},
            {"Region": "South", "State": "Florida", "City": "Fort Lauderdale"},
            {"Region": "South", "State": "Florida", "City": "Fort Lauderdale"},
        ]
        view.delete()

    def test_date_columns(self, client):
        table = client.open_table("superstore")
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


class TestPolarsGroupRollupMode:
    def test_flat_mode_with_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
            group_rollup_mode="flat",
        )
        num_rows = view.num_rows()
        assert num_rows == 4
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": ["Central"], "Sales": 501239.8908000005},
                {"__ROW_PATH__": ["East"], "Sales": 678781.2399999979},
                {"__ROW_PATH__": ["South"], "Sales": 391721.9050000003},
                {"__ROW_PATH__": ["West"], "Sales": 725457.8245000006},
            ]
        )
        view.delete()

    def test_flat_mode_with_multi_level_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region", "Category"],
            aggregates={"Sales": "sum"},
            group_rollup_mode="flat",
        )
        num_rows = view.num_rows()
        assert num_rows == 12
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": ["Central", "Furniture"], "Sales": 163797.16380000004},
                {
                    "__ROW_PATH__": ["Central", "Office Supplies"],
                    "Sales": 167026.41500000027,
                },
                {"__ROW_PATH__": ["Central", "Technology"], "Sales": 170416.3119999999},
                {"__ROW_PATH__": ["East", "Furniture"], "Sales": 208291.20400000009},
                {
                    "__ROW_PATH__": ["East", "Office Supplies"],
                    "Sales": 205516.0549999999,
                },
                {"__ROW_PATH__": ["East", "Technology"], "Sales": 264973.9810000003},
                {"__ROW_PATH__": ["South", "Furniture"], "Sales": 117298.6840000001},
                {
                    "__ROW_PATH__": ["South", "Office Supplies"],
                    "Sales": 125651.31299999992,
                },
                {"__ROW_PATH__": ["South", "Technology"], "Sales": 148771.9079999999},
                {"__ROW_PATH__": ["West", "Furniture"], "Sales": 252612.7435000003},
                {
                    "__ROW_PATH__": ["West", "Office Supplies"],
                    "Sales": 220853.24900000007,
                },
                {"__ROW_PATH__": ["West", "Technology"], "Sales": 251991.83199999997},
            ]
        )
        view.delete()

    def test_flat_mode_with_group_by_and_split_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            split_by=["Region"],
            aggregates={"Sales": "sum"},
            group_rollup_mode="flat",
        )
        num_rows = view.num_rows()
        assert num_rows == 3
        json = view.to_json()
        assert json == approx_json(
            [
                {
                    "__ROW_PATH__": ["Furniture"],
                    "Central|Sales": 163797.16380000004,
                    "East|Sales": 208291.20400000009,
                    "South|Sales": 117298.6840000001,
                    "West|Sales": 252612.7435000003,
                },
                {
                    "__ROW_PATH__": ["Office Supplies"],
                    "Central|Sales": 167026.41500000027,
                    "East|Sales": 205516.0549999999,
                    "South|Sales": 125651.31299999992,
                    "West|Sales": 220853.24900000007,
                },
                {
                    "__ROW_PATH__": ["Technology"],
                    "Central|Sales": 170416.3119999999,
                    "East|Sales": 264973.9810000003,
                    "South|Sales": 148771.9079999999,
                    "West|Sales": 251991.83199999997,
                },
            ]
        )
        view.delete()

    def test_flat_mode_with_group_by_and_split_by_and_sort(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            split_by=["Region"],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
            group_rollup_mode="flat",
        )
        num_rows = view.num_rows()
        assert num_rows == 3
        json = view.to_json()
        assert json == approx_json(
            [
                {
                    "__ROW_PATH__": ["Technology"],
                    "Central|Sales": 170416.3119999999,
                    "East|Sales": 264973.9810000003,
                    "South|Sales": 148771.9079999999,
                    "West|Sales": 251991.83199999997,
                },
                {
                    "__ROW_PATH__": ["Furniture"],
                    "Central|Sales": 163797.16380000004,
                    "East|Sales": 208291.20400000009,
                    "South|Sales": 117298.6840000001,
                    "West|Sales": 252612.7435000003,
                },
                {
                    "__ROW_PATH__": ["Office Supplies"],
                    "Central|Sales": 167026.41500000027,
                    "East|Sales": 205516.0549999999,
                    "South|Sales": 125651.31299999992,
                    "West|Sales": 220853.24900000007,
                },
            ]
        )
        view.delete()

    def test_flat_mode_with_group_by_and_sort(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
            group_rollup_mode="flat",
        )
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": ["West"], "Sales": 725457.8245000006},
                {"__ROW_PATH__": ["East"], "Sales": 678781.2399999979},
                {"__ROW_PATH__": ["Central"], "Sales": 501239.8908000005},
                {"__ROW_PATH__": ["South"], "Sales": 391721.9050000003},
            ]
        )
        view.delete()

    def test_total_mode(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            aggregates={"Sales": "sum"},
            group_rollup_mode="total",
        )
        num_rows = view.num_rows()
        assert num_rows == 1
        json = view.to_json()
        assert json == approx_json([{"Sales": 2297200.860299955}])
        view.delete()

    def test_total_mode_with_multiple_columns(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales", "Quantity"],
            aggregates={"Sales": "sum", "Quantity": "sum"},
            group_rollup_mode="total",
        )
        json = view.to_json()
        assert json == approx_json(
            [{"Sales": 2297200.860299955, "Quantity": 37873}]
        )
        view.delete()

    def test_total_mode_with_split_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            split_by=["Region"],
            aggregates={"Sales": "sum"},
            group_rollup_mode="total",
        )
        num_rows = view.num_rows()
        assert num_rows == 1
        json = view.to_json()
        assert json == approx_json(
            [
                {
                    "Central|Sales": 501239.8908000005,
                    "East|Sales": 678781.2399999979,
                    "South|Sales": 391721.9050000003,
                    "West|Sales": 725457.8245000006,
                }
            ]
        )
        view.delete()


class TestPolarsCombinedOperations:
    def test_group_by_filter_sort(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            filter=[["Region", "==", "West"]],
            sort=[["Sales", "desc"]],
            aggregates={"Sales": "sum"},
        )
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "Sales": 725457.8245000006},
                {"__ROW_PATH__": ["Furniture"], "Sales": 252612.7435000003},
                {"__ROW_PATH__": ["Technology"], "Sales": 251991.83199999997},
                {"__ROW_PATH__": ["Office Supplies"], "Sales": 220853.24900000007},
            ]
        )
        view.delete()

    def test_split_by_group_by_filter(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Category"],
            split_by=["Region"],
            filter=[["Quantity", ">", 3]],
            aggregates={"Sales": "sum"},
        )

        paths = view.column_paths()
        assert paths == [
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
        ]

        num_rows = view.num_rows()
        assert num_rows == 4

        json = view.to_json()
        assert json == approx_json(
            [
                {
                    "__ROW_PATH__": [],
                    "Central|Sales": 332883.0567999998,
                    "East|Sales": 455143.735,
                    "South|Sales": 274208.7699999999,
                    "West|Sales": 470561.28350000136,
                },
                {
                    "__ROW_PATH__": ["Furniture"],
                    "Central|Sales": 111457.73279999988,
                    "East|Sales": 140376.95899999997,
                    "South|Sales": 80859.618,
                    "West|Sales": 165219.5734999998,
                },
                {
                    "__ROW_PATH__": ["Office Supplies"],
                    "Central|Sales": 103937.78599999992,
                    "East|Sales": 135823.893,
                    "South|Sales": 84393.3579999999,
                    "West|Sales": 140206.93099999975,
                },
                {
                    "__ROW_PATH__": ["Technology"],
                    "Central|Sales": 117487.53800000002,
                    "East|Sales": 178942.883,
                    "South|Sales": 108955.79400000005,
                    "West|Sales": 165134.77900000007,
                },
            ]
        )
        view.delete()

    def test_split_by_only(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            split_by=["Region"],
            filter=[["Quantity", ">", 3]],
        )

        paths = view.column_paths()
        assert paths == [
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
        ]

        num_rows = view.num_rows()
        assert num_rows == 4284

        json = view.to_json(start_row=0, end_row=1)
        assert json == [
            {
                "Central|Sales": None,
                "East|Sales": None,
                "South|Sales": 957.5775,
                "West|Sales": None,
            },
        ]
        view.delete()

    def test_expressions_group_by_sort(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["profitmargin"],
            group_by=["Region"],
            expressions={"profitmargin": '"Profit" / "Sales" * 100'},
            sort=[["profitmargin", "desc"]],
            aggregates={"profitmargin": "avg"},
        )
        json = view.to_json()
        assert json == approx_json(
            [
                {"__ROW_PATH__": [], "profitmargin": 12.031392972104467},
                {"__ROW_PATH__": ["West"], "profitmargin": 21.948661793784012},
                {"__ROW_PATH__": ["East"], "profitmargin": 16.722695960406636},
                {"__ROW_PATH__": ["South"], "profitmargin": 16.35190329218107},
                {"__ROW_PATH__": ["Central"], "profitmargin": -10.407293926323575},
            ]
        )
        view.delete()
