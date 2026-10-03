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

import pyarrow as pa
from datetime import date, datetime
import perspective as psp

client = psp.Server().new_local_client()
Table = client.table


class TestToArrow(object):
    def test_to_arrow_nones_symmetric(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_big_numbers_symmetric(self):
        data = {
            "a": [1, 2, 3, 4],
            "b": [
                1.7976931348623157e308,
                1.7976931348623157e308,
                1.7976931348623157e308,
                1.7976931348623157e308,
            ],
        }
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_boolean_symmetric(self):
        data = {"a": [True, False, None, False, True, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "boolean"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_str_symmetric(self):
        data = {"a": ["a", "b", "c", "d", "e", None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "string"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_str_dict(self):
        data = {
            "a": ["abcdefg", "abcdefg", "h"],
            "b": ["aaa", "bbb", "bbb"],
            "c": ["hello", "world", "world"],
        }
        tbl = Table(data)
        assert tbl.schema() == {"a": "string", "b": "string", "c": "string"}
        arr = tbl.view().to_arrow()

        # assert that we are actually generating dict arrays
        buf = pa.BufferReader(arr)
        reader = pa.ipc.open_stream(buf)
        arrow_table = reader.read_all()
        arrow_schema = arrow_table.schema

        for name in ("a", "b", "c"):
            arrow_type = arrow_schema.field(name).type
            assert pa.types.is_dictionary(arrow_type)

        # assert that data is symmetrical
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_date_symmetric(self):
        # data = {"a": [date(2019, 7, 11), date(2016, 2, 29), date(2019, 12, 10)]}
        # tbl = Table(data)
        tbl = Table({"a": "date"})
        # data = {"a": map(lambda x: x.getTime(), [date(2019, 7, 11), date(2016, 2, 29), date(2019, 12, 10)])}
        data = {"a": [date(2019, 7, 11), date(2016, 2, 29), date(2019, 12, 10)]}
        tbl.update(data)
        assert tbl.schema() == {"a": "date"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)

        def ts(x):
            return int(datetime.timestamp(x) * 1000)

        assert tbl2.schema() == tbl.schema()
        assert tbl2.view().to_columns() == {
            "a": [
                ts(datetime(2019, 7, 11)),
                ts(datetime(2016, 2, 29)),
                ts(datetime(2019, 12, 10)),
            ]
        }

    def test_to_arrow_date_symmetric_january(self, util):
        data = {"a": [date(2019, 1, 1), date(2016, 1, 1), date(2019, 1, 1)]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "date"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)
        assert tbl2.schema() == tbl.schema()
        assert tbl2.view().to_columns() == {
            "a": [
                util.to_timestamp(x)
                for x in [
                    datetime(2019, 1, 1),
                    datetime(2016, 1, 1),
                    datetime(2019, 1, 1),
                ]
            ]
        }

    def test_to_arrow_datetime_symmetric(self, util):
        data = {
            "a": [
                datetime(2019, 7, 11, 12, 30),
                datetime(2016, 2, 29, 11, 0),
                datetime(2019, 12, 10, 12, 0),
            ]
        }
        tbl = Table(data)
        assert tbl.schema() == {"a": "datetime"}
        arr = tbl.view().to_arrow()
        tbl2 = Table(arr)
        assert tbl2.schema() == tbl.schema()
        assert tbl2.view().to_columns() == {
            "a": [
                util.to_timestamp(x)
                for x in [
                    datetime(2019, 7, 11, 12, 30),
                    datetime(2016, 2, 29, 11, 0),
                    datetime(2019, 12, 10, 12, 0),
                ]
            ]
        }

    def test_to_arrow_one_symmetric(self):
        data = {
            "a": [1, 2, 3, 4],
            "b": ["a", "b", "c", "d"],
            "c": [
                datetime(2019, 7, 11, 12, 0),
                datetime(2019, 7, 11, 12, 10),
                datetime(2019, 7, 11, 12, 20),
                datetime(2019, 7, 11, 12, 30),
            ],
        }
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        arrow = view.to_arrow()
        tbl2 = Table(arrow)
        assert tbl2.schema() == {
            "a": "integer",
            "a (sum)": "integer",
            "b": "integer",
            "c": "integer",
        }
        d = view.to_columns()
        d["a (sum)"] = d.pop("a")
        d["a"] = [x[0] if len(x) > 0 else None for x in d.pop("__ROW_PATH__")]
        assert tbl2.view().to_columns() == d

    def test_to_arrow_two_symmetric(self):
        data = {
            "a": [1, 2, 3, 4],
            "b": ["hello", "world", "hello2", "world2"],
            "c": [datetime(2019, 7, 11, 12, i) for i in range(0, 40, 10)],
        }
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        arrow = view.to_arrow()
        tbl2 = Table(arrow)
        assert tbl2.schema() == {
            "a": "integer",
            "hello|a (sum)": "integer",
            "hello|b": "integer",
            "hello|c": "integer",
            "world|a (sum)": "integer",
            "world|b": "integer",
            "world|c": "integer",
            "hello2|a (sum)": "integer",
            "hello2|b": "integer",
            "hello2|c": "integer",
            "world2|a (sum)": "integer",
            "world2|b": "integer",
            "world2|c": "integer",
        }
        d = view.to_columns()
        for name in [name for name in d if name.endswith("|a")]:
            d[name + " (sum)"] = d.pop(name)
        d["a"] = [x[0] if len(x) > 0 else None for x in d.pop("__ROW_PATH__")]
        assert tbl2.view().to_columns() == d

    def test_to_arrow_column_only_symmetric(self):
        data = {
            "a": [1, 2, 3, 4],
            "b": ["a", "b", "c", "d"],
            "c": [datetime(2019, 7, 11, 12, i) for i in range(0, 40, 10)],
        }
        tbl = Table(data)
        view = tbl.view(split_by=["a"])
        arrow = view.to_arrow()
        tbl2 = Table(arrow)
        assert tbl2.schema() == {
            "1|a": "integer",
            "1|b": "string",
            "1|c": "datetime",
            "2|a": "integer",
            "2|b": "string",
            "2|c": "datetime",
            "3|a": "integer",
            "3|b": "string",
            "3|c": "datetime",
            "4|a": "integer",
            "4|b": "string",
            "4|c": "datetime",
        }
        d = view.to_columns()
        assert tbl2.view().to_columns() == d

    # start and end row
    def test_to_arrow_start_row(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_row=3)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"a": data["a"][3:], "b": data["b"][3:]}

    def test_to_arrow_end_row(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(end_row=2)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"a": data["a"][:2], "b": data["b"][:2]}

    def test_to_arrow_start_end_row(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_row=2, end_row=3)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"a": data["a"][2:3], "b": data["b"][2:3]}

    def test_to_arrow_start_end_row_equiv(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_row=2, end_row=2)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"a": [], "b": []}

    def test_to_arrow_start_row_invalid(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_row=-1)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_end_row_invalid(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(end_row=6)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_start_end_row_invalid(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_row=-1, end_row=6)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_start_col(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_col=1)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"b": data["b"]}

    def test_to_arrow_end_col(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(end_col=1)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"a": data["a"]}

    def test_to_arrow_start_end_col(self):
        data = {
            "a": [None, 1, None, 2, 3],
            "b": [1.5, 2.5, None, 3.5, None],
            "c": [None, 1, None, 2, 3],
            "d": [1.5, 2.5, None, 3.5, None],
        }
        tbl = Table(data)
        assert tbl.schema() == {
            "a": "integer",
            "b": "float",
            "c": "integer",
            "d": "float",
        }
        arr = tbl.view().to_arrow(start_col=1, end_col=3)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {"b": data["b"], "c": data["c"]}

    def test_to_arrow_start_col_invalid(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_col=-1)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_end_col_invalid(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(end_col=6)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_start_end_col_invalid(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_col=-1, end_col=6)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == data

    def test_to_arrow_start_end_col_equiv_row(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_col=1, end_col=1, start_row=2, end_row=3)
        tbl2 = Table(arr)
        # start/end col is a range - thus start=end provides no columns
        assert tbl2.view().to_columns() == {}

    def test_to_arrow_start_end_col_equiv(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(start_col=1, end_col=1)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == {}

    def test_to_arrow_start_end_row_end_col(self):
        data = {"a": [None, 1, None, 2, 3], "b": [1.5, 2.5, None, 3.5, None]}
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float"}
        arr = tbl.view().to_arrow(end_col=1, start_row=2, end_row=3)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == tbl.view().to_columns(
            end_col=1, start_row=2, end_row=3
        )

    def test_to_arrow_start_end_col_start_row(self):
        data = {
            "a": [None, 1, None, 2, 3],
            "b": [1.5, 2.5, None, 3.5, None],
            "c": [1.5, 2.5, None, 4.5, None],
        }
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float", "c": "float"}
        arr = tbl.view().to_arrow(start_col=1, end_col=2, start_row=2)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == tbl.view().to_columns(
            start_col=1, end_col=2, start_row=2
        )

    def test_to_arrow_start_end_col_end_row(self):
        data = {
            "a": [None, 1, None, 2, 3],
            "b": [1.5, 2.5, None, 3.5, None],
            "c": [1.5, 2.5, None, 4.5, None],
        }
        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "float", "c": "float"}
        arr = tbl.view().to_arrow(start_col=1, end_col=2, end_row=2)
        tbl2 = Table(arr)
        assert tbl2.view().to_columns() == tbl.view().to_columns(
            start_col=1, end_col=2, end_row=2
        )

    def test_to_arrow_one_mean(self):
        data = {"a": [1, 2, 3, 4], "b": ["a", "a", "b", "b"]}

        table = Table(data)
        view = table.view(group_by=["b"], columns=["a"], aggregates={"a": "mean"})
        arrow = view.to_arrow()

        table2 = Table(arrow)
        view2 = table2.view()
        result = view2.to_columns()

        assert result == {"b": [None, "a", "b"], "a": [2.5, 1.5, 3.5]}
