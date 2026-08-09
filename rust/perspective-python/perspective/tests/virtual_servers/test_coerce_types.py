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

import io
from decimal import Decimal

import pyarrow as pa
import pyarrow.ipc as ipc
import pytest

import perspective
from perspective import Client
from perspective.virtual_servers import VirtualServerHandler

FEATURES = {
    "group_by": True,
    "split_by": True,
    "sort": True,
    "group_rollup_mode": ["rollup", "flat", "total"],
    "filter_ops": {
        "integer": ["=="],
        "float": ["=="],
        "string": ["=="],
        "boolean": ["=="],
        "date": ["=="],
        "datetime": ["=="],
    },
    "aggregates": {
        "integer": ["sum"],
        "float": ["sum"],
        "string": ["count"],
    },
}


class ArrowFixtureHandler(VirtualServerHandler):
    def __init__(self, arrow_table, schema, ipc_bytes=None):
        self.arrow_table = arrow_table
        self.schema = schema
        # `write_table` *drops* zero-row batches, so the only way to serve
        # a stream that carries one is to hand over the bytes.
        self.ipc_bytes = ipc_bytes

    def get_features(self):
        return FEATURES

    def get_hosted_tables(self):
        return ["fixture"]

    def table_schema(self, table_name):
        return self.schema

    def table_size(self, table_name):
        return self.arrow_table.num_rows

    def table_make_view(self, table_name, view_name, config):
        pass

    def view_delete(self, view_name):
        pass

    def view_get_data(self, view_name, config, schema, viewport, data):
        if self.ipc_bytes is not None:
            data.from_arrow_ipc(self.ipc_bytes)
            return

        buf = io.BytesIO()
        with ipc.new_stream(buf, self.arrow_table.schema) as writer:
            writer.write_table(self.arrow_table)

        data.from_arrow_ipc(buf.getvalue())


class SetColFixtureHandler(VirtualServerHandler):
    def __init__(self, row_path, schema):
        self.row_path = row_path
        self.schema = schema

    def get_features(self):
        return FEATURES

    def get_hosted_tables(self):
        return ["fixture"]

    def table_schema(self, table_name):
        return self.schema

    def table_size(self, table_name):
        return len(self.row_path)

    def table_make_view(self, table_name, view_name, config):
        pass

    def view_delete(self, view_name):
        pass

    def view_get_data(self, view_name, config, schema, viewport, data):
        for row_idx, value in enumerate(self.row_path):
            data.set_col("string", "__ROW_PATH_0__", row_idx, value, 0)


def make_client(handler):
    session = perspective.VirtualServer(handler)

    def handle_request(msg):
        handle_response(session.handle_request(msg))

    def handle_response(msg):
        client.handle_response(msg)

    client = Client(handle_request)
    return client


def arrow_client(arrow_table, schema=None, ipc_bytes=None):
    if schema is None:
        schema = {
            name: "string"
            for name in arrow_table.column_names
            if not name.startswith("__")
        }

    return make_client(ArrowFixtureHandler(arrow_table, schema, ipc_bytes))


def round_trip(arrow_table, schema=None, **config):
    table = arrow_client(arrow_table, schema).open_table("fixture")
    view = table.view(**config)
    result = view.to_columns()
    view.delete()
    return result


def dictionary(values, indices, index_type, value_type=pa.utf8()):
    return pa.DictionaryArray.from_arrays(
        pa.array(indices, type=index_type),
        pa.array(values, type=value_type),
    )


class TestCoerceSmallIntegers:
    def test_coerce_int8(self):
        table = pa.table({"col": pa.array([-1, 127, None], type=pa.int8())})
        result = round_trip(table, {"col": "integer"})
        assert result["col"] == [-1, 127, None]

    def test_coerce_int16(self):
        table = pa.table({"col": pa.array([-300, 32000, None], type=pa.int16())})
        result = round_trip(table, {"col": "integer"})
        assert result["col"] == [-300, 32000, None]


class TestCoerceUnsignedIntegers:
    def test_coerce_uint8(self):
        table = pa.table({"col": pa.array([0, 255, None], type=pa.uint8())})
        result = round_trip(table, {"col": "integer"})
        assert result["col"] == [0, 255, None]

    def test_coerce_uint16(self):
        table = pa.table({"col": pa.array([0, 65535, None], type=pa.uint16())})
        result = round_trip(table, {"col": "integer"})
        assert result["col"] == [0, 65535, None]

    def test_coerce_uint32(self):
        table = pa.table({"col": pa.array([0, 4_294_967_295, None], type=pa.uint32())})
        result = round_trip(table, {"col": "float"})
        assert result["col"] == [0.0, 4_294_967_295.0, None]

    def test_coerce_uint64(self):
        table = pa.table({"col": pa.array([0, 1 << 53, None], type=pa.uint64())})
        result = round_trip(table, {"col": "float"})
        assert result["col"] == [0.0, 9_007_199_254_740_992.0, None]


