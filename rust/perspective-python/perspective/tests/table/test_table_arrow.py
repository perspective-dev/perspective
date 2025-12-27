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

import os.path
import numpy as np
import pandas as pd
from perspective.tests.conftest import Util
import pyarrow as pa
import pyarrow.ipc as ipc
from datetime import date, datetime
import perspective as psp
import io


client = psp.Server().new_local_client()
Table = client.table

DATE32_ARROW = os.path.join(os.path.dirname(__file__), "arrow", "date32.arrow")
DATE64_ARROW = os.path.join(os.path.dirname(__file__), "arrow", "date64.arrow")
DICT_ARROW = os.path.join(os.path.dirname(__file__), "arrow", "dict.arrow")


names = ["a", "b", "c", "d"]

# Create sample data for every integer type
ALL_INTEGERS_DATA = {
    "int8": pa.array([1, 2, 3], type=pa.int8()),
    "int16": pa.array([1000, 2000, 3000], type=pa.int16()),
    "int32": pa.array([100000, 200000, 300000], type=pa.int32()),
    "int64": pa.array([10000000000, 20000000000, 30000000000], type=pa.int64()),
    "uint8": pa.array([1, 2, 3], type=pa.uint8()),
    "uint16": pa.array([1000, 2000, 3000], type=pa.uint16()),
    "uint32": pa.array([100000, 200000, 300000], type=pa.uint32()),
    "uint64": pa.array([10000000000, 20000000000, 30000000000], type=pa.uint64()),
    "float32": pa.array([100000.0, 200000.0, 300000.0], type=pa.float32()),
    "float64": pa.array(
        [10000000000.0, 20000000000.0, 30000000000.0], type=pa.float64()
    ),
}

ALL_INTEGERS_TABLE = pa.Table.from_pydict(ALL_INTEGERS_DATA)

bytes_io = io.BytesIO()
with ipc.new_stream(bytes_io, ALL_INTEGERS_TABLE.schema) as stream:
    stream.write_table(ALL_INTEGERS_TABLE)
ALL_INTEGERS_ARROW = bytes_io.getvalue()

