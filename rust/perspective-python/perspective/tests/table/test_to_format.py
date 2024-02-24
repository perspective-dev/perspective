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
from datetime import date, datetime
from io import StringIO

import numpy as np
import pandas as pd
import pytz
from perspective.table import Table
from pytest import mark

IS_WIN = os.name == "nt"


class TestToFormat(object):
    # to_records

    def test_to_records_int(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == data

    def test_to_records_float(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == data

    def test_to_records_string(self):
        data = [{"a": "string1", "b": "string2"}, {"a": "string3", "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == data

    def test_to_records_date(self):
        today = date.today()
        dt = datetime(today.year, today.month, today.day)
        data = [{"a": today, "b": "string2"}, {"a": today, "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == [
            {"a": dt, "b": "string2"},
            {"a": dt, "b": "string4"},
        ]

    def test_to_records_date_no_dst(self):
        # make sure that DST does not affect the way we read dates - if tm_dst in `t_date::get_tm()` isn't set to -1, it could reverse 1hr by assuming DST is not in effect.
        today = date.today()
        dt = datetime(today.year, today.month, today.day)
        data = [{"a": today, "b": "string2"}, {"a": today, "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == [
            {"a": dt, "b": "string2"},
            {"a": dt, "b": "string4"},
        ]

    def test_to_records_date_str(self):
        data = [
            {"a": "03/11/2019", "b": "string2"},
            {"a": "03/12/2019", "b": "string4"},
        ]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == [
            {"a": datetime(2019, 3, 11), "b": "string2"},
            {"a": datetime(2019, 3, 12), "b": "string4"},
        ]

    def test_to_records_date_str_month_first(self):
        data = [{"a": "1/2/2019", "b": "string2"}, {"a": "3/4/2019", "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.schema() == {"a": date, "b": str}
        assert view.to_records() == [
            {"a": datetime(2019, 1, 2), "b": "string2"},
            {"a": datetime(2019, 3, 4), "b": "string4"},
        ]

    def test_to_records_date_str_month_ymd(self):
        data = [
            {"a": "2019/01/02", "b": "string2"},
            {"a": "2019/03/04", "b": "string4"},
        ]
        tbl = Table(data)
        view = tbl.view()
        assert view.schema() == {"a": date, "b": str}
        assert view.to_records() == [
            {"a": datetime(2019, 1, 2), "b": "string2"},
            {"a": datetime(2019, 3, 4), "b": "string4"},
        ]

    def test_to_records_datetime(self):
        dt = datetime(2019, 9, 10, 19, 30, 59, 515000)
        data = [{"a": dt, "b": "string2"}, {"a": dt, "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == data  # should have symmetric input/output

    def test_to_records_datetime_str(self):
        data = [
            {"a": "03/11/2019 3:15PM", "b": "string2"},
            {"a": "3/11/2019 3:20PM", "b": "string4"},
        ]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == [
            {"a": datetime(2019, 3, 11, 15, 15), "b": "string2"},
            {"a": datetime(2019, 3, 11, 15, 20), "b": "string4"},
        ]

    def test_to_records_datetime_str_tz(self):
        dt = "2019/07/25T15:30:00+00:00"
        data = [{"a": dt}, {"a": dt}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records()
        for r in records:
            r["a"] = r["a"].replace(tzinfo=pytz.utc)
        assert records == [
            {"a": datetime(2019, 7, 25, 15, 30, tzinfo=pytz.utc)},
            {"a": datetime(2019, 7, 25, 15, 30, tzinfo=pytz.utc)},
        ]

    def test_to_records_datetime_ms_str(self):
        data = [{"a": "03/11/2019 3:15:15.999PM"}, {"a": "3/11/2019 3:15:16.001PM"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == [
            {"a": datetime(2019, 3, 11, 15, 15, 15, 999000)},
            {"a": datetime(2019, 3, 11, 15, 15, 16, 1000)},
        ]

    def test_to_records_none(self):
        data = [{"a": None, "b": 1}, {"a": None, "b": 2}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records() == data

    def test_to_records_one(self):
        data = [{"a": 1, "b": "string1"}, {"a": 1, "b": "string2"}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        assert view.to_records() == [
            {"__ROW_PATH__": [], "a": 2, "b": 2},
            {"__ROW_PATH__": [1], "a": 2, "b": 2},
        ]

    def test_to_records_two(self):
        data = [{"a": 1, "b": "string1"}, {"a": 1, "b": "string2"}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        assert view.to_records() == [
            {
                "__ROW_PATH__": [],
                "string1|a": 1,
                "string1|b": 1,
                "string2|a": 1,
                "string2|b": 1,
            },
            {
                "__ROW_PATH__": [1],
                "string1|a": 1,
                "string1|b": 1,
                "string2|a": 1,
                "string2|b": 1,
            },
        ]

    def test_to_records_column_only(self):
        data = [{"a": 1, "b": "string1"}, {"a": 1, "b": "string2"}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"])
        assert view.to_records() == [
            {
                "string1|a": 1,
                "string1|b": "string1",
                "string2|a": None,
                "string2|b": None,
            },
            {
                "string1|a": None,
                "string1|b": None,
                "string2|a": 1,
                "string2|b": "string2",
            },
        ]

    # to_dict

    def test_to_dict_int(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {"a": [1, 3], "b": [2, 4]}

    def test_to_dict_float(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {"a": [1.5, 3.5], "b": [2.5, 4.5]}

    def test_to_dict_date(self):
        today = date.today()
        dt = datetime(today.year, today.month, today.day)
        data = [{"a": today, "b": 2}, {"a": today, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {"a": [dt, dt], "b": [2, 4]}

    def test_to_dict_datetime(self):
        dt = datetime(2019, 3, 15, 20, 30, 59, 6000)
        data = [{"a": dt, "b": 2}, {"a": dt, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {"a": [dt, dt], "b": [2, 4]}

    def test_to_dict_bool(self):
        data = [{"a": True, "b": False}, {"a": True, "b": False}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {"a": [True, True], "b": [False, False]}

    def test_to_dict_string(self):
        data = [{"a": "string1", "b": "string2"}, {"a": "string3", "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {
            "a": ["string1", "string3"],
            "b": ["string2", "string4"],
        }

    def test_to_dict_none(self):
        data = [{"a": None, "b": None}, {"a": None, "b": None}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict() == {"a": [None, None], "b": [None, None]}

    def test_to_dict_one(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        assert view.to_dict() == {"__ROW_PATH__": [[], [1]], "a": [2, 2], "b": [4, 4]}

    def test_to_dict_two(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        assert view.to_dict() == {
            "__ROW_PATH__": [[], [1]],
            "2|a": [2, 2],
            "2|b": [4, 4],
        }

    def test_to_dict_column_only(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"])
        assert view.to_dict() == {
            "2|a": [1, 1],
            "2|b": [2, 2],
        }

    def test_to_dict_one_no_columns(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], columns=[])
        assert view.to_dict() == {"__ROW_PATH__": [[], [1]]}

    def test_to_dict_two_no_columns(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"], columns=[])
        assert view.to_dict() == {"__ROW_PATH__": [[], [1]]}

    def test_to_dict_column_only_no_columns(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"], columns=[])
        assert view.to_dict() == {}

    # to_numpy

    def test_to_numpy_int(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array([1, 3]))
        assert np.array_equal(v["b"], np.array([2, 4]))

    def test_to_numpy_float(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array([1.5, 3.5]))
        assert np.array_equal(v["b"], np.array([2.5, 4.5]))

    def test_to_numpy_bool(self):
        data = [{"a": True, "b": False}, {"a": True, "b": False}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array([True, True]))
        assert np.array_equal(v["b"], np.array([False, False]))

    def test_to_numpy_date(self):
        today = date.today()
        dt = datetime(today.year, today.month, today.day)
        data = [{"a": dt, "b": 2}, {"a": dt, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array([dt, dt]))

    def test_to_numpy_datetime(self):
        dt = datetime(2019, 3, 15, 20, 30, 59, 6000)
        data = [{"a": dt}, {"a": dt}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array([dt, dt]))

    def test_to_numpy_string(self):
        data = [{"a": "string1", "b": "string2"}, {"a": "string3", "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array(["string1", "string3"]))
        assert np.array_equal(v["b"], np.array(["string2", "string4"]))

    def test_to_numpy_none(self):
        data = [{"a": None, "b": None}, {"a": None, "b": None}]
        tbl = Table(data)
        view = tbl.view()
        v = view.to_numpy()
        assert np.array_equal(v["a"], np.array([None, None]))
        assert np.array_equal(v["b"], np.array([None, None]))

    def test_to_numpy_one(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        v = view.to_numpy()
        assert np.array_equal(v["__ROW_PATH__"], np.array([[], [1]], dtype="object"))
        assert np.array_equal(v["a"], np.array([2, 2]))
        assert np.array_equal(v["b"], np.array([4, 4]))

    def test_to_numpy_two(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        v = view.to_numpy()
        assert np.array_equal(v["__ROW_PATH__"], np.array([[], [1]], dtype="object"))
        assert np.array_equal(v["2|a"], np.array([2, 2]))
        assert np.array_equal(v["2|b"], np.array([4, 4]))

    def test_to_numpy_column_only(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"])
        v = view.to_numpy()
        assert np.array_equal(v["2|a"], np.array([1, 1]))
        assert np.array_equal(v["2|b"], np.array([2, 2]))

    def test_to_pandas_df_simple(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        df = pd.DataFrame(data)
        tbl = Table(df)
        view = tbl.view()
        df2 = view.to_df()
        assert np.array_equal(df2.columns, pd.Index(["index", "a", "b"], dtype=object))
        assert np.array_equal(df2["a"].values, df["a"].values)
        assert np.array_equal(df2["b"].values, df["b"].values)

    def test_to_pandas_df_simple_series(self):
        inp = pd.Series([1, 2, 3], name="a")
        df = pd.DataFrame()
        df["a"] = pd.Series([1, 2, 3])
        tbl = Table(inp)
        view = tbl.view()
        df2 = view.to_df()
        assert np.array_equal(df2.columns, pd.Index(["index", "a"], dtype=object))
        assert np.array_equal(df2["a"].values, df["a"].values)

    # start_row/end_row
    def test_to_records_zero_over_max_row(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(end_row=1000)
        assert records == data

    def test_to_records_one_over_max_row(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        records = view.to_records(end_row=1000)
        assert records == [
            {"__ROW_PATH__": [], "a": 5, "b": 7},
            {"__ROW_PATH__": [1.5], "a": 1.5, "b": 2.5},
            {"__ROW_PATH__": [3.5], "a": 3.5, "b": 4.5},
        ]

    def test_to_records_two_over_max_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_row=1000)
        assert records == [
            {"2|a": 1, "2|b": 2, "4|a": 3, "4|b": 4, "__ROW_PATH__": []},
            {"2|a": 1, "2|b": 2, "4|a": None, "4|b": None, "__ROW_PATH__": [1]},
            {"2|a": None, "2|b": None, "4|a": 3, "4|b": 4, "__ROW_PATH__": [3]},
        ]

    def test_to_records_start_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_row=1)
        assert records == [{"a": 3, "b": 4}]

    def test_to_records_end_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(end_row=1)
        assert records == [{"a": 1, "b": 2}]

    def test_to_records_start_row_end_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}, {"a": 5, "b": 6}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_row=1, end_row=2)
        assert records == [{"a": 3, "b": 4}]

    def test_to_records_start_row_end_row_equiv(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}, {"a": 5, "b": 6}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_row=1, end_row=1)
        assert records == []

    def test_to_records_floor_start_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_row=1.5)
        assert records == [{"a": 3, "b": 4}]

    def test_to_records_ceil_end_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(end_row=0.5)
        assert records == [{"a": 1, "b": 2}]

    def test_to_records_floor_start_row_ceil_end_row(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}, {"a": 5, "b": 6}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_row=1.5, end_row=1.5)
        assert records == [{"a": 3, "b": 4}]

    def test_to_records_floor_start_row_ceil_end_row_equiv(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}, {"a": 5, "b": 6}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_row=1.5, end_row=0.5)
        assert records == []

    # start_col/end_col

    def test_to_records_zero_over_max_col(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(end_col=1000)
        assert records == data

    def test_to_records_zero_start_gt_end_col(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=2, end_col=1)
        assert records == []

    def test_to_records_zero_start_eq_end_col(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=1, end_col=1)
        assert records == []

    def test_to_records_one_over_max_col(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        records = view.to_records(end_col=1000)
        assert records == [
            {"__ROW_PATH__": [], "a": 5, "b": 7},
            {"__ROW_PATH__": [1.5], "a": 1.5, "b": 2.5},
            {"__ROW_PATH__": [3.5], "a": 3.5, "b": 4.5},
        ]

    def test_to_records_one_start_gt_end_col(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        records = view.to_records(start_col=2, end_col=1)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [1.5]},
            {"__ROW_PATH__": [3.5]},
        ]

    def test_to_records_one_start_gt_end_col_large(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        records = view.to_records(start_col=20, end_col=19)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [1.5]},
            {"__ROW_PATH__": [3.5]},
        ]

    def test_to_records_one_start_eq_end_col(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        records = view.to_records(start_col=0, end_col=0)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [1.5]},
            {"__ROW_PATH__": [3.5]},
        ]

    def test_to_records_two_over_max_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_col=1000)
        assert records == [
            {"2|a": 1, "2|b": 2, "4|a": 3, "4|b": 4, "__ROW_PATH__": []},
            {"2|a": 1, "2|b": 2, "4|a": None, "4|b": None, "__ROW_PATH__": [1]},
            {"2|a": None, "2|b": None, "4|a": 3, "4|b": 4, "__ROW_PATH__": [3]},
        ]

    def test_to_records_start_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=1)
        assert records == [{"b": 2}, {"b": 4}]

    def test_to_records_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(end_col=1)
        assert records == [{"a": 1}, {"a": 3}]

    def test_to_records_two_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_row=12, end_col=5)
        assert records == [
            {"2|a": 1, "2|b": 2, "4|a": 3, "4|b": 4, "__ROW_PATH__": []},
            {"2|a": 1, "2|b": 2, "4|a": None, "4|b": None, "__ROW_PATH__": [1]},
            {"2|a": None, "2|b": None, "4|a": 3, "4|b": 4, "__ROW_PATH__": [3]},
        ]

    def test_to_records_two_start_gt_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_row=12, start_col=5, end_col=4)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [1]},
            {"__ROW_PATH__": [3]},
        ]

    def test_to_records_two_start_gt_end_col_large_overage(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_row=12, start_col=50, end_col=49)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [1]},
            {"__ROW_PATH__": [3]},
        ]

    def test_to_records_two_start_end_col_equiv(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_row=12, start_col=5, end_col=5)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [1]},
            {"__ROW_PATH__": [3]},
        ]

    def test_to_records_two_sorted_start_gt_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"], sort=[["a", "desc"]])
        records = view.to_records(end_row=12, start_col=5, end_col=4)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [3]},
            {"__ROW_PATH__": [1]},
        ]

    def test_to_records_two_sorted_start_gt_end_col_large_overage(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"], sort=[["a", "desc"]])
        records = view.to_records(end_row=12, start_col=20, end_col=30)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [3]},
            {"__ROW_PATH__": [1]},
        ]

    def test_to_records_two_sorted_start_gt_end_col_overage(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(
            columns=[], group_by=["a"], split_by=["b"], sort=[["a", "desc"]]
        )
        records = view.to_records(end_row=12, start_col=1, end_col=3)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [3]},
            {"__ROW_PATH__": [1]},
        ]

    def test_to_records_two_sorted_start_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"], sort=[["a", "desc"]])
        records = view.to_records(start_col=1, end_col=2)
        assert records == [
            {"2|b": 2, "__ROW_PATH__": []},
            {"2|b": None, "__ROW_PATH__": [3]},
            {"2|b": 2, "__ROW_PATH__": [1]},
        ]

    def test_to_records_two_sorted_start_end_col_equiv(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"], sort=[["a", "desc"]])
        records = view.to_records(end_row=12, start_col=5, end_col=5)
        assert records == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": [3]},
            {"__ROW_PATH__": [1]},
        ]

    def test_to_records_start_col_end_col(self):
        data = [{"a": 1, "b": 2, "c": 3}, {"a": 3, "b": 4, "c": 5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=1, end_col=2)
        # start_col and end_col access columns at that index - dict key order not guaranteed in python2
        assert records == [{"b": 2}, {"b": 4}]

    def test_to_records_start_col_end_col_equiv(self):
        data = [{"a": 1, "b": 2, "c": 3}, {"a": 3, "b": 4, "c": 5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=1, end_col=1)
        assert records == []

    def test_to_records_floor_start_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=1.5)
        assert records == [{"b": 2}, {"b": 4}]

    def test_to_records_ceil_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(end_col=1)
        assert records == [{"a": 1}, {"a": 3}]

    def test_to_records_two_ceil_end_col(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        records = view.to_records(end_row=12, end_col=4.5)
        assert records == [
            {"2|a": 1, "2|b": 2, "4|a": 3, "4|b": 4, "__ROW_PATH__": []},
            {"2|a": 1, "2|b": 2, "4|a": None, "4|b": None, "__ROW_PATH__": [1]},
            {"2|a": None, "2|b": None, "4|a": 3, "4|b": 4, "__ROW_PATH__": [3]},
        ]

    def test_to_records_floor_start_col_ceil_end_col(self):
        data = [{"a": 1, "b": 2, "c": 3}, {"a": 3, "b": 4, "c": 5}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(start_col=1.5, end_col=1.5)
        # start_col and end_col access columns at that index - dict key order not guaranteed in python2
        assert records == [{"b": 2}, {"b": 4}]

    def test_to_dict_start_col_end_col(self):
        data = [{"a": 1, "b": 2, "c": 3, "d": 4}, {"a": 3, "b": 4, "c": 5, "d": 6}]
        tbl = Table(data)
        view = tbl.view()
        d = view.to_dict(start_col=1, end_col=3)
        assert d == {"b": [2, 4], "c": [3, 5]}

    # to csv

    def test_to_csv_symmetric(self):
        csv = "a,b\n1,2\n3,4"
        df = pd.read_csv(StringIO(csv))
        tbl = Table(df)
        view = tbl.view()
        assert view.to_csv() == '"index","a","b"\n0,1,2\n1,3,4\n'

    def test_to_csv_int(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv() == '"a","b"\n1,2\n3,4\n'

    def test_to_csv_float(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv() == '"a","b"\n1.5,2.5\n3.5,4.5\n'

    def test_to_csv_date(self):
        today = date.today()
        dt_str = today.strftime("%Y-%m-%d")
        data = [{"a": today, "b": 2}, {"a": today, "b": 4}]
        tbl = Table(data)
        assert tbl.schema()["a"] == date
        view = tbl.view()
        assert view.to_csv() == '"a","b"\n{},2\n{},4\n'.format(dt_str, dt_str)

    def test_to_csv_datetime(self):
        dt = datetime(2019, 3, 15, 20, 30, 59, 6000)
        dt_str = dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        data = [{"a": dt, "b": 2}, {"a": dt, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv() == '"a","b"\n{},2\n{},4\n'.format(dt_str, dt_str)

    def test_to_csv_bool(self):
        data = [{"a": True, "b": False}, {"a": True, "b": False}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv() == '"a","b"\ntrue,false\ntrue,false\n'

    def test_to_csv_string(self):
        data = [{"a": "string1", "b": "string2"}, {"a": "string3", "b": "string4"}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv() == '"a","b"\n"string1","string2"\n"string3","string4"\n'

    def test_to_csv_none(self):
        data = [{"a": None, "b": None}, {"a": None, "b": None}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv() == '"a","b"\n,\n,\n'

    def test_to_csv_custom_rows(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv(start_row=1) == '"a","b"\n3,4\n'

    def test_to_csv_custom_cols(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv(start_col=1) == '"b"\n2\n4\n'

    def test_to_csv_custom_rows_cols(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_csv(start_row=1, start_col=1) == '"b"\n4\n'

    def test_to_csv_one(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"])
        assert view.to_csv() == '"a (Group by 1)","a","b"\n,2,4\n1,2,4\n'

    def test_to_csv_two(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        assert view.to_csv() == '"a (Group by 1)","2|a","2|b"\n,2,4\n1,2,4\n'

    def test_to_csv_column_only(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"])
        assert view.to_csv() == '"2|a","2|b"\n1,2\n1,2\n'

    def test_to_csv_one_no_columns(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], columns=[])
        assert view.to_csv() == '"a (Group by 1)"\n\n1\n'

    def test_to_csv_two_no_columns(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"], columns=[])
        assert view.to_csv() == '"a (Group by 1)"\n\n1\n'

    def test_to_csv_column_only_no_columns(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(split_by=["b"], columns=[])

        assert view.to_csv() == ""

    # implicit index

    def test_to_format_implicit_index_records(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records(index=True) == [
            {"__INDEX__": [0], "a": 1.5, "b": 2.5},
            {"__INDEX__": [1], "a": 3.5, "b": 4.5},
        ]

    def test_to_format_implicit_index_dict(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict(index=True) == {
            "__INDEX__": [[0], [1]],
            "a": [1.5, 3.5],
            "b": [2.5, 4.5],
        }

    def test_to_format_implicit_id_records(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_records(id=True) == [
            {"__ID__": [0], "a": 1.5, "b": 2.5},
            {"__ID__": [1], "a": 3.5, "b": 4.5},
        ]

    def test_to_format_implicit_id_dict(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        assert view.to_dict(id=True) == {
            "__ID__": [[0], [1]],
            "a": [1.5, 3.5],
            "b": [2.5, 4.5],
        }

    def test_to_format_implicit_index_two_dict(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        assert view.to_dict(index=True) == {
            "2.5|a": [1.5, 1.5, None],
            "2.5|b": [2.5, 2.5, None],
            "4.5|a": [3.5, None, 3.5],
            "4.5|b": [4.5, None, 4.5],
            "__INDEX__": [
                [],
                [],
                [],
            ],  # index needs to be the same length as each column
            "__ROW_PATH__": [[], [1.5], [3.5]],
        }

    def test_to_format_implicit_index_two_dict(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        assert view.to_dict(id=True) == {
            "2.5|a": [1.5, 1.5, None],
            "2.5|b": [2.5, 2.5, None],
            "4.5|a": [3.5, None, 3.5],
            "4.5|b": [4.5, None, 4.5],
            "__ID__": [
                [],
                [1.5],
                [3.5],
            ],  # index needs to be the same length as each column
            "__ROW_PATH__": [[], [1.5], [3.5]],
        }

    def test_to_format_implicit_index_np(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data)
        view = tbl.view()
        cols = view.to_numpy(index=True)
        assert np.array_equal(cols["__INDEX__"], np.array([[0], [1]]))

    def test_to_format_explicit_index_records(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data, index="a")
        view = tbl.view()
        assert view.to_records(index=True) == [
            {"__INDEX__": [1.5], "a": 1.5, "b": 2.5},
            {"__INDEX__": [3.5], "a": 3.5, "b": 4.5},
        ]

    def test_to_format_explicit_index_dict(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data, index="a")
        view = tbl.view()
        assert view.to_dict(index=True) == {
            "__INDEX__": [[1.5], [3.5]],
            "a": [1.5, 3.5],
            "b": [2.5, 4.5],
        }

    def test_to_format_explicit_index_np(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.5, "b": 4.5}]
        tbl = Table(data, index="a")
        view = tbl.view()
        cols = view.to_numpy(index=True)
        assert np.array_equal(cols["__INDEX__"], np.array([[1.5], [3.5]]))

    def test_to_format_explicit_index_str_records(self):
        data = [{"a": "a", "b": 2.5}, {"a": "b", "b": 4.5}]
        tbl = Table(data, index="a")
        view = tbl.view()
        assert view.to_records(index=True) == [
            {"__INDEX__": ["a"], "a": "a", "b": 2.5},
            {"__INDEX__": ["b"], "a": "b", "b": 4.5},
        ]

    def test_to_format_explicit_index_datetime_records(self):
        data = [
            {"a": datetime(2019, 7, 11, 9, 0), "b": 2.5},
            {"a": datetime(2019, 7, 11, 9, 1), "b": 4.5},
        ]
        tbl = Table(data, index="a")
        view = tbl.view()
        assert view.to_records(index=True) == [
            {
                "__INDEX__": [datetime(2019, 7, 11, 9, 0)],
                "a": datetime(2019, 7, 11, 9, 0),
                "b": 2.5,
            },
            {
                "__INDEX__": [datetime(2019, 7, 11, 9, 1)],
                "a": datetime(2019, 7, 11, 9, 1),
                "b": 4.5,
            },
        ]