class TestCoerceFloats:
    def test_coerce_float32(self):
        table = pa.table({"col": pa.array([3.14, -0.0, None], type=pa.float32())})
        result = round_trip(table, {"col": "float"})
        assert result["col"][0] == pytest.approx(3.14, abs=0.001)
        assert result["col"][1] == 0.0
        assert result["col"][2] is None

    def test_coerce_float16(self):
        table = pa.table({"col": pa.array([1.5, -2.0, None], type=pa.float16())})
        result = round_trip(table, {"col": "float"})
        assert result["col"] == [1.5, -2.0, None]


class TestCoerceDecimal:
    def test_coerce_decimal128(self):
        table = pa.table(
            {
                "col": pa.array(
                    [Decimal("1.234"), Decimal("-5.678"), None],
                    type=pa.decimal128(18, 3),
                )
            }
        )
        result = round_trip(table, {"col": "float"})
        assert result["col"][0] == pytest.approx(1.234)
        assert result["col"][1] == pytest.approx(-5.678)
        assert result["col"][2] is None


class TestCoerceDates:
    def test_coerce_date64(self):
        day = 19738
        table = pa.table({"col": pa.array([day * 86_400_000, None], type=pa.date64())})
        result = round_trip(table, {"col": "date"})
        assert result["col"] == [day * 86_400_000, None]

    def test_coerce_date32(self):
        day = 19738
        table = pa.table({"col": pa.array([day, None], type=pa.date32())})
        result = round_trip(table, {"col": "date"})
        assert result["col"] == [day * 86_400_000, None]


class TestCoerceTimes:
    def test_coerce_time32_seconds(self):
        table = pa.table({"col": pa.array([3661, None], type=pa.time32("s"))})
        result = round_trip(table, {"col": "datetime"})
        assert result["col"] == [3_661_000, None]

    def test_coerce_time32_millis(self):
        table = pa.table({"col": pa.array([3_661_000, None], type=pa.time32("ms"))})
        result = round_trip(table, {"col": "datetime"})
        assert result["col"] == [3_661_000, None]

    def test_coerce_time64_micros(self):
        table = pa.table({"col": pa.array([3_661_000_000, None], type=pa.time64("us"))})
        result = round_trip(table, {"col": "datetime"})
        assert result["col"] == [3_661_000, None]

    def test_coerce_time64_nanos(self):
        table = pa.table(
            {"col": pa.array([3_661_000_000_000, None], type=pa.time64("ns"))}
        )
        result = round_trip(table, {"col": "datetime"})
        assert result["col"] == [3_661_000, None]

    @pytest.mark.parametrize(
        "unit,value",
        [
            ("s", 1_700_000_000),
            ("ms", 1_700_000_000_000),
            ("us", 1_700_000_000_000_000),
            ("ns", 1_700_000_000_000_000_000),
        ],
    )
    def test_coerce_timestamp_with_timezone(self, unit, value):
        table = pa.table(
            {"col": pa.array([value, None], type=pa.timestamp(unit, tz="UTC"))}
        )
        result = round_trip(table, {"col": "datetime"})
        assert result["col"] == [1_700_000_000_000, None]

    def test_coerce_timestamp_seconds(self):
        table = pa.table(
            {"col": pa.array([1_700_000_000, None], type=pa.timestamp("s"))}
        )
        result = round_trip(table, {"col": "datetime"})
        assert result["col"] == [1_700_000_000_000, None]


class TestCoerceStrings:
    def test_coerce_utf8(self):
        table = pa.table({"col": pa.array(["a", None, "c"], type=pa.utf8())})
        result = round_trip(table)
        assert result["col"] == ["a", None, "c"]

    def test_coerce_large_utf8(self):
        table = pa.table({"col": pa.array(["a", None, "c"], type=pa.large_utf8())})
        result = round_trip(table)
        assert result["col"] == ["a", None, "c"]


class TestFallback:
    def test_fallback_fixed_size_binary(self):
        # No canonical mapping - lossy but total, and warned about.
        table = pa.table(
            {"col": pa.array([b"ab", b"cd", None], type=pa.binary(2))}
        )
        result = round_trip(table)
        assert isinstance(result["col"][0], str)
        assert isinstance(result["col"][1], str)
        assert result["col"][0] != result["col"][1]
        assert result["col"][2] is None