class TestTableArrow(object):
    def test_table_with_integer_types(self):
        tbl = Table(ALL_INTEGERS_ARROW)
        for k, values in ALL_INTEGERS_DATA.items():
            v = tbl.view(filter=[[k, "==", values[0].as_py()]])
            assert len(v.to_json()) == 1

    def test_table_arrow_loads_date32_file(self, util: Util):
        with open(DATE32_ARROW, mode="rb") as file:  # b is important -> binary
            tbl = Table(file.read())
            assert tbl.schema() == {
                "jan-2019": "date",
                "feb-2020": "date",
                "mar-2019": "date",
                "apr-2020": "date",
            }
            assert tbl.size() == 31
            view = tbl.view()
            assert view.to_columns() == {
                "jan-2019": [
                    util.to_timestamp(datetime(2019, 1, i)) for i in range(1, 32)
                ],
                "feb-2020": [
                    util.to_timestamp(datetime(2020, 2, i)) for i in range(1, 30)
                ]
                + [None, None],
                "mar-2019": [
                    util.to_timestamp(datetime(2019, 3, i)) for i in range(1, 32)
                ],
                "apr-2020": [
                    util.to_timestamp(datetime(2020, 4, i)) for i in range(1, 31)
                ]
                + [None],
            }

    def test_table_arrow_loads_date64_file(self, util: Util):
        with open(DATE64_ARROW, mode="rb") as file:  # b is important -> binary
            tbl = Table(file.read())
            assert tbl.schema() == {
                "jan-2019": "date",
                "feb-2020": "date",
                "mar-2019": "date",
                "apr-2020": "date",
            }
            assert tbl.size() == 31
            view = tbl.view()
            assert view.to_columns() == {
                "jan-2019": [
                    util.to_timestamp(datetime(2019, 1, i)) for i in range(1, 32)
                ],
                "feb-2020": [
                    util.to_timestamp(datetime(2020, 2, i)) for i in range(1, 30)
                ]
                + [None, None],
                "mar-2019": [
                    util.to_timestamp(datetime(2019, 3, i)) for i in range(1, 32)
                ],
                "apr-2020": [
                    util.to_timestamp(datetime(2020, 4, i)) for i in range(1, 31)
                ]
                + [None],
            }

    def test_table_arrow_loads_dict_file(self):
        with open(DICT_ARROW, mode="rb") as file:  # b is important -> binary
            tbl = Table(file.read())
            assert tbl.schema() == {"a": "string", "b": "string"}
            assert tbl.size() == 5
            assert tbl.view().to_columns() == {
                "a": ["abc", "def", "def", None, "abc"],
                "b": ["klm", "hij", None, "hij", "klm"],
            }

    # streams

    def test_table_arrow_loads_int_stream(self, util):
        data = [list(range(10)) for i in range(4)]
        arrow_data = util.make_arrow(names, data)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "integer",
            "b": "integer",
            "c": "integer",
            "d": "integer",
        }
        assert tbl.view().to_columns() == {
            "a": data[0],
            "b": data[1],
            "c": data[2],
            "d": data[3],
        }

    def test_empty_arrow(self, util):
        table = pa.table(
            {
                "col1": [1, 2, 3],
                "col2": ["abc", "foo", "bar"],
            }
        )

        empty_table = table.schema.empty_table()
        assert client.table(table, name="table").size() == 3
        assert client.table(empty_table, name="table_empty_bad").size() == 0
        assert client.table(table, name="table").schema() == {
            "col1": "integer",
            "col2": "string",
        }

        assert client.table(empty_table, name="table").schema() == {
            "col1": "integer",
            "col2": "string",
        }

    def test_table_arrow_loads_float_stream(self, util):
        data = [[i for i in range(10)], [i * 1.5 for i in range(10)]]
        arrow_data = util.make_arrow(["a", "b"], data)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "integer",
            "b": "float",
        }
        assert tbl.view().to_columns() == {"a": data[0], "b": data[1]}

    def test_table_arrow_loads_decimal_stream(self, util):
        data = [[i * 1000 for i in range(10)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.decimal128(4)])
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "float",
        }
        assert tbl.view().to_columns() == {"a": data[0]}

    def test_table_arrow_loads_bool_stream(self, util):
        data = [[True if i % 2 == 0 else False for i in range(10)]]
        arrow_data = util.make_arrow(["a"], data)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "boolean"}
        assert tbl.view().to_columns() == {"a": data[0]}

    def test_table_arrow_loads_date32_stream(self, util):
        data = [[date(2019, 2, i) for i in range(1, 11)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.date32()])
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "date"}
        assert tbl.view().to_columns() == {
            "a": [util.to_timestamp(datetime(2019, 2, i)) for i in range(1, 11)]
        }

    def test_table_arrow_loads_date64_stream(self, util):
        data = [[date(2019, 2, i) for i in range(1, 11)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.date64()])
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "date"}
        assert tbl.view().to_columns() == {
            "a": [util.to_timestamp(datetime(2019, 2, i)) for i in range(1, 11)]
        }

    def test_table_arrow_loads_timestamp_all_formats_stream(self, util):
        data = [
            [datetime(2019, 2, i, 9) for i in range(1, 11)],
            [datetime(2019, 2, i, 10) for i in range(1, 11)],
            [datetime(2019, 2, i, 11) for i in range(1, 11)],
            [datetime(2019, 2, i, 12) for i in range(1, 11)],
        ]
        arrow_data = util.make_arrow(
            names,
            data,
            types=[
                pa.timestamp("s"),
                pa.timestamp("ms"),
                pa.timestamp("us"),
                pa.timestamp("ns"),
            ],
        )
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "datetime",
            "b": "datetime",
            "c": "datetime",
            "d": "datetime",
        }
        assert tbl.view().to_columns() == {
            "a": [util.to_timestamp(i) for i in data[0]],
            "b": [util.to_timestamp(i) for i in data[1]],
            "c": [util.to_timestamp(i) for i in data[2]],
            "d": [util.to_timestamp(i) for i in data[3]],
        }

    def test_table_arrow_loads_string_stream(self, util):
        data = [[str(i) for i in range(10)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.string()])
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "string"}
        assert tbl.view().to_columns() == {"a": data[0]}

    def test_table_arrow_loads_dictionary_stream_int8(self, util):
        data = [
            ([0, 1, 1, None], ["abc", "def"]),
            ([0, 1, None, 2], ["xx", "yy", "zz"]),
        ]
        types = [[pa.int8(), pa.string()]] * 2
        arrow_data = util.make_dictionary_arrow(["a", "b"], data, types=types)
        tbl = Table(arrow_data)

        assert tbl.size() == 4
        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": ["abc", "def", "def", None],
            "b": ["xx", "yy", None, "zz"],
        }

    def test_table_arrow_loads_dictionary_stream_int16(self, util):
        data = [
            ([0, 1, 1, None], ["abc", "def"]),
            ([0, 1, None, 2], ["xx", "yy", "zz"]),
        ]
        types = [[pa.int16(), pa.string()]] * 2
        arrow_data = util.make_dictionary_arrow(["a", "b"], data, types=types)
        tbl = Table(arrow_data)

        assert tbl.size() == 4
        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": ["abc", "def", "def", None],
            "b": ["xx", "yy", None, "zz"],
        }

    def test_table_arrow_loads_dictionary_stream_int32(self, util):
        data = [
            ([0, 1, 1, None], ["abc", "def"]),
            ([0, 1, None, 2], ["xx", "yy", "zz"]),
        ]
        types = [[pa.int32(), pa.string()]] * 2
        arrow_data = util.make_dictionary_arrow(["a", "b"], data, types=types)
        tbl = Table(arrow_data)

        assert tbl.size() == 4
        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": ["abc", "def", "def", None],
            "b": ["xx", "yy", None, "zz"],
        }

    def test_table_arrow_loads_dictionary_stream_int64(self, util):
        data = [
            ([0, 1, 1, None], ["abc", "def"]),
            ([0, 1, None, 2], ["xx", "yy", "zz"]),
        ]
        arrow_data = util.make_dictionary_arrow(["a", "b"], data)
        tbl = Table(arrow_data)

        assert tbl.size() == 4
        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": ["abc", "def", "def", None],
            "b": ["xx", "yy", None, "zz"],
        }

    def test_table_arrow_loads_dictionary_stream_nones(self, util):
        data = [([None, 0, 1, 2], ["", "abc", "def"])]
        arrow_data = util.make_dictionary_arrow(["a"], data)
        tbl = Table(arrow_data)

        assert tbl.size() == 4
        assert tbl.schema() == {"a": "string"}
        assert tbl.view().to_columns() == {"a": [None, "", "abc", "def"]}

    def test_table_arrow_loads_dictionary_stream_nones_indexed(self, util):
        data = [
            ([1, None, 0, 2], ["", "abc", "def"]),
            ([2, 1, 0, None], ["", "hij", "klm"]),
        ]  # ["abc", None, "", "def"]  # ["klm", "hij", "", None]
        arrow_data = util.make_dictionary_arrow(["a", "b"], data)
        tbl = Table(arrow_data, index="a")  # column "a" is sorted

        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": [None, "", "abc", "def"],
            "b": ["hij", "", "klm", None],
        }

    def test_table_arrow_loads_dictionary_stream_nones_indexed_2(self, util):
        """Test the other column, just in case."""
        data = [
            ([1, None, 0, 2], ["", "abc", "def"]),
            ([2, 1, 0, None], ["", "hij", "klm"]),
        ]  # ["abc", None, "", "def"]  # ["klm", "hij", "", None]
        arrow_data = util.make_dictionary_arrow(["a", "b"], data)
        tbl = Table(arrow_data, index="b")  # column "b" is sorted

        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": ["def", "", None, "abc"],
            "b": [None, "", "hij", "klm"],
        }

    # legacy

    def test_table_arrow_loads_int_legacy(self, util):
        data = [list(range(10)) for i in range(4)]
        arrow_data = util.make_arrow(names, data, legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "integer",
            "b": "integer",
            "c": "integer",
            "d": "integer",
        }

    def test_table_arrow_loads_float_legacy(self, util):
        data = [[i for i in range(10)], [i * 1.5 for i in range(10)]]
        arrow_data = util.make_arrow(["a", "b"], data, legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "integer",
            "b": "float",
        }
        assert tbl.view().to_columns() == {"a": data[0], "b": data[1]}

    def test_table_arrow_loads_decimal128_legacy(self, util):
        data = [[i * 1000 for i in range(10)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.decimal128(4)], legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "float",
        }
        assert tbl.view().to_columns() == {"a": data[0]}

    def test_table_arrow_loads_bool_legacy(self, util):
        data = [[True if i % 2 == 0 else False for i in range(10)]]
        arrow_data = util.make_arrow(["a"], data, legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "boolean"}
        assert tbl.view().to_columns() == {"a": data[0]}

    def test_table_arrow_loads_date32_legacy(self, util):
        data = [[date(2019, 2, i) for i in range(1, 11)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.date32()], legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "date"}
        assert tbl.view().to_columns() == {
            "a": [util.to_timestamp(datetime(2019, 2, i)) for i in range(1, 11)]
        }

    def test_table_arrow_loads_date64_legacy(self, util):
        data = [[date(2019, 2, i) for i in range(1, 11)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.date64()], legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "date"}
        assert tbl.view().to_columns() == {
            "a": [util.to_timestamp(datetime(2019, 2, i)) for i in range(1, 11)]
        }

    def test_table_arrow_loads_timestamp_all_formats_legacy(self, util):
        data = [
            [datetime(2019, 2, i, 9) for i in range(1, 11)],
            [datetime(2019, 2, i, 10) for i in range(1, 11)],
            [datetime(2019, 2, i, 11) for i in range(1, 11)],
            [datetime(2019, 2, i, 12) for i in range(1, 11)],
        ]
        arrow_data = util.make_arrow(
            names,
            data,
            types=[
                pa.timestamp("s"),
                pa.timestamp("ms"),
                pa.timestamp("us"),
                pa.timestamp("ns"),
            ],
            legacy=True,
        )
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {
            "a": "datetime",
            "b": "datetime",
            "c": "datetime",
            "d": "datetime",
        }
        assert tbl.view().to_columns() == {
            "a": [util.to_timestamp(i) for i in data[0]],
            "b": [util.to_timestamp(i) for i in data[1]],
            "c": [util.to_timestamp(i) for i in data[2]],
            "d": [util.to_timestamp(i) for i in data[3]],
        }

    def test_table_arrow_loads_string_legacy(self, util):
        data = [[str(i) for i in range(10)]]
        arrow_data = util.make_arrow(["a"], data, types=[pa.string()], legacy=True)
        tbl = Table(arrow_data)
        assert tbl.size() == 10
        assert tbl.schema() == {"a": "string"}
        assert tbl.view().to_columns() == {"a": data[0]}

    def test_table_arrow_loads_dictionary_legacy(self, util):
        data = [([0, 1, 1, None], ["a", "b"]), ([0, 1, None, 2], ["x", "y", "z"])]
        arrow_data = util.make_dictionary_arrow(["a", "b"], data, legacy=True)
        tbl = Table(arrow_data)

        assert tbl.size() == 4
        assert tbl.schema() == {"a": "string", "b": "string"}
        assert tbl.view().to_columns() == {
            "a": ["a", "b", "b", None],
            "b": ["x", "y", None, "z"],
        }

    def test_table_arrow_loads_arrow_from_df_with_nan(self):
        data = pd.DataFrame({"a": [1.5, 2.5, np.nan, 3.5, 4.5, np.nan, np.nan, np.nan]})

        arrow_table = pa.Table.from_pandas(data, preserve_index=False)

        assert arrow_table["a"].null_count == 4

        # write arrow to stream
        stream = pa.BufferOutputStream()
        writer = pa.RecordBatchStreamWriter(
            stream, arrow_table.schema, use_legacy_format=False
        )
        writer.write_table(arrow_table)
        writer.close()
        arrow = stream.getvalue().to_pybytes()

        # load
        tbl = Table(arrow)
        assert tbl.size() == 8

        # check types
        assert tbl.schema() == {"a": "float"}

        # check nans
        json = tbl.view().to_columns()

        assert json["a"] == [1.5, 2.5, None, 3.5, 4.5, None, None, None]
