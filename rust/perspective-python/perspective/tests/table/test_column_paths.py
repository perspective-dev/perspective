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

import perspective as psp

client = psp.Server().new_local_client()


class TestViewColumnPaths:
    def test_column_paths(self, superstore):
        tbl = client.table(superstore)
        view = tbl.view()
        paths = view.column_paths()
        assert paths == [
            "index",
            "Row ID",
            "Order ID",
            "Order Date",
            "Ship Date",
            "Ship Mode",
            "Customer ID",
            "Segment",
            "Country",
            "City",
            "State",
            "Postal Code",
            "Region",
            "Product ID",
            "Category",
            "Sub-Category",
            "Sales",
            "Quantity",
            "Discount",
            "Profit",
        ]

        view.delete()
        tbl.delete()

    def test_column_paths_split_by(self, superstore):
        tbl = client.table(superstore)
        view = tbl.view(group_by=["State"], columns=["Sales"], split_by=["Ship Mode"])
        paths = view.column_paths()
        assert paths == [
            "First Class|Sales",
            "Second Class|Sales",
            "Standard Class|Sales",
        ]

        view.delete()
        tbl.delete()

    def test_column_paths_split_by_range(self, superstore):
        tbl = client.table(superstore)
        view = tbl.view(group_by=["State"], columns=["Sales"], split_by=["Ship Mode"])
        paths = view.column_paths(start_col=1)
        assert paths == [
            "Second Class|Sales",
            "Standard Class|Sales",
        ]

        view.delete()
        view = tbl.view(group_by=["State"], columns=["Sales"], split_by=["Ship Mode"])
        paths = view.column_paths(start_col=1, end_col=2)
        assert paths == [
            "Second Class|Sales",
        ]

        view.delete()
        tbl = client.table(superstore)
        view = tbl.view(group_by=["State"], columns=["Sales"], split_by=["Ship Mode"])
        paths = view.column_paths(end_col=1)
        assert paths == [
            "First Class|Sales",
        ]

        view.delete()
        tbl.delete()
