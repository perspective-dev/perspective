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

import pandas as pd
import numpy as np
from perspective import PerspectiveError
from datetime import date, datetime
from pytest import approx, mark, raises

import perspective as psp

client = psp.Server().new_local_client()
Table = client.table


def date_timestamp(date):
    return int(datetime.combine(date, datetime.min.time()).timestamp()) * 1000


def compare_delta(received, expected):
    """Compare an arrow-serialized row delta by constructing a Table."""
    tbl = Table(received)
    assert tbl.view().to_columns() == expected


class TestView(object):
    def test_view_zero(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        tbl2 = Table(view)
        view2 = tbl2.view()
        dimms = view2.dimensions()
        assert dimms["num_view_rows"] == 2
        assert dimms["num_view_columns"] == 2
        assert view2.schema() == {"a": "integer", "b": "integer"}
        assert view2.to_records() == data

    def test_view_one(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        tbl2 = Table(view)
        view2 = tbl2.view()

        dimms = view2.dimensions()
        assert dimms["num_view_rows"] == 3
        assert dimms["num_view_columns"] == 3
        assert view2.schema() == {
            "a": "integer",
            "a (sum)": "integer",
            "b": "integer",
        }

        assert view2.to_records() == [
            {"a": None, "a (sum)": 4, "b": 6},
            {"a": 1, "a (sum)": 1, "b": 2},
            {"a": 3, "a (sum)": 3, "b": 4},
        ]

    def test_view_two(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        tbl2 = Table(view)
        view2 = tbl2.view()
        dimms = view2.dimensions()
        assert dimms["num_view_rows"] == 3
        assert dimms["num_view_columns"] == 5
        assert view2.schema() == {
            "a": "integer",
            "2|a (sum)": "integer",
            "2|b": "integer",
            "4|a (sum)": "integer",
            "4|b": "integer",
        }

        assert view2.to_records() == [
            {
                "a": None,
                "2|a (sum)": 1,
                "2|b": 2,
                "4|a (sum)": 3,
                "4|b": 4,
            },
            {
                "a": 1,
                "2|a (sum)": 1,
                "2|b": 2,
                "4|a (sum)": None,
                "4|b": None,
            },
            {
                "a": 3,
                "2|a (sum)": None,
                "2|b": None,
                "4|a (sum)": 3,
                "4|b": 4,
            },
        ]

    def test_view_two_column_only(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"])
        tbl2 = Table(view)
        view2 = tbl2.view()
        dimms = view2.dimensions()
        assert dimms["num_view_rows"] == 2
        assert dimms["num_view_columns"] == 4
        assert view2.schema() == {
            "2|a": "integer",
            "2|b": "integer",
            "4|a": "integer",
            "4|b": "integer",
        }

        assert view2.to_records() == [
            {"2|a": 1, "2|b": 2, "4|a": None, "4|b": None},
            {"2|a": None, "2|b": None, "4|a": 3, "4|b": 4},
        ]


def _sorted(records):
    return sorted(sorted((k, str(v)) for k, v in r.items()) for r in records)


class TestFlatDerivedReplica(object):
    def test_flat_derived_group_by_replicates_to_another_client(self):
        server = psp.Server()
        client0 = server.new_local_client()
        client1 = server.new_local_client()
        src = client0.table({"k": "integer", "g": "string", "x": "integer"}, index="k")

        src.update(
            [
                {"k": 1, "g": "a", "x": 1},
                {"k": 2, "g": "b", "x": 2},
                {"k": 3, "g": "a", "x": 3},
                {"k": 4, "g": None, "x": 4},
            ]
        )

        view = src.view(group_by=["g"], columns=["x"], group_rollup_mode="flat")
        derived = client0.table(view, name="derived_flat")
        derived_view = derived.view()
        replica = client1.table(client1.open_table("derived_flat").view())
        replica_view = replica.view()
        assert derived.get_index() == "g"
        assert replica.get_index() == "g"

        def same():
            return _sorted(derived_view.to_records()) == _sorted(
                replica_view.to_records()
            )

        assert same()
        src.update([{"k": 1, "x": 10}])
        assert same()
        src.update([{"k": 5, "g": "c", "x": 5}])
        assert same()
        src.update([{"k": 2, "g": "a"}])
        assert same()
        assert _sorted(replica_view.to_records()) == _sorted(
            [{"g": None, "x": 4}, {"g": "a", "x": 15}, {"g": "c", "x": 5}]
        )

        src.remove([5])
        assert same()
        assert replica.size() == 2
        src.clear()
        assert same()
        assert replica.size() == 0
        src.replace([{"k": 7, "g": "z", "x": 7}, {"k": 8, "g": "z", "x": 8}])
        assert same()
        assert replica_view.to_records() == [{"g": "z", "x": 15}]

    def test_flat_derived_two_keys_replicates_with_a_composite_index(self):
        server = psp.Server()
        client0 = server.new_local_client()
        client1 = server.new_local_client()
        src = client0.table(
            {"k": "integer", "g": "string", "h": "string", "x": "integer"},
            index="k",
        )

        src.update(
            [
                {"k": 1, "g": "a", "h": "p", "x": 1},
                {"k": 2, "g": "a", "h": "q", "x": 2},
                {"k": 3, "g": "b", "h": "p", "x": 3},
            ]
        )

        view = src.view(group_by=["g", "h"], columns=["x"], group_rollup_mode="flat")

        derived = client0.table(view, name="derived_flat_gh")
        derived_view = derived.view()
        replica = client1.table(client1.open_table("derived_flat_gh").view())
        replica_view = replica.view()
        assert derived.get_index() == ["g", "h"]
        assert replica.get_index() == ["g", "h"]
        src.update([{"k": 2, "g": "b"}])
        assert _sorted(derived_view.to_records()) == _sorted(replica_view.to_records())

        assert _sorted(replica_view.to_records()) == _sorted(
            [
                {"g": "a", "h": "p", "x": 1},
                {"g": "b", "h": "p", "x": 3},
                {"g": "b", "h": "q", "x": 2},
            ]
        )
