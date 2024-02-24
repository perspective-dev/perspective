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

from datetime import date
import pandas as pd
import numpy as np
from perspective import Table, PerspectiveWidget


class TestWidgetPandas:
    def test_widget_load_table_df(self, superstore):
        table = Table(superstore)
        widget = PerspectiveWidget(table)
        assert widget.table.schema() == {
            "index": int,
            "Country": str,
            "Region": str,
            "Category": str,
            "City": str,
            "Customer ID": str,
            "Discount": float,
            "Order Date": date,
            "Order ID": str,
            "Postal Code": str,
            "Product ID": str,
            "Profit": float,
            "Quantity": int,
            "Row ID": int,
            "Sales": int,
            "Segment": str,
            "Ship Date": date,
            "Ship Mode": str,
            "State": str,
            "Sub-Category": str,
        }

        assert sorted(widget.columns) == sorted(
            [
                "index",
                "Category",
                "City",
                "Country",
                "Customer ID",
                "Discount",
                "Order Date",
                "Order ID",
                "Postal Code",
                "Product ID",
                "Profit",
                "Quantity",
                "Region",
                "Row ID",
                "Sales",
                "Segment",
                "Ship Date",
                "Ship Mode",
                "State",
                "Sub-Category",
            ]
        )
        view = widget.table.view()
        assert view.num_rows() == len(superstore)
        assert view.num_columns() == len(superstore.columns) + 1  # index

    def test_widget_load_data_df(self, superstore):
        widget = PerspectiveWidget(superstore)
        assert sorted(widget.columns) == sorted(
            [
                "index",
                "Category",
                "City",
                "Country",
                "Customer ID",
                "Discount",
                "Order Date",
                "Order ID",
                "Postal Code",
                "Product ID",
                "Profit",
                "Quantity",
                "Region",
                "Row ID",
                "Sales",
                "Segment",
                "Ship Date",
                "Ship Mode",
                "State",
                "Sub-Category",
            ]
        )
        view = widget.table.view()
        assert view.num_rows() == len(superstore)
        assert view.num_columns() == 20

    def test_widget_load_series(self, superstore):
        series = pd.Series(superstore["Profit"].values, name="profit")
        widget = PerspectiveWidget(series)
        assert widget.table.schema() == {"index": int, "profit": float}

        assert sorted(widget.columns) == sorted(["index", "profit"])
        view = widget.table.view()
        assert view.num_rows() == len(superstore)
        assert view.num_columns() == 2

    def test_widget_load_pivot_table(self, superstore):
        pivot_table = pd.pivot_table(
            superstore,
            values="Discount",
            index=["Country", "Region"],
            columns=["Category", "Segment"],
        )
        widget = PerspectiveWidget(pivot_table)
        assert widget.group_by == ["Country", "Region"]
        assert widget.split_by == ["Category", "Segment"]
        assert widget.columns == ["value"]
        # table should host flattened data
        view = widget.table.view()
        assert view.num_rows() == 60
        assert view.num_columns() == 6

    def test_widget_load_pivot_table_with_user_pivots(self, superstore):
        pivot_table = pd.pivot_table(
            superstore,
            values="Discount",
            index=["Country", "Region"],
            columns="Category",
        )
        widget = PerspectiveWidget(pivot_table, group_by=["Category", "Segment"])
        assert widget.group_by == ["Category", "Segment"]
        assert widget.split_by == []
        assert widget.columns == [
            "index",
            "Country",
            "Region",
            "Financials",
            "Industrials",
            "Technology",
        ]
        # table should host flattened data
        view = widget.table.view()
        assert view.num_rows() == 5
        assert view.num_columns() == 6

    def test_widget_load_group_by(self, superstore):
        df_pivoted = superstore.set_index(["Country", "Region"])
        widget = PerspectiveWidget(df_pivoted)
        assert widget.group_by == ["Country", "Region"]
        assert widget.split_by == []
        assert sorted(widget.columns) == sorted(
            [
                "index",
                "Category",
                "Country",
                "City",
                "Customer ID",
                "Discount",
                "Order Date",
                "Order ID",
                "Postal Code",
                "Product ID",
                "Profit",
                "Quantity",
                "Region",
                "Row ID",
                "Sales",
                "Segment",
                "Ship Date",
                "Ship Mode",
                "State",
                "Sub-Category",
            ]
        )
        assert widget.table.size() == 100
        view = widget.table.view()
        assert view.num_rows() == len(superstore)
        assert view.num_columns() == len(superstore.columns) + 1  # index

    def test_widget_load_group_by_with_user_pivots(self, superstore):
        df_pivoted = superstore.set_index(["Country", "Region"])
        widget = PerspectiveWidget(df_pivoted, group_by=["Category", "Segment"])
        assert widget.group_by == ["Category", "Segment"]
        assert widget.split_by == []
        assert sorted(widget.columns) == sorted(
            [
                "index",
                "Category",
                "Country",
                "City",
                "Customer ID",
                "Discount",
                "Order Date",
                "Order ID",
                "Postal Code",
                "Product ID",
                "Profit",
                "Quantity",
                "Region",
                "Row ID",
                "Sales",
                "Segment",
                "Ship Date",
                "Ship Mode",
                "State",
                "Sub-Category",
            ]
        )
        assert widget.table.size() == 100
        view = widget.table.view()
        assert view.num_rows() == len(superstore)
        assert view.num_columns() == len(superstore.columns) + 1  # index

    def test_widget_load_split_by(self, superstore):
        arrays = [
            np.array(
                [
                    "bar",
                    "bar",
                    "bar",
                    "bar",
                    "baz",
                    "baz",
                    "baz",
                    "baz",
                    "foo",
                    "foo",
                    "foo",
                    "foo",
                    "qux",
                    "qux",
                    "qux",
                    "qux",
                ]
            ),
            np.array(
                [
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                ]
            ),
            np.array(
                [
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                ]
            ),
        ]
        tuples = list(zip(*arrays))
        index = pd.MultiIndex.from_tuples(tuples, names=["first", "second", "third"])
        df_both = pd.DataFrame(
            np.random.randn(3, 16), index=["A", "B", "C"], columns=index
        )
        widget = PerspectiveWidget(df_both)
        assert widget.columns == ["value"]
        assert widget.split_by == ["first", "second", "third"]
        assert widget.group_by == ["index"]

    def test_widget_load_split_by_preserve_user_settings(self, superstore):
        arrays = [
            np.array(
                [
                    "bar",
                    "bar",
                    "bar",
                    "bar",
                    "baz",
                    "baz",
                    "baz",
                    "baz",
                    "foo",
                    "foo",
                    "foo",
                    "foo",
                    "qux",
                    "qux",
                    "qux",
                    "qux",
                ]
            ),
            np.array(
                [
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                ]
            ),
            np.array(
                [
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                ]
            ),
        ]
        tuples = list(zip(*arrays))
        index = pd.MultiIndex.from_tuples(tuples, names=["first", "second", "third"])
        df_both = pd.DataFrame(
            np.random.randn(3, 16), index=["A", "B", "C"], columns=index
        )
        widget = PerspectiveWidget(df_both, columns=["first", "third"])
        assert widget.columns == ["first", "third"]
        assert widget.split_by == ["first", "second", "third"]
        assert widget.group_by == ["index"]

    def test_pivottable_values_index(self, superstore):
        arrays = {
            "A": [
                "bar",
                "bar",
                "bar",
                "bar",
                "baz",
                "baz",
                "baz",
                "baz",
                "foo",
                "foo",
                "foo",
                "foo",
                "qux",
                "qux",
                "qux",
                "qux",
            ],
            "B": [
                "one",
                "one",
                "two",
                "two",
                "one",
                "one",
                "two",
                "two",
                "one",
                "one",
                "two",
                "two",
                "one",
                "one",
                "two",
                "two",
            ],
            "C": [
                "X",
                "Y",
                "X",
                "Y",
                "X",
                "Y",
                "X",
                "Y",
                "X",
                "Y",
                "X",
                "Y",
                "X",
                "Y",
                "X",
                "Y",
            ],
            "D": np.arange(16),
        }

        df = pd.DataFrame(arrays)
        df_pivot = df.pivot_table(
            values=["D"], index=["A"], columns=["B", "C"], aggfunc={"D": "count"}
        )
        widget = PerspectiveWidget(df_pivot)
        assert widget.columns == ["value"]
        assert widget.split_by == ["B", "C"]
        assert widget.group_by == ["A"]

    def test_pivottable_multi_values(self, superstore):
        pt = pd.pivot_table(
            superstore,
            values=["Discount", "Sales"],
            index=["Country", "Region"],
            aggfunc={"Discount": "count", "Sales": "sum"},
            columns=["State", "Quantity"],
        )
        widget = PerspectiveWidget(pt)
        assert widget.columns == ["Discount", "Sales"]
        assert widget.split_by == ["State", "Quantity"]
        assert widget.group_by == ["Country", "Region"]
