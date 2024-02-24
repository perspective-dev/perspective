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

import numpy as np
import pyarrow as pa
import pandas as pd
from datetime import date, datetime
from perspective.table import Table
from pytest import mark


class TestUpdate(object):
    @mark.skip(reason="Fix for null values update yet to be implemented")
    def test_update_with_missing_or_null_values(self):
        tbl = Table([{"a": "1", "b": "2"}, {"a": "3", "b": "4"}], index="a")
        tbl.update([{"a": "1", "b": None}])
        assert tbl.view().to_records() == [{"a": "1", "b": None}, {"a": "3", "b": "4"}]

        data = pd.DataFrame({"a": ["1"], "b": [None]})

        arrow_table = pa.Table.from_pandas(data, preserve_index=False)

        # write arrow to stream
        stream = pa.BufferOutputStream()
        writer = pa.RecordBatchStreamWriter(
            stream, arrow_table.schema, use_legacy_format=False
        )
        writer.write_table(arrow_table)
        writer.close()
        arrow = stream.getvalue().to_pybytes()

        tbl.update(arrow)
        assert tbl.size() == 2
        assert tbl.view().to_records() == [{"a": "1", "b": ""}, {"a": "3", "b": "4"}]

    def test_update_from_schema(self):
        tbl = Table({"a": str, "b": int})
        tbl.update([{"a": "abc", "b": 123}])
        assert tbl.view().to_records() == [{"a": "abc", "b": 123}]

    def test_update_columnar_from_schema(self):
        tbl = Table({"a": str, "b": int})
        tbl.update({"a": ["abc"], "b": [123]})
        assert tbl.view().to_records() == [{"a": "abc", "b": 123}]

    def test_update_csv(self):
        tbl = Table({"a": str, "b": int})

        view = tbl.view()
        tbl.update("a,b\nxyz,123\ndef,100000000")

        assert view.to_dict() == {"a": ["xyz", "def"], "b": [123, 100000000]}

    def test_update_csv_indexed(self):
        tbl = Table({"a": str, "b": float}, index="a")

        view = tbl.view()
        tbl.update("a,b\nxyz,1.23456718\ndef,100000000.1")

        assert view.to_dict() == {"a": ["def", "xyz"], "b": [100000000.1, 1.23456718]}

        tbl.update("a,b\nxyz,0.00000001\ndef,1234.5678\nefg,100.2")

        assert view.to_dict() == {
            "a": ["def", "efg", "xyz"],
            "b": [1234.5678, 100.2, 0.00000001],
        }

    def test_update_append(self):
        tbl = Table([{"a": "abc", "b": 123}])
        tbl.update([{"a": "def", "b": 456}])
        assert tbl.view().to_records() == [
            {"a": "abc", "b": 123},
            {"a": "def", "b": 456},
        ]

    def test_update_partial(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")
        tbl.update([{"a": "abc", "b": 456}])
        assert tbl.view().to_records() == [{"a": "abc", "b": 456}]

    def test_update_partial_add_row(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")
        tbl.update([{"a": "abc", "b": 456}, {"a": "def"}])
        assert tbl.view().to_records() == [
            {"a": "abc", "b": 456},
            {"a": "def", "b": None},
        ]

    def test_update_partial_noop(self):
        tbl = Table([{"a": "abc", "b": 1, "c": 2}], index="a")
        tbl.update([{"a": "abc", "b": 456}])
        assert tbl.view().to_records() == [{"a": "abc", "b": 456, "c": 2}]

    def test_update_partial_unset(self):
        tbl = Table(
            [{"a": "abc", "b": 1, "c": 2}, {"a": "def", "b": 3, "c": 4}], index="a"
        )
        tbl.update([{"a": "abc"}, {"a": "def", "c": None}])
        assert tbl.view().to_records() == [
            {"a": "abc", "b": 1, "c": 2},
            {"a": "def", "b": 3, "c": None},
        ]

    def test_update_columnar_partial_add_row(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")

        tbl.update({"a": ["abc", "def"], "b": [456, None]})

        assert tbl.view().to_records() == [
            {"a": "abc", "b": 456},
            {"a": "def", "b": None},
        ]

    def test_update_columnar_partial_noop(self):
        tbl = Table([{"a": "abc", "b": 1, "c": 2}], index="a")

        # no-op because "c" is not in the update dataset
        tbl.update({"a": ["abc"], "b": [456]})

        assert tbl.view().to_records() == [{"a": "abc", "b": 456, "c": 2}]

    def test_update_columnar_partial_unset(self):
        tbl = Table(
            [{"a": "abc", "b": 1, "c": 2}, {"a": "def", "b": 3, "c": 4}], index="a"
        )

        tbl.update({"a": ["abc"], "b": [None]})

        assert tbl.view().to_records() == [
            {"a": "abc", "b": None, "c": 2},
            {"a": "def", "b": 3, "c": 4},
        ]

    def test_update_partial_subcolumn(self):
        tbl = Table([{"a": "abc", "b": 123, "c": 456}], index="a")
        tbl.update([{"a": "abc", "c": 1234}])
        assert tbl.view().to_records() == [{"a": "abc", "b": 123, "c": 1234}]

    def test_update_partial_subcolumn_dict(self):
        tbl = Table([{"a": "abc", "b": 123, "c": 456}], index="a")
        tbl.update({"a": ["abc"], "c": [1234]})
        assert tbl.view().to_records() == [{"a": "abc", "b": 123, "c": 1234}]

    def test_update_partial_cols_more_columns_than_table(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")
        tbl.update([{"a": "abc", "b": 456, "c": 789}])
        assert tbl.view().to_records() == [{"a": "abc", "b": 456}]

    def test_update_columnar_append(self):
        tbl = Table({"a": ["abc"], "b": [123]})
        tbl.update({"a": ["def"], "b": [456]})
        assert tbl.view().to_records() == [
            {"a": "abc", "b": 123},
            {"a": "def", "b": 456},
        ]

    def test_update_columnar_partial(self):
        tbl = Table({"a": ["abc"], "b": [123]}, index="a")
        tbl.update({"a": ["abc"], "b": [456]})
        assert tbl.view().to_records() == [{"a": "abc", "b": 456}]

    # make sure already created views are notified properly
    def test_update_from_schema_notify(self):
        tbl = Table({"a": str, "b": int})
        view = tbl.view()
        assert view.num_rows() == 0
        tbl.update([{"a": "abc", "b": 123}])
        assert view.to_records() == [{"a": "abc", "b": 123}]

    def test_update_columnar_from_schema_notify(self):
        tbl = Table({"a": str, "b": int})
        view = tbl.view()
        assert view.num_rows() == 0
        tbl.update({"a": ["abc"], "b": [123]})
        assert view.to_records() == [{"a": "abc", "b": 123}]

    def test_update_append_notify(self):
        tbl = Table([{"a": "abc", "b": 123}])
        view = tbl.view()
        assert view.num_rows() == 1
        tbl.update([{"a": "def", "b": 456}])
        assert view.to_records() == [{"a": "abc", "b": 123}, {"a": "def", "b": 456}]

    def test_update_partial_notify(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")
        view = tbl.view()
        assert view.num_rows() == 1
        tbl.update([{"a": "abc", "b": 456}])
        assert view.to_records() == [{"a": "abc", "b": 456}]

    def test_update_partial_cols_not_in_schema_notify(self):
        tbl = Table([{"a": "abc", "b": 123}], index="a")
        view = tbl.view()
        assert view.num_rows() == 1
        tbl.update([{"a": "abc", "b": 456, "c": 789}])
        assert view.to_records() == [{"a": "abc", "b": 456}]

    def test_update_columnar_append_notify(self):
        tbl = Table({"a": ["abc"], "b": [123]})
        view = tbl.view()
        assert view.num_rows() == 1
        tbl.update({"a": ["def"], "b": [456]})
        assert view.to_records() == [{"a": "abc", "b": 123}, {"a": "def", "b": 456}]

    def test_update_columnar_partial_notify(self):
        tbl = Table({"a": ["abc"], "b": [123]}, index="a")
        view = tbl.view()
        assert view.num_rows() == 1
        tbl.update({"a": ["abc"], "b": [456]})
        assert view.to_records() == [{"a": "abc", "b": 456}]

    # bool

    def test_update_bool_from_schema(self):
        bool_data = [{"a": True, "b": False}, {"a": True, "b": True}]
        tbl = Table({"a": bool, "b": bool})
        tbl.update(bool_data)
        assert tbl.size() == 2
        assert tbl.view().to_records() == bool_data

    def test_update_bool_str_from_schema(self):
        bool_data = [{"a": "True", "b": "False"}, {"a": "True", "b": "True"}]
        tbl = Table({"a": bool, "b": bool})
        tbl.update(bool_data)
        assert tbl.size() == 2
        assert tbl.view().to_records() == [
            {"a": True, "b": False},
            {"a": True, "b": True},
        ]

    def test_update_bool_str_all_formats_from_schema(self):
        bool_data = [
            {"a": "True", "b": "False"},
            {"a": "t", "b": "f"},
            {"a": "true", "b": "false"},
            {"a": 1, "b": 0},
            {"a": "on", "b": "off"},
        ]
        tbl = Table({"a": bool, "b": bool})
        tbl.update(bool_data)
        assert tbl.size() == 5
        assert tbl.view().to_dict() == {
            "a": [True, True, True, True, True],
            "b": [False, False, False, False, False],
        }

    def test_update_bool_int_from_schema(self):
        bool_data = [{"a": 1, "b": 0}, {"a": 1, "b": 0}]
        tbl = Table({"a": bool, "b": bool})
        tbl.update(bool_data)
        assert tbl.size() == 2
        assert tbl.view().to_dict() == {"a": [True, True], "b": [False, False]}

    # dates and datetimes
    def test_update_date(self):
        tbl = Table({"a": [date(2019, 7, 11)]})
        tbl.update([{"a": date(2019, 7, 12)}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11)},
            {"a": datetime(2019, 7, 12)},
        ]

    def test_update_date_np(self):
        tbl = Table({"a": [date(2019, 7, 11)]})
        tbl.update([{"a": np.datetime64(date(2019, 7, 12))}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11)},
            {"a": datetime(2019, 7, 12)},
        ]

    def test_update_datetime(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": datetime(2019, 7, 12, 11, 0)}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11, 11, 0)},
            {"a": datetime(2019, 7, 12, 11, 0)},
        ]

    def test_update_datetime_np(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": np.datetime64(datetime(2019, 7, 12, 11, 0))}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11, 11, 0)},
            {"a": datetime(2019, 7, 12, 11, 0)},
        ]

    def test_update_datetime_np_ts(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": np.datetime64("2019-07-12T11:00")}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11, 11, 0)},
            {"a": datetime(2019, 7, 12, 11, 0)},
        ]

    def test_update_datetime_timestamp_seconds(self, util):
        ts = util.to_timestamp(datetime(2019, 7, 12, 11, 0, 0))
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": ts}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11, 11, 0)},
            {"a": datetime(2019, 7, 12, 11, 0)},
        ]

    def test_update_datetime_timestamp_ms(self, util):
        ts = util.to_timestamp(datetime(2019, 7, 12, 11, 0, 0))
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": ts}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 11, 11, 0)},
            {"a": datetime(2019, 7, 12, 11, 0)},
        ]

    # partial date & datetime updates

    def test_update_date_partial(self):
        tbl = Table({"a": [date(2019, 7, 11)], "b": [1]}, index="b")
        tbl.update([{"a": date(2019, 7, 12), "b": 1}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12), "b": 1}]

    def test_update_date_np_partial(self):
        tbl = Table({"a": [date(2019, 7, 11)], "b": [1]}, index="b")
        tbl.update([{"a": np.datetime64(date(2019, 7, 12)), "b": 1}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12), "b": 1}]

    def test_update_datetime_partial(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)], "b": [1]}, index="b")
        tbl.update([{"a": datetime(2019, 7, 12, 11, 0), "b": 1}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12, 11, 0), "b": 1}]

    def test_update_datetime_np_partial(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)], "b": [1]}, index="b")
        tbl.update([{"a": np.datetime64(datetime(2019, 7, 12, 11, 0)), "b": 1}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12, 11, 0), "b": 1}]

    def test_update_datetime_np_ts_partial(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)], "b": [1]}, index="b")
        tbl.update([{"a": np.datetime64("2019-07-12T11:00"), "b": 1}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12, 11, 0), "b": 1}]

    def test_update_datetime_timestamp_seconds_partial(self, util):
        ts = util.to_timestamp(datetime(2019, 7, 12, 11, 0, 0))
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)], "idx": [1]}, index="idx")
        tbl.update([{"a": ts, "idx": 1}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 12, 11, 0), "idx": 1}
        ]

    def test_update_datetime_timestamp_ms_partial(self, util):
        ts = util.to_timestamp(datetime(2019, 7, 12, 11, 0, 0))
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)], "idx": [1]}, index="idx")
        tbl.update([{"a": ts, "idx": 1}])
        assert tbl.view().to_records() == [
            {"a": datetime(2019, 7, 12, 11, 0), "idx": 1}
        ]

    # updating dates using implicit index

    def test_update_date_partial_implicit(self):
        tbl = Table({"a": [date(2019, 7, 11)]})
        tbl.update([{"a": date(2019, 7, 12), "__INDEX__": 0}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12)}]

    def test_update_date_np_partial_implicit(self):
        tbl = Table({"a": [date(2019, 7, 11)]})
        tbl.update([{"a": np.datetime64(date(2019, 7, 12)), "__INDEX__": 0}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12)}]

    def test_update_datetime_partial_implicit(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": datetime(2019, 7, 12, 11, 0), "__INDEX__": 0}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12, 11, 0)}]

    def test_update_datetime_np_partial_implicit(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": np.datetime64(datetime(2019, 7, 12, 11, 0)), "__INDEX__": 0}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12, 11, 0)}]

    def test_update_datetime_np_ts_partial_implicit(self):
        tbl = Table({"a": [datetime(2019, 7, 11, 11, 0)]})
        tbl.update([{"a": np.datetime64("2019-07-12T11:00"), "__INDEX__": 0}])
        assert tbl.view().to_records() == [{"a": datetime(2019, 7, 12, 11, 0)}]

    # implicit index

    def test_update_implicit_index(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data)
        view = tbl.view()
        tbl.update([{"__INDEX__": [0], "a": 3, "b": 15}])
        assert view.to_records() == [{"a": 3, "b": 15}, {"a": 2, "b": 3}]

    def test_update_implicit_index_dict_noop(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data)
        view = tbl.view()

        # "b" does not exist in dataset, so no-op
        tbl.update(
            {
                "__INDEX__": [0],
                "a": [3],
            }
        )
        assert view.to_records() == [{"a": 3, "b": 2}, {"a": 2, "b": 3}]

    def test_update_implicit_index_dict_unset_with_null(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data)
        view = tbl.view()

        # unset because "b" is null
        tbl.update({"__INDEX__": [0], "a": [3], "b": [None]})
        assert view.to_records() == [{"a": 3, "b": None}, {"a": 2, "b": 3}]

    def test_update_implicit_index_multi(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}, {"a": 4, "b": 5}]
        tbl = Table(data)
        view = tbl.view()
        tbl.update(
            [
                {
                    "__INDEX__": [0],
                    "a": 3,
                },
                {"__INDEX__": [2], "a": 5},
            ]
        )
        assert view.to_records() == [
            {"a": 3, "b": 2},
            {"a": 2, "b": 3},
            {"a": 5, "b": 5},
        ]

    def test_update_implicit_index_symmetric(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data)
        view = tbl.view()
        records = view.to_records(index=True)
        idx = records[0]["__INDEX__"]
        tbl.update([{"__INDEX__": idx, "a": 3}])
        assert view.to_records() == [{"a": 3, "b": 2}, {"a": 2, "b": 3}]

    def test_update_explicit_index(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data, index="a")
        view = tbl.view()
        tbl.update([{"a": 1, "b": 3}])
        assert view.to_records() == [{"a": 1, "b": 3}, {"a": 2, "b": 3}]

    def test_update_explicit_index_multi(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}, {"a": 3, "b": 4}]
        tbl = Table(data, index="a")
        view = tbl.view()
        tbl.update([{"a": 1, "b": 3}, {"a": 3, "b": 5}])
        assert view.to_records() == [
            {"a": 1, "b": 3},
            {"a": 2, "b": 3},
            {"a": 3, "b": 5},
        ]

    def test_update_explicit_index_multi_append(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}, {"a": 3, "b": 4}]
        tbl = Table(data, index="a")
        view = tbl.view()
        tbl.update([{"a": 1, "b": 3}, {"a": 12, "b": 5}])
        assert view.to_records() == [
            {"a": 1, "b": 3},
            {"a": 2, "b": 3},
            {"a": 3, "b": 4},
            {"a": 12, "b": 5},
        ]

    def test_update_explicit_index_multi_append_noindex(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}, {"a": 3, "b": 4}]
        tbl = Table(data, index="a")
        view = tbl.view()
        tbl.update([{"a": 1, "b": 3}, {"b": 5}])
        assert view.to_records() == [
            {"a": None, "b": 5},
            {"a": 1, "b": 3},
            {"a": 2, "b": 3},
            {"a": 3, "b": 4},
        ]

    def test_update_implicit_index_with_explicit_unset(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data, index="a")
        view = tbl.view()
        tbl.update([{"__INDEX__": [1], "b": 3}])
        assert view.to_records() == [{"a": 1, "b": 3}, {"a": 2, "b": 3}]

    def test_update_implicit_index_with_explicit_set(self):
        data = [{"a": 1, "b": 2}, {"a": 2, "b": 3}]
        tbl = Table(data, index="a")
        view = tbl.view()
        tbl.update(
            [{"__INDEX__": [1], "a": 1, "b": 3}]
        )  # should ignore re-specification of pkey
        assert view.to_records() == [{"a": 1, "b": 3}, {"a": 2, "b": 3}]
