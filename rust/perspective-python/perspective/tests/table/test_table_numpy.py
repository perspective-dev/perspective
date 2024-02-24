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

from datetime import date, datetime

import numpy as np
import pandas as pd
from perspective import PerspectiveError
from perspective.table import Table
from pytest import raises


class TestTableNumpy(object):
    def test_empty_table(self):
        tbl = Table([])
        assert tbl.size() == 0

    def test_table_int(self):
        data = {"a": np.array([1, 2, 3]), "b": np.array([4, 5, 6])}
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {"a": [1, 2, 3], "b": [4, 5, 6]}

    def test_table_int_lots_of_columns(self):
        data = {
            "a": np.array([1, 2, 3]),
            "b": np.array([4, 5, 6]),
            "c": np.array([4, 5, 6]),
            "d": np.array([4, 5, 6]),
            "e": np.array([4, 5, 6]),
            "f": np.array([4, 5, 6]),
        }
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {
            "a": [1, 2, 3],
            "b": [4, 5, 6],
            "c": [4, 5, 6],
            "d": [4, 5, 6],
            "e": [4, 5, 6],
            "f": [4, 5, 6],
        }

    def test_table_int_with_None(self):
        data = {
            "a": np.array([1, 2, 3, None, None]),
            "b": np.array([4, 5, 6, None, None]),
        }
        tbl = Table(data)
        assert tbl.size() == 5
        assert tbl.view().to_dict() == {
            "a": [1, 2, 3, None, None],
            "b": [4, 5, 6, None, None],
        }

    def test_table_int8(self):
        data = {
            "a": np.array([1, 2, 3]).astype(np.int8),
            "b": np.array([4, 5, 6]).astype(np.int8),
        }
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {"a": [1, 2, 3], "b": [4, 5, 6]}

    def test_table_int16(self):
        data = {
            "a": np.array([1, 2, 3]).astype(np.int16),
            "b": np.array([4, 5, 6]).astype(np.int16),
        }
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {"a": [1, 2, 3], "b": [4, 5, 6]}

    def test_table_int32(self):
        data = {
            "a": np.array([1, 2, 3]).astype(np.int32),
            "b": np.array([4, 5, 6]).astype(np.int32),
        }
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {"a": [1, 2, 3], "b": [4, 5, 6]}

    def test_table_int64(self):
        data = {
            "a": np.array([1, 2, 3]).astype(np.int64),
            "b": np.array([4, 5, 6]).astype(np.int64),
        }
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {"a": [1, 2, 3], "b": [4, 5, 6]}

    def test_table_float(self):
        data = {"a": np.array([1.1, 2.2]), "b": np.array([3.3, 4.4])}
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": [1.1, 2.2], "b": [3.3, 4.4]}

    def test_table_float32(self):
        data = {
            "a": np.array([1.1, 2.2]).astype(np.float32),
            "b": np.array([3.3, 4.4]).astype(np.float32),
        }
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {
            # py::cast automatically upcasts to 64-bit float
            "a": [1.100000023841858, 2.200000047683716],
            "b": [3.299999952316284, 4.400000095367432],
        }

    def test_table_float64(self):
        data = {
            "a": np.array([1.1, 2.2]).astype(np.float64),
            "b": np.array([3.3, 4.4]).astype(np.float64),
        }
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": [1.1, 2.2], "b": [3.3, 4.4]}

    # booleans

    def test_table_bool(self):
        data = {"a": np.array([True, False]), "b": np.array([False, True])}
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": [True, False], "b": [False, True]}

    def test_table_bool8(self):
        data = {
            "a": np.array([True, False]).astype(np.bool8),
            "b": np.array([False, True]).astype(np.bool8),
        }
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": [True, False], "b": [False, True]}

    def test_table_bool_with_none(self):
        data = {
            "a": np.array([True, False, None, False]),
            "b": np.array([False, True, None, False]),
        }
        tbl = Table(data)
        assert tbl.size() == 4
        assert tbl.view().to_dict() == {
            "a": [True, False, None, False],
            "b": [False, True, None, False],
        }

    def test_table_bool_with_dtype(self):
        data = {
            "a": np.array([True, False, False], dtype="?"),
            "b": np.array([False, True, False], dtype="?"),
        }
        tbl = Table(data)
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {
            "a": [True, False, False],
            "b": [False, True, False],
        }

    def test_table_bool_str(self):
        data = {"a": np.array(["True", "False"]), "b": np.array(["False", "True"])}
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": bool, "b": bool}
        assert tbl.view().to_dict() == {"a": [True, False], "b": [False, True]}

    # strings

    def test_table_str_object(self):
        data = {
            "a": np.array(["abc", "def"], dtype=object),
            "b": np.array(["hij", "klm"], dtype=object),
        }
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": ["abc", "def"], "b": ["hij", "klm"]}

    def test_table_str_dtype(self):
        dtype = "U3"
        data = {
            "a": np.array(["abc", "def"], dtype=dtype),
            "b": np.array(["hij", "klm"], dtype=dtype),
        }
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": ["abc", "def"], "b": ["hij", "klm"]}

    # date and datetime

    def test_table_date(self):
        data = {"a": np.array([date(2019, 7, 11)]), "b": np.array([date(2019, 7, 12)])}
        tbl = Table(data)
        assert tbl.size() == 1
        assert tbl.schema() == {"a": date, "b": date}
        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11)],
            "b": [datetime(2019, 7, 12)],
        }

    def test_table_np_datetime(self):
        data = {
            "a": np.array([datetime(2019, 7, 11, 12, 13)], dtype="datetime64[ns]"),
            "b": np.array([datetime(2019, 7, 11, 12, 14)], dtype="datetime64[ns]"),
        }
        tbl = Table(data)
        assert tbl.size() == 1
        assert tbl.schema() == {"a": datetime, "b": datetime}
        assert tbl.view().to_numpy() == {
            "a": np.array([datetime(2019, 7, 11, 12, 13)], dtype=object),
            "b": np.array([datetime(2019, 7, 11, 12, 14)], dtype=object),
        }

    def test_table_np_datetime_mixed_dtype(self):
        data = {
            "a": np.array([datetime(2019, 7, 11, 12, 13)], dtype="datetime64[ns]"),
            "b": np.array([datetime(2019, 7, 11, 12, 14)], dtype=object),
        }
        tbl = Table(data)
        assert tbl.size() == 1
        assert tbl.schema() == {"a": datetime, "b": datetime}
        assert tbl.view().to_numpy() == {
            "a": np.array([datetime(2019, 7, 11, 12, 13)], dtype=object),
            "b": np.array([datetime(2019, 7, 11, 12, 14)], dtype=object),
        }

    def test_table_np_datetime_default(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[ns]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_string_dtype(self):
        data = ["2019/07/11 15:30:05", "2019/07/11 15:30:05"]
        tbl = Table({"a": np.array(data)})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 15, 30, 5), datetime(2019, 7, 11, 15, 30, 5)]
        }

    def test_table_np_datetime_string_on_schema(self):
        data = ["2019/07/11 15:30:05", "2019/07/11 15:30:05"]
        tbl = Table({"a": datetime})

        tbl.update({"a": data})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 15, 30, 5), datetime(2019, 7, 11, 15, 30, 5)]
        }

    def test_table_np_datetime_ns(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[ns]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_us(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[us]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_ms(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[ms]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_s(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[s]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_m(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[m]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_h(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[h]")}
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_table_np_datetime_D(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[D]")}
        )

        assert tbl.schema() == {"a": date}

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 0, 0)]}

    def test_table_np_datetime_W(self):
        tbl = Table(
            {"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[W]")}
        )

        assert tbl.schema() == {"a": date}

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 11, 0, 0)]}

    def test_table_np_datetime_M(self):
        tbl = Table(
            {
                "a": np.array(
                    [
                        datetime(2019, 5, 12, 11, 0),
                        datetime(2019, 6, 12, 11, 0),
                        datetime(2019, 7, 12, 11, 0),
                    ],
                    dtype="datetime64[M]",
                )
            }
        )

        assert tbl.schema() == {"a": date}

        assert tbl.view().to_dict() == {
            "a": [
                datetime(2019, 5, 1, 0, 0),
                datetime(2019, 6, 1, 0, 0),
                datetime(2019, 7, 1, 0, 0),
            ]
        }

    def test_table_np_datetime_Y(self):
        tbl = Table(
            {
                "a": np.array(
                    [
                        datetime(2017, 5, 12, 11, 0),
                        datetime(2018, 6, 12, 11, 0),
                        datetime(2019, 7, 12, 11, 0),
                    ],
                    dtype="datetime64[Y]",
                )
            }
        )

        assert tbl.schema() == {"a": date}

        assert tbl.view().to_dict() == {
            "a": [
                datetime(2017, 1, 1, 0, 0),
                datetime(2018, 1, 1, 0, 0),
                datetime(2019, 1, 1, 0, 0),
            ]
        }

    def test_table_np_datetime_ms_nat(self):
        tbl = Table(
            {
                "a": np.array(
                    [datetime(2019, 7, 12, 11, 0), np.datetime64("nat")],
                    dtype="datetime64[ms]",
                )
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0), None]}

    def test_table_np_datetime_s_nat(self):
        tbl = Table(
            {
                "a": np.array(
                    [datetime(2019, 7, 12, 11, 0), np.datetime64("nat")],
                    dtype="datetime64[s]",
                )
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0), None]}

    def test_table_np_timedelta(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[ns]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[ns]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["950400000000000 nanoseconds"]}

    def test_table_np_timedelta_us(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[us]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[us]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["950400000000 microseconds"]}

    def test_table_np_timedelta_ms(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[ms]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[ms]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["950400000 milliseconds"]}

    def test_table_np_timedelta_s(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[s]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[s]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["950400 seconds"]}

    def test_table_np_timedelta_m(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[m]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[m]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["15840 minutes"]}

    def test_table_np_timedelta_h(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[h]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[h]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["264 hours"]}

    def test_table_np_timedelta_d(self):
        tbl = Table(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype="datetime64[D]")
                - np.array([datetime(2019, 7, 1, 11, 0)], dtype="datetime64[D]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": ["11 days"]}

    def test_table_np_timedelta_with_none(self):
        tbl = Table(
            {
                "a": np.array(
                    [None, datetime(2019, 7, 12, 11, 0)], dtype="datetime64[ns]"
                )
                - np.array([datetime(2019, 7, 1, 11, 0), None], dtype="datetime64[ns]")
            }
        )

        assert tbl.schema() == {"a": str}

        assert tbl.view().to_dict() == {"a": [None, None]}  # two `NaT` values

    def test_table_np_mixed(self):
        data = {
            "a": np.arange(5),
            "b": np.full(5, np.nan),
            "c": ["a", "b", "c", "d", "e"],
        }

        # should not be able to parse mixed dicts of numpy array with list
        with raises(PerspectiveError):
            Table(data)

    def test_table_np_promote(self):
        data = {
            "a": np.arange(5),
            "b": np.full(5, np.nan),
            "c": np.array([1, 2, 3, 2147483648, 5]),
        }
        tbl = Table({"a": int, "b": float, "c": int})
        tbl.update(data)
        assert tbl.size() == 5
        assert tbl.schema() == {"a": int, "b": float, "c": int}

        assert tbl.view().to_dict() == {
            "a": [0, 1, 2, 3, 4],
            "b": [None, None, None, None, None],
            "c": [1.0, 2.0, 3.0, 2147483648.0, 5.0],
        }

    def test_table_np_promote_to_string(self):
        data = {
            "a": np.arange(4),
            "b": np.array([1, 2, "abc", "abc"]),
        }
        tbl = Table(data)
        assert tbl.size() == 4
        assert tbl.schema() == {
            "a": int,
            "b": str,
        }

        assert tbl.view().to_dict() == {
            "a": [0, 1, 2, 3],
            "b": ["1", "2", "abc", "abc"],
        }

    def test_table_np_implicit_index(self):
        data = {
            "a": np.array(["a", "b", "c", "d", "e"]),
            "b": np.array([1, 2, 3, 4, 5]),
        }
        tbl = Table(data)
        assert tbl.size() == 5
        assert tbl.schema() == {"a": str, "b": int}
        tbl.update(
            {
                "__INDEX__": np.array([1, 2, 3, 4]),
                "a": np.array(["bb", "cc", "dd", "ee"]),
            }
        )

        assert tbl.view().to_dict() == {
            "a": ["a", "bb", "cc", "dd", "ee"],
            "b": [1, 2, 3, 4, 5],
        }

    # from schema

    def test_table_numpy_from_schema_int(self):
        df = {"a": np.array([1, None, 2, None, 3, 4])}
        table = Table({"a": int})
        table.update(df)
        assert table.view().to_dict()["a"] == [1, None, 2, None, 3, 4]

    def test_table_numpy_from_schema_bool(self):
        data = [True, False, True, False]
        df = {"a": data}
        table = Table({"a": bool})
        table.update(df)
        assert table.view().to_dict()["a"] == data

    def test_table_numpy_from_schema_float(self):
        data = [1.5, None, 2.5, None, 3.5, 4.5]
        df = {"a": np.array(data)}
        table = Table({"a": float})
        table.update(df)
        assert table.view().to_dict()["a"] == data

    def test_table_numpy_from_schema_float_all_nan(self):
        data = [np.nan, np.nan, np.nan, np.nan]
        df = {"a": np.array(data)}
        table = Table({"a": float})
        table.update(df)
        assert table.view().to_dict()["a"] == [None, None, None, None]

    def test_table_numpy_from_schema_float_to_int(self):
        data = [None, 1.5, None, 2.5, None, 3.5, 4.5]
        df = {"a": np.array(data)}
        table = Table({"a": int})
        table.update(df)
        # truncates decimal
        assert table.view().to_dict()["a"] == [None, 1, None, 2, None, 3, 4]

    def test_table_numpy_from_schema_float_to_int_with_nan(self):
        df = {"a": np.array([np.nan, 1.5, np.nan, 2.5, np.nan, 3.5, 4.5])}
        table = Table({"a": int})
        table.update(df)
        # truncates decimal
        assert table.view().to_dict()["a"] == [None, 1, None, 2, None, 3, 4]

    def test_table_numpy_from_schema_float_to_int_with_nan_partial(self):
        df = {"a": np.array([np.nan, 1.5, np.nan, 2.5, np.nan, 3.5, 4.5])}
        table = Table({"a": int, "b": int})
        table.update(df)
        assert table.size() == 7
        # truncates decimal
        assert table.view().to_dict() == {
            "a": [None, 1, None, 2, None, 3, 4],
            "b": [None, None, None, None, None, None, None],
        }

    def test_table_numpy_from_schema_float_to_int_with_nan_partial_indexed(self):
        """Assert that the null masking works even when primary keys
        are being reordered."""
        df = {
            "a": np.array([np.nan, 1.5, np.nan, 2.5, np.nan, 3.5, 4.5]),
            "b": np.array([1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]),
        }
        table = Table({"a": int, "b": int}, index="b")
        table.update(df)

        # truncates decimal
        assert table.view().to_dict() == {
            "a": [None, 1, None, 2, None, 3, 4],
            "b": [1, 2, 3, 4, 5, 6, 7],
        }

        table.update(pd.DataFrame({"a": [10, 9, 8], "b": [2, 3, 5]}))

        assert table.view().to_dict() == {
            "a": [None, 10, 9, 2, 8, 3, 4],
            "b": [1, 2, 3, 4, 5, 6, 7],
        }

        table.update(
            {
                "a": np.array([100, np.nan], dtype=np.float64),
                "b": np.array([-1, 6], dtype=np.float64),
            }
        )

        assert table.view().to_dict() == {
            "a": [100, None, 10, 9, 2, 8, None, 4],
            "b": [-1, 1, 2, 3, 4, 5, 6, 7],
        }

        table.update(
            {
                "a": np.array([100, 1000, np.nan], dtype=np.float64),
                "b": np.array([100, 6, 97], dtype=np.float64),
            }
        )

        assert table.view().to_dict() == {
            "a": [100, None, 10, 9, 2, 8, 1000, 4, None, 100],
            "b": [-1, 1, 2, 3, 4, 5, 6, 7, 97, 100],
        }

    def test_table_numpy_from_schema_int_to_float(self):
        data = [None, 1, None, 2, None, 3, 4]
        df = {"a": np.array(data)}
        table = Table({"a": float})
        table.update(df)
        assert table.view().to_dict()["a"] == [None, 1.0, None, 2.0, None, 3.0, 4.0]

    def test_table_numpy_from_schema_date(self):
        data = [date(2019, 8, 15), None, date(2019, 8, 16)]
        df = {"a": np.array(data)}
        table = Table({"a": date})
        table.update(df)
        assert table.view().to_dict()["a"] == [
            datetime(2019, 8, 15),
            None,
            datetime(2019, 8, 16),
        ]

    def test_table_numpy_from_schema_datetime(self):
        data = [
            datetime(2019, 7, 11, 12, 30, 5),
            None,
            datetime(2019, 7, 11, 13, 30, 5),
            None,
        ]
        df = {"a": np.array(data)}
        table = Table({"a": datetime})
        table.update(df)
        assert table.view().to_dict()["a"] == data

    def test_table_numpy_from_schema_datetime_timestamp_s(self, util):
        data = [
            util.to_timestamp(datetime(2019, 7, 11, 12, 30, 5)),
            np.nan,
            util.to_timestamp(datetime(2019, 7, 11, 13, 30, 5)),
            np.nan,
        ]
        df = {"a": np.array(data)}
        table = Table({"a": datetime})
        table.update(df)
        assert table.view().to_dict()["a"] == [
            datetime(2019, 7, 11, 12, 30, 5),
            None,
            datetime(2019, 7, 11, 13, 30, 5),
            None,
        ]

    def test_table_numpy_from_schema_datetime_timestamp_ms(self, util):
        data = [
            util.to_timestamp(datetime(2019, 7, 11, 12, 30, 5)) * 1000,
            np.nan,
            util.to_timestamp(datetime(2019, 7, 11, 13, 30, 5)) * 1000,
            np.nan,
        ]

        df = {"a": np.array(data)}
        table = Table({"a": datetime})
        table.update(df)
        assert table.view().to_dict()["a"] == [
            datetime(2019, 7, 11, 12, 30, 5),
            None,
            datetime(2019, 7, 11, 13, 30, 5),
            None,
        ]

    def test_table_numpy_from_schema_str(self):
        data = ["a", None, "b", None, "c"]
        df = {"a": np.array(data)}
        table = Table({"a": str})
        table.update(df)
        assert table.view().to_dict()["a"] == data

    # partial update

    def test_table_numpy_partial_update(self):
        data = ["a", None, "b", None, "c"]
        df = {"a": np.array([1, 2, 3, 4, 5]), "b": np.array(data), "c": np.array(data)}
        table = Table(df, index="a")
        table.update({"a": np.array([2, 4, 5]), "b": np.array(["x", "y", "z"])})
        assert table.view().to_dict() == {
            "a": [1, 2, 3, 4, 5],
            "b": ["a", "x", "b", "y", "z"],
            "c": ["a", None, "b", None, "c"],
        }

    def test_table_numpy_partial_update_implicit(self):
        data = ["a", None, "b", None, "c"]
        df = {"a": np.array([1, 2, 3, 4, 5]), "b": np.array(data), "c": np.array(data)}
        table = Table(df)
        table.update({"__INDEX__": np.array([1, 3, 4]), "b": np.array(["x", "y", "z"])})
        assert table.view().to_dict() == {
            "a": [1, 2, 3, 4, 5],
            "b": ["a", "x", "b", "y", "z"],
            "c": ["a", None, "b", None, "c"],
        }

    # structured array

    def test_table_structured_array(self):
        d = np.array([(1.0, 2), (3.0, 4)], dtype=[("x", "<f8"), ("y", "<i8")])
        table = Table(d)
        assert table.schema() == {"x": float, "y": int}
        assert table.view().to_dict() == {"x": [1.0, 3.0], "y": [2, 4]}

    # recarray

    def test_table_recarray(self):
        d = np.array([(1.0, 2), (3.0, 4)], dtype=[("x", "<f8"), ("y", "<i8")]).view(
            np.recarray
        )
        table = Table(d)
        assert table.schema() == {"x": float, "y": int}
        assert table.view().to_dict() == {"x": [1.0, 3.0], "y": [2, 4]}

    def test_table_recarray_datetime_ns(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[ns]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": datetime, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 8, 30, 29), datetime(2019, 7, 11, 8, 30, 29)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_us(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[us]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": datetime, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 8, 30, 29), datetime(2019, 7, 11, 8, 30, 29)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_ms(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[ms]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": datetime, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 8, 30, 29), datetime(2019, 7, 11, 8, 30, 29)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_s(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[s]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": datetime, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 8, 30, 29), datetime(2019, 7, 11, 8, 30, 29)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_m(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 31, 29), 4),
            ],
            dtype=[("x", "datetime64[m]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": datetime, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 8, 30, 0), datetime(2019, 7, 11, 8, 31, 0)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_h(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 9, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[h]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": datetime, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 8, 0, 0), datetime(2019, 7, 11, 9, 0, 0)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_D(self):
        d = np.array(
            [
                (datetime(2019, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 12, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[D]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": date, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 7, 11, 0, 0, 0), datetime(2019, 7, 12, 0, 0, 0)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_W(self):
        d = np.array(
            [(datetime(2019, 6, 30, 0, 0, 0), 2), (datetime(2019, 7, 7, 0, 0, 0), 4)],
            dtype=[("x", "datetime64[W]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": date, "y": int}
        assert table.view().to_dict() == {
            # one week apart
            "x": [datetime(2019, 6, 27, 0, 0, 0), datetime(2019, 7, 4, 0, 0, 0)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_M(self):
        d = np.array(
            [
                (datetime(2019, 6, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[M]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": date, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2019, 6, 1, 0, 0, 0), datetime(2019, 7, 1, 0, 0, 0)],
            "y": [2, 4],
        }

    def test_table_recarray_datetime_Y(self):
        d = np.array(
            [
                (datetime(2018, 7, 11, 8, 30, 29), 2),
                (datetime(2019, 7, 11, 8, 30, 29), 4),
            ],
            dtype=[("x", "datetime64[Y]"), ("y", "<i8")],
        ).view(np.recarray)
        table = Table(d)
        assert table.schema() == {"x": date, "y": int}
        assert table.view().to_dict() == {
            "x": [datetime(2018, 1, 1, 0, 0, 0), datetime(2019, 1, 1, 0, 0, 0)],
            "y": [2, 4],
        }

    def test_table_recarray_str(self):
        table = Table(
            np.array(
                [("string1", "string2"), ("string3", "string4")],
                dtype=[("x", "O"), ("y", "O")],
            ).view(np.recarray)
        )
        assert table.schema() == {"x": str, "y": str}
        assert table.view().to_dict() == {
            "x": ["string1", "string3"],
            "y": ["string2", "string4"],
        }

    def test_table_recarray_str_dtype(self):
        dtype = "U7"
        table = Table(
            np.array(
                [("string1", "string2"), ("string3", "string4")],
                dtype=[("x", dtype), ("y", dtype)],
            ).view(np.recarray)
        )
        assert table.schema() == {"x": str, "y": str}
        assert table.view().to_dict() == {
            "x": ["string1", "string3"],
            "y": ["string2", "string4"],
        }

    def test_table_float32_to_float64(self):
        data = {
            "a": np.array([1.1, 2.2]).astype(np.float32),
            "b": np.array([3.3, 4.4]).astype(np.float32),
        }
        table = Table(data)
        assert table.size() == 2
        schema = table.schema()
        assert schema == {"a": float, "b": float}
        assert table.view().to_dict() == {
            "a": [1.100000023841858, 2.200000047683716],
            "b": [3.299999952316284, 4.400000095367432],
        }

    def test_table_float64_to_float32(self):
        data = {
            "a": np.array([1.1, 2.2]).astype(np.float64),
            "b": np.array([3.3, 4.4]).astype(np.float64),
        }
        table = Table(data)
        assert table.size() == 2
        schema = table.schema()
        assert schema == {"a": float, "b": float}
        view = table.view()
        assert view.to_dict() == {"a": [1.1, 2.2], "b": [3.3, 4.4]}
        view.schema({"a": np.float32, "b": np.float32})
        assert view.to_dict() == {"a": [1.1, 2.2], "b": [3.3, 4.4]}
        data["a"] = data["a"].astype(np.float32)
        data["b"] = data["b"].astype(np.float32)
        table = Table(data)
        assert table.size() == 2
        schema = table.schema()
        assert schema == {"a": float, "b": float}
        view = table.view()
        assert view.to_dict() == {
            "a": [1.100000023841858, 2.200000047683716],
            "b": [3.299999952316284, 4.400000095367432],
        }

    def test_table_float32_to_float64_with_nulls(self):
        data = {
            "a": np.array([1.1, np.nan, 2.2]).astype(np.float32),
            "b": np.array([3.3, 4.4, np.nan]).astype(np.float32),
        }
        table = Table(data)
        assert table.size() == 3
        schema = table.schema()
        assert schema == {"a": float, "b": float}
        assert table.view().to_dict() == {
            "a": [1.100000023841858, None, 2.200000047683716],
            "b": [3.299999952316284, 4.400000095367432, None],
        }
