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

from perspective.table import Table


class TestRemove(object):
    def test_remove_all(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")
        tbl.remove(["abc"])
        assert tbl.view().to_records() == []
        # assert tbl.size() == 0

    def test_remove_nonsequential(self):
        tbl = Table(
            [{"a": "abc", "b": 123}, {"a": "def", "b": 456}, {"a": "efg", "b": 789}],
            index="a",
        )
        tbl.remove(["abc", "efg"])
        assert tbl.view().to_records() == [{"a": "def", "b": 456}]
        # assert tbl.size() == 1

    def test_remove_multiple_single(self):
        tbl = Table({"a": int, "b": str}, index="a")
        for i in range(0, 10):
            tbl.update([{"a": i, "b": str(i)}])
        for i in range(1, 10):
            tbl.remove([i])
        assert tbl.view().to_records() == [{"a": 0, "b": "0"}]
        # assert tbl.size() == 0

    def test_remove_expressions(self):
        schema = {"key": str, "delta$": float, "business_line": str}
        data = [
            {
                "key": "A",
                "delta$": 46412.3804275,
            },
            {
                "key": "B",
                "delta$": 2317615.875,
            },
        ]

        table = Table(schema, index="key")
        table.update(data)
        table.remove(["A"])
        view = table.view(
            group_by=["business_line"],
            columns=["delta$", "alias"],
            expressions={
                "alias": '"delta$"',
            },
        )

        records = view.to_records()
        assert records == [
            {"__ROW_PATH__": [], "delta$": 2317615.875, "alias": 2317615.875},
            {"__ROW_PATH__": [None], "delta$": 2317615.875, "alias": 2317615.875},
        ]

    def test_remove_expressions_after_view(self):
        schema = {"key": str, "delta$": float, "business_line": str}
        data = [
            {
                "key": "A",
                "delta$": 46412.3804275,
            },
            {
                "key": "B",
                "delta$": 2317615.875,
            },
        ]

        table = Table(schema, index="key")
        table.update(data)
        view = table.view(
            group_by=["business_line"],
            columns=["delta$", "alias"],
            expressions={
                "alias": '"delta$"',
            },
        )

        table.remove(["A"])
        records = view.to_records()
        assert records == [
            {"__ROW_PATH__": [], "delta$": 2317615.875, "alias": 2317615.875},
            {"__ROW_PATH__": [None], "delta$": 2317615.875, "alias": 2317615.875},
        ]