class TestDictionary:
    @pytest.mark.parametrize(
        "index_type",
        [
            pa.int8(),
            pa.int16(),
            pa.int32(),
            pa.int64(),
            pa.uint8(),
            pa.uint16(),
            pa.uint32(),
            pa.uint64(),
        ],
    )
    @pytest.mark.parametrize("value_type", [pa.utf8(), pa.large_utf8()])
    def test_dictionary_keys_and_values(self, index_type, value_type):
        col = dictionary(
            ["alpha", "beta"], [0, 1, 0, None], index_type, value_type
        )
        result = round_trip(pa.table({"col": col}))
        assert result["col"] == ["alpha", "beta", "alpha", None]

    def test_dictionary_null_value_slot(self):
        col = pa.DictionaryArray.from_arrays(
            pa.array([0, 1], type=pa.int8()),
            pa.array(["alpha", None], type=pa.utf8()),
        )
        result = round_trip(pa.table({"col": col}))
        assert result["col"] == ["alpha", None]

    def test_dictionary_of_integers(self):
        col = pa.DictionaryArray.from_arrays(
            pa.array([0, 1, 0], type=pa.uint8()),
            pa.array([-7, 42], type=pa.int16()),
        )
        result = round_trip(pa.table({"col": col}), {"col": "integer"})
        assert result["col"] == [-7, 42, -7]

    def test_dictionary_group_by(self):
        table = pa.table(
            {
                "__GROUPING_ID__": pa.array([1, 0, 0], type=pa.uint64()),
                "__ROW_PATH_0__": dictionary(
                    ["alpha", "beta"], [None, 0, 1], pa.uint8()
                ),
                "Sales": pa.array([3.0, 1.0, 2.0], type=pa.float64()),
            }
        )

        result = round_trip(
            table,
            {"Region": "string", "Sales": "float"},
            group_by=["Region"],
            columns=["Sales"],
        )

        assert result["__ROW_PATH__"] == [[], ["alpha"], ["beta"]]
        assert result["Sales"] == [3.0, 1.0, 2.0]


class TestGroupingId:
    def test_unsigned_grouping_id(self):
        table = pa.table(
            {
                "__GROUPING_ID__": pa.array([1, 0, 0], type=pa.uint64()),
                "__ROW_PATH_0__": pa.array([None, "alpha", "beta"], type=pa.utf8()),
                "Sales": pa.array([3.0, 1.0, 2.0], type=pa.float64()),
            }
        )

        result = round_trip(
            table,
            {"Region": "string", "Sales": "float"},
            group_by=["Region"],
            columns=["Sales"],
        )

        assert result["__ROW_PATH__"] == [[], ["alpha"], ["beta"]]

    def test_decimal_row_path(self):
        table = pa.table(
            {
                "__GROUPING_ID__": pa.array([1, 0], type=pa.int64()),
                "__ROW_PATH_0__": pa.array(
                    [None, Decimal("1.500")], type=pa.decimal128(18, 3)
                ),
                "Sales": pa.array([3.0, 3.0], type=pa.float64()),
            }
        )

        result = round_trip(
            table,
            {"Price": "float", "Sales": "float"},
            group_by=["Price"],
            columns=["Sales"],
        )

        assert result["__ROW_PATH__"] == [[], [1.5]]


class TestEmpty:
    def test_zero_row_batch(self):
        # One batch, no rows - written explicitly, since `write_table`
        # would drop it.
        schema = pa.schema([("col", pa.int32())])
        buf = io.BytesIO()
        writer = ipc.RecordBatchStreamWriter(buf, schema)
        writer.write_batch(pa.record_batch([[]], schema=schema))
        writer.close()

        table = pa.Table.from_batches([], schema)
        client = arrow_client(table, {"col": "integer"}, ipc_bytes=buf.getvalue())
        view = client.open_table("fixture").view()
        assert view.to_columns()["col"] == []
        view.delete()

    def test_no_batches_at_all(self):
        schema = pa.schema([("col", pa.int32())])
        table = pa.Table.from_batches([], schema)
        result = round_trip(table, {"col": "integer"})
        assert result["col"] == []

    def test_row_path_only_batch(self):
        table = pa.table(
            {
                "__GROUPING_ID__": pa.array([1, 0, 0], type=pa.int64()),
                "__ROW_PATH_0__": pa.array([None, "alpha", "beta"], type=pa.utf8()),
            }
        )

        client = arrow_client(table, {"Region": "string"})
        view = client.open_table("fixture").view(group_by=["Region"], columns=[])
        assert view.to_json() == [
            {"__ROW_PATH__": []},
            {"__ROW_PATH__": ["alpha"]},
            {"__ROW_PATH__": ["beta"]},
        ]

        view.delete()

    def test_metadata_only_batch_preserves_row_count(self):
        table = pa.table({"__GROUPING_ID__": pa.array([0, 0, 0], type=pa.int64())})
        client = arrow_client(table, {"Region": "string"})
        view = client.open_table("fixture").view(columns=[])
        assert view.to_json() == [{}, {}, {}]
        view.delete()

    def test_set_col_row_path_only(self):
        handler = SetColFixtureHandler(["alpha", "beta"], {"Region": "string"})
        view = make_client(handler).open_table("fixture").view(
            group_by=["Region"], columns=[]
        )

        assert view.to_json() == [
            {"__ROW_PATH__": ["alpha"]},
            {"__ROW_PATH__": ["beta"]},
        ]

        view.delete()


class TestNotConstructible:
    def test_virtual_data_slice_is_not_constructible(self):
        with pytest.raises(TypeError):
            perspective.VirtualDataSlice()
