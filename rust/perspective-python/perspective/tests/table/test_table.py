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

import sys
from datetime import date, datetime

from perspective.core.exception import PerspectiveError
from perspective.table import Table
from pytest import raises, skip


class TestTable(object):
    # table constructors

    def test_empty_table(self):
        tbl = Table([])
        assert tbl.size() == 0

    def test_table_not_iterable(self):
        data = {"a": 1}
        with raises(NotImplementedError):
            Table(data)

    # def test_table_synchronous_process(self):
    #     tbl = Table({"a": [1, 2, 3]})
    #     assert _PerspectiveStateManager.TO_PROCESS == {}
    #     tbl.update({"a": [4, 5, 6]})
    #     assert _PerspectiveStateManager.TO_PROCESS == {}

    def test_table_csv(self):
        data = "x,y,z\n1,a,true\n2,b,false\n3,c,true\n4,d,false"
        tbl = Table(data)
        assert tbl.schema() == {"x": int, "y": str, "z": bool}
        view = tbl.view()
        assert view.to_dict() == {
            "x": [1, 2, 3, 4],
            "y": ["a", "b", "c", "d"],
            "z": [True, False, True, False],
        }

    def test_table_csv_with_nulls(self):
        tbl = Table("x,y\n1,")
        assert tbl.schema() == {"x": int, "y": str}
        view = tbl.view()
        assert view.to_dict() == {"x": [1], "y": [None]}

    def test_table_csv_with_nulls_updated(self):
        tbl = Table("x,y\n1,", index="x")
        assert tbl.schema() == {"x": int, "y": str}
        view = tbl.view()
        assert view.to_dict() == {"x": [1], "y": [None]}
        tbl.update("x,y\n1,abc\n2,123")
        assert view.to_dict() == {"x": [1, 2], "y": ["abc", "123"]}

    def test_table_correct_csv_nan_end(self):
        tbl = Table("str,int\n,1\n,2\nabc,3")
        assert tbl.schema() == {"str": str, "int": int}
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {"str": ["", "", "abc"], "int": [1, 2, 3]}

    def test_table_correct_csv_nan_intermittent(self):
        tbl = Table("str,float\nabc,\n,2.5\nghi,")
        assert tbl.schema() == {"str": str, "float": float}
        assert tbl.size() == 3
        assert tbl.view().to_dict() == {
            "str": ["abc", "", "ghi"],
            "float": [None, 2.5, None],
        }

    def test_table_string_column_with_nulls_update_and_filter(self):
        tbl = Table(
            [
                {"a": "1", "b": 2, "c": "3"},
                {"a": "2", "b": 3, "c": "4"},
                {"a": "3", "b": 3, "c": None},
            ],
            index="a",
        )
        view = tbl.view(filter=[["c", "==", "4"]])
        records = view.to_records()
        tbl.update([{"a": "4", "b": 10}])
        assert records == view.to_records()

    def test_table_int(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": int, "b": int}

    def test_table_int_column_names(self):
        data = {"a": [1, 2, 3], 0: [4, 5, 6]}
        with raises(PerspectiveError):
            Table(data)

    def test_table_nones(self):
        none_data = [{"a": 1, "b": None}, {"a": None, "b": 2}]
        tbl = Table(none_data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": int, "b": int}

    def test_table_bool(self):
        bool_data = [{"a": True, "b": False}, {"a": True, "b": True}]
        tbl = Table(bool_data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": bool, "b": bool}

    def test_table_bool_str(self):
        bool_data = [{"a": "True", "b": "False"}, {"a": "True", "b": "True"}]
        tbl = Table(bool_data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": bool, "b": bool}
        assert tbl.view().to_dict() == {"a": [True, True], "b": [False, True]}

    def test_table_float(self):
        float_data = [{"a": 1.5, "b": 2.5}, {"a": 3.2, "b": 3.1}]
        tbl = Table(float_data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": float, "b": float}

    def test_table_str(self):
        str_data = [{"a": "b", "b": "b"}, {"a": "3", "b": "3"}]
        tbl = Table(str_data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": str, "b": str}

    def test_table_str_with_escape(self):
        str_data = [
            {"a": 'abc"def"', "b": 'abc"def"'},
            {"a": "abc'def'", "b": "abc'def'"},
        ]
        tbl = Table(str_data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": str, "b": str}
        assert tbl.view().to_records() == str_data

    def test_table_str_unicode(self):
        str_data = [{"a": "ȀȁȀȃȀȁȀȃȀȁȀȃȀȁȀȃ", "b": "ЖДфйЖДфйЖДфйЖДфй"}]
        tbl = Table(str_data)
        assert tbl.size() == 1
        assert tbl.schema() == {"a": str, "b": str}
        assert tbl.view().to_records() == str_data

    def test_table_date(self):
        str_data = [{"a": date.today(), "b": date.today()}]
        tbl = Table(str_data)
        assert tbl.size() == 1
        assert tbl.schema() == {"a": date, "b": date}

    def test_table_datetime(self):
        str_data = [{"a": datetime.now(), "b": datetime.now()}]
        tbl = Table(str_data)
        assert tbl.size() == 1
        assert tbl.schema() == {"a": datetime, "b": datetime}

    def test_table_columnar(self):
        data = {"a": [1, 2, 3], "b": [4, 5, 6]}
        tbl = Table(data)
        assert tbl.columns() == ["a", "b"]
        assert tbl.size() == 3
        assert tbl.schema() == {"a": int, "b": int}

    def test_table_columnar_mixed_length(self):
        data = [{"a": 1.5, "b": 2.5}, {"a": 3.2}]
        tbl = Table(data)
        assert tbl.size() == 2
        assert tbl.schema() == {"a": float, "b": float}
        assert tbl.view().to_records() == [{"a": 1.5, "b": 2.5}, {"a": 3.2, "b": None}]

    # schema

    def test_table_schema(self):
        data = {"a": int, "b": float, "c": str, "d": bool, "e": date, "f": datetime}

        tbl = Table(data)

        assert tbl.schema() == {
            "a": int,
            "b": float,
            "c": str,
            "d": bool,
            "e": date,
            "f": datetime,
        }

    def test_table_readable_string_schema(self):
        data = {
            "a": "integer",
            "b": "float",
            "c": "string",
            "d": "boolean",
            "e": "date",
            "f": "datetime",
        }

        tbl = Table(data)

        assert tbl.schema() == {
            "a": int,
            "b": float,
            "c": str,
            "d": bool,
            "e": date,
            "f": datetime,
        }

    def test_table_output_readable_schema(self):
        data = {
            "a": "int32",
            "b": "float64",
            "c": "str",
            "d": "bool",
            "e": "date",
            "f": "datetime",
        }

        tbl = Table(data)

        assert tbl.schema() == {
            "a": int,
            "b": float,
            "c": str,
            "d": bool,
            "e": date,
            "f": datetime,
        }

    def test_table_mixed_schema(self):
        data = {"a": int, "b": float, "c": str, "d": bool, "e": date, "f": datetime}

        tbl = Table(data)

        assert tbl.schema() == {
            "a": int,
            "b": float,
            "c": str,
            "d": bool,
            "e": date,
            "f": datetime,
        }

    def test_table_output_string_schema(self):
        data = {"a": int, "b": float, "c": str, "d": bool, "e": date, "f": datetime}

        tbl = Table(data)

        assert tbl.schema(as_string=True) == {
            "a": "integer",
            "b": "float",
            "c": "string",
            "d": "boolean",
            "e": "date",
            "f": "datetime",
        }

    def test_table_symmetric_schema(self):
        data = {
            "a": [1, 2, 3],
            "b": [1.5, 2.5, 3.5],
            "c": ["a", "b", "c"],
            "d": [True, False, True],
            "e": [date.today(), date.today(), date.today()],
            "f": [datetime.now(), datetime.now(), datetime.now()],
        }

        tbl = Table(data)
        schema = tbl.schema()

        assert schema == {
            "a": int,
            "b": float,
            "c": str,
            "d": bool,
            "e": date,
            "f": datetime,
        }

        tbl2 = Table(schema)

        assert tbl2.schema() == schema

    def test_table_symmetric_string_schema(self):
        data = {
            "a": [1, 2, 3],
            "b": [1.5, 2.5, 3.5],
            "c": ["a", "b", "c"],
            "d": [True, False, True],
            "e": [date.today(), date.today(), date.today()],
            "f": [datetime.now(), datetime.now(), datetime.now()],
        }

        tbl = Table(data)
        schema = tbl.schema(as_string=True)

        assert schema == {
            "a": "integer",
            "b": "float",
            "c": "string",
            "d": "boolean",
            "e": "date",
            "f": "datetime",
        }

        tbl2 = Table(schema)

        assert tbl2.schema(as_string=True) == schema

    # is_valid_filter

    def test_table_is_valid_filter_str(self):
        filter = ["a", "<", 1]
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.is_valid_filter(filter) is True

    def test_table_not_is_valid_filter_str(self):
        filter = ["a", "<", None]
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.is_valid_filter(filter) is False

    def test_table_is_valid_filter_filter_op(self):
        filter = ["a", t_filter_op.FILTER_OP_IS_NULL]
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.is_valid_filter(filter) is True

    def test_table_not_is_valid_filter_filter_op(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, None]
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.is_valid_filter(filter) is False

    def test_table_is_valid_filter_date(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, date.today()]
        tbl = Table({"a": date})
        assert tbl.is_valid_filter(filter) is True

    def test_table_not_is_valid_filter_date(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, None]
        tbl = Table({"a": date})
        assert tbl.is_valid_filter(filter) is False

    def test_table_is_valid_filter_datetime(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, datetime.now()]
        tbl = Table({"a": datetime})
        assert tbl.is_valid_filter(filter) is True

    def test_table_not_is_valid_filter_datetime(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, None]
        tbl = Table({"a": datetime})
        assert tbl.is_valid_filter(filter) is False

    def test_table_is_valid_filter_datetime_str(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, "7/11/2019 5:30PM"]
        tbl = Table({"a": datetime})
        assert tbl.is_valid_filter(filter) is True

    def test_table_not_is_valid_filter_datetime_str(self):
        filter = ["a", t_filter_op.FILTER_OP_GT, None]
        tbl = Table({"a": datetime})
        assert tbl.is_valid_filter(filter) is False

    def test_table_is_valid_filter_ignores_not_in_schema(self):
        filter = ["not in schema", "<", 1]
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.is_valid_filter(filter) is True

    # index

    def test_table_index(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 4}]
        tbl = Table(data, index="a")
        assert tbl.size() == 1
        assert tbl.view().to_records() == [{"a": 1, "b": 4}]

    def test_table_index_from_schema(self):
        data = [{"a": 1, "b": 2}, {"a": 1, "b": 4}]
        tbl = Table({"a": int, "b": int}, index="a")
        assert tbl.size() == 0
        tbl.update(data)
        assert tbl.view().to_records() == [{"a": 1, "b": 4}]

    # index with None in column

    def test_table_index_int_with_none(self):
        tbl = Table({"a": [0, 1, 2, None, None], "b": [4, 3, 2, 1, 0]}, index="a")
        assert tbl.view().to_dict() == {
            "a": [None, 0, 1, 2],
            "b": [0, 4, 3, 2],
        }  # second `None` replaces first

    def test_table_index_float_with_none(self):
        tbl = Table({"a": [0.0, 1.5, 2.5, None, None], "b": [4, 3, 2, 1, 0]}, index="a")
        assert tbl.view().to_dict() == {
            "a": [None, 0, 1.5, 2.5],
            "b": [0, 4, 3, 2],
        }  # second `None` replaces first

    def test_table_index_bool_with_none(self):
        # bools cannot be used as primary key columns
        with raises(PerspectiveCppError):
            Table({"a": [True, False, None, True], "b": [4, 3, 2, 1]}, index="a")

    def test_table_index_date_with_none(self):
        tbl = Table(
            {
                "a": [date(2019, 7, 11), None, date(2019, 3, 12), date(2011, 3, 10)],
                "b": [4, 3, 2, 1],
            },
            index="a",
        )
        assert tbl.view().to_dict() == {
            "a": [
                None,
                datetime(2011, 3, 10),
                datetime(2019, 3, 12),
                datetime(2019, 7, 11),
            ],
            "b": [3, 1, 2, 4],
        }

    def test_table_index_datetime_with_none(self):
        tbl = Table(
            {
                "a": [
                    datetime(2019, 7, 11, 15, 30),
                    None,
                    datetime(2019, 7, 11, 12, 10),
                    datetime(2019, 7, 11, 5, 0),
                ],
                "b": [4, 3, 2, 1],
            },
            index="a",
        )
        assert tbl.view().to_dict() == {
            "a": [
                None,
                datetime(2019, 7, 11, 5, 0),
                datetime(2019, 7, 11, 12, 10),
                datetime(2019, 7, 11, 15, 30),
            ],
            "b": [3, 1, 2, 4],
        }

    def test_table_index_str_with_none(self):
        tbl = Table({"a": ["", "a", None, "b"], "b": [4, 3, 2, 1]}, index="a")
        assert tbl.view().to_dict() == {"a": [None, "", "a", "b"], "b": [2, 4, 3, 1]}

    def test_table_get_index(self):
        tbl = Table({"a": ["", "a", None, "b"], "b": [4, 3, 2, 1]}, index="a")
        assert tbl.get_index() == "a"

    def test_table_get_index_none(self):
        tbl = Table({"a": ["", "a", None, "b"], "b": [4, 3, 2, 1]})
        assert tbl.get_index() is None

    # limit

    def test_table_limit(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data, limit=1)
        assert tbl.size() == 1
        assert tbl.view().to_records() == [{"a": 3, "b": 4}]

    def test_table_get_limit(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data, limit=1)
        assert tbl.get_limit() == 1

    def test_table_get_limit_none(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.get_limit() is None

    # num_views

    def test_table_get_num_views(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        assert tbl.get_num_views() == 0
        v1 = tbl.view()
        v2 = tbl.view()
        v3 = tbl.view()
        assert tbl.get_num_views() == 3

        v1.delete()
        v2.delete()
        assert tbl.get_num_views() == 1
        failed = False
        try:
            tbl.delete()
        except PerspectiveError:
            failed = True
        assert failed
        v3.delete()
        assert tbl.get_num_views() == 0
        tbl.delete()

    # clear

    def test_table_clear(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        tbl.clear()
        view = tbl.view()
        assert view.to_records() == []

    # replace

    def test_table_replace(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        data2 = [{"a": 3, "b": 4}, {"a": 1, "b": 2}]
        tbl = Table(data)
        tbl.replace(data2)
        assert tbl.view().to_records() == data2

    def test_table_replace_views_should_preserve(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        data2 = [{"a": 3, "b": 4}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view(group_by=["a"], split_by=["b"])
        first = view.to_records()
        tbl.replace(data2)
        assert view.to_records() == first

    def test_table_replace_should_fire_on_update(self, sentinel):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        data2 = [{"a": 3, "b": 4}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view()

        s = sentinel(False)

        def updater(port_id):
            assert port_id == 0
            s.set(True)

        view.on_update(updater)
        tbl.replace(data2)
        assert s.get() is True

    def test_table_replace_should_fire_on_update_with_delta(self, sentinel):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        data2 = [{"a": 3, "b": 4}, {"a": 1, "b": 2}]
        tbl = Table(data)
        view = tbl.view()

        s = sentinel(False)

        def updater(port_id, delta):
            assert port_id == 0
            table2 = Table(delta)
            assert table2.view().to_records() == data2
            s.set(True)

        view.on_update(updater, mode="row")
        tbl.replace(data2)
        assert s.get() is True

    def test_float32_table_construction(self):
        float_data = [{"a": 1.5, "b": 2.5}, {"a": 3.2, "b": 3.1}]
        tbl = Table(float_data, index="a")
        assert tbl.size() == 2
        assert tbl.schema() == {"a": float, "b": float}
