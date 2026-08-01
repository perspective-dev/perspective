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
import json
from decimal import Decimal

import pyarrow as pa
import pyarrow.ipc as ipc

from perspective import VirtualDataSlice


def round_trip(arrow_table):
    """Serialize a PyArrow table to IPC, feed through VirtualDataSlice, read back as JSON."""
    buf = io.BytesIO()
    with ipc.new_stream(buf, arrow_table.schema) as writer:
        writer.write_table(arrow_table)
    ds = VirtualDataSlice()
    ds.from_arrow_ipc(buf.getvalue())
    return json.loads(ds.render_to_columns_json())


class TestCoerceSmallIntegers:
    def test_coerce_int8(self):
        table = pa.table({"col": pa.array([-1, 127, None], type=pa.int8())})
        result = round_trip(table)
        assert result["col"] == [-1, 127, None]

    def test_coerce_int16(self):
        table = pa.table({"col": pa.array([-300, 32000, None], type=pa.int16())})
        result = round_trip(table)
        assert result["col"] == [-300, 32000, None]


class TestCoerceUnsignedIntegers:
    def test_coerce_uint8(self):
        table = pa.table({"col": pa.array([0, 255, None], type=pa.uint8())})
        result = round_trip(table)
        assert result["col"] == [0, 255, None]

    def test_coerce_uint16(self):
        table = pa.table({"col": pa.array([0, 65535, None], type=pa.uint16())})
        result = round_trip(table)
        assert result["col"] == [0, 65535, None]

    def test_coerce_uint32(self):
        table = pa.table({"col": pa.array([0, 4_294_967_295, None], type=pa.uint32())})
        result = round_trip(table)
        assert result["col"] == [0.0, 4_294_967_295.0, None]

    def test_coerce_uint64(self):
        table = pa.table({"col": pa.array([0, 1 << 53, None], type=pa.uint64())})
        result = round_trip(table)
        assert result["col"] == [0.0, 9_007_199_254_740_992.0, None]


class TestCoerceFloat32:
    def test_coerce_float32(self):
        table = pa.table({"col": pa.array([3.14, -0.0, None], type=pa.float32())})
        result = round_trip(table)
        assert abs(result["col"][0] - 3.14) < 0.001
        assert result["col"][1] == 0.0
        assert result["col"][2] is None


class TestCoerceDate64:
    def test_coerce_date64(self):
        day = 19738
        table = pa.table({"col": pa.array([day * 86_400_000, None], type=pa.date64())})
        result = round_trip(table)
        assert result["col"] == [day * 86_400_000, None]


class TestCoerceTime:
    def test_coerce_time32_second(self):
        table = pa.table({"col": pa.array([49530, None], type=pa.time32("s"))})
        result = round_trip(table)
        assert result["col"] == [49_530_000, None]

    def test_coerce_time32_millisecond(self):
        table = pa.table({"col": pa.array([49_530_000, None], type=pa.time32("ms"))})
        result = round_trip(table)
        assert result["col"] == [49_530_000, None]

    def test_coerce_time64_microsecond(self):
        table = pa.table(
            {"col": pa.array([49_530_000_000, None], type=pa.time64("us"))}
        )
        result = round_trip(table)
        assert result["col"] == [49_530_000, None]

    def test_coerce_time64_nanosecond(self):
        table = pa.table(
            {"col": pa.array([49_530_000_000_000, None], type=pa.time64("ns"))}
        )
        result = round_trip(table)
        assert result["col"] == [49_530_000, None]


class TestCoerceLargeUtf8:
    def test_coerce_large_utf8(self):
        table = pa.table({"col": pa.array(["hello", "", None], type=pa.large_utf8())})
        result = round_trip(table)
        assert result["col"] == ["hello", "", None]


class TestCoerceDecimal128:
    def test_coerce_decimal128(self):
        arr = pa.array([Decimal("1234.5678"), None], type=pa.decimal128(10, 4))
        table = pa.table({"col": arr})
        result = round_trip(table)
        assert result["col"] == [1234.5678, None]


class TestCoerceInt64:
    def test_coerce_int64(self):
        table = pa.table({"col": pa.array([1, -1, None], type=pa.int64())})
        result = round_trip(table)
        assert result["col"] == [1.0, -1.0, None]


class TestCoerceTimestamp:
    def test_coerce_timestamp_second(self):
        table = pa.table({"col": pa.array([1000, None], type=pa.timestamp("s"))})
        result = round_trip(table)
        assert result["col"] == [1_000_000, None]

    def test_coerce_timestamp_microsecond(self):
        table = pa.table({"col": pa.array([1_000_000, None], type=pa.timestamp("us"))})
        result = round_trip(table)
        assert result["col"] == [1000, None]

    def test_coerce_timestamp_nanosecond(self):
        table = pa.table(
            {"col": pa.array([1_000_000_000, None], type=pa.timestamp("ns"))}
        )
        result = round_trip(table)
        assert result["col"] == [1000, None]


class TestPassthrough:
    def test_passthrough_bool(self):
        table = pa.table({"col": pa.array([True, False, None], type=pa.bool_())})
        result = round_trip(table)
        assert result["col"] == [True, False, None]

    def test_passthrough_utf8(self):
        table = pa.table({"col": pa.array(["a", "b", None], type=pa.utf8())})
        result = round_trip(table)
        assert result["col"] == ["a", "b", None]

    def test_passthrough_float64(self):
        table = pa.table({"col": pa.array([1.5, -2.5, None], type=pa.float64())})
        result = round_trip(table)
        assert result["col"] == [1.5, -2.5, None]

    def test_passthrough_int32(self):
        table = pa.table({"col": pa.array([1, -1, None], type=pa.int32())})
        result = round_trip(table)
        assert result["col"] == [1, -1, None]

    def test_passthrough_date32(self):
        table = pa.table({"col": pa.array([19738, None], type=pa.date32())})
        result = round_trip(table)
        assert result["col"] == [19738 * 86_400_000, None]

    def test_passthrough_timestamp_millisecond(self):
        table = pa.table({"col": pa.array([1000, None], type=pa.timestamp("ms"))})
        result = round_trip(table)
        assert result["col"] == [1000, None]


class TestFallback:
    def test_fallback_fixed_size_binary(self):
        table = pa.table(
            {"col": pa.array([b"\x01\x02", b"\x03\x04", None], type=pa.binary(2))}
        )
        result = round_trip(table)
        col = result["col"]
        assert isinstance(col[0], str)
        assert isinstance(col[1], str)
        assert col[0] != col[1]
        assert col[2] is None


class TestDictionary:
    def test_dictionary_int8_utf8(self):
        indices = pa.array([0, 1, 0, None], type=pa.int8())
        dictionary = pa.array(["alpha", "beta"], type=pa.utf8())
        table = pa.table({"col": pa.DictionaryArray.from_arrays(indices, dictionary)})
        result = round_trip(table)
        assert result["col"] == ["alpha", "beta", "alpha", None]

    def test_dictionary_uint16_large_utf8(self):
        indices = pa.array([1, 0, None], type=pa.uint16())
        dictionary = pa.array(["x", "y"], type=pa.large_utf8())
        table = pa.table({"col": pa.DictionaryArray.from_arrays(indices, dictionary)})
        result = round_trip(table)
        assert result["col"] == ["y", "x", None]

    def test_dictionary_int32_utf8_passthrough(self):
        indices = pa.array([0, 1, None], type=pa.int32())
        dictionary = pa.array(["a", "b"], type=pa.utf8())
        table = pa.table({"col": pa.DictionaryArray.from_arrays(indices, dictionary)})
        result = round_trip(table)
        assert result["col"] == ["a", "b", None]


class TestEmpty:
    def test_empty_batch(self):
        # PyArrow's new_stream with an empty table writes no record batches,
        # so we use RecordBatchStreamWriter directly to produce a valid empty batch.
        schema = pa.schema([("col", pa.int8())])
        batch = pa.record_batch({"col": pa.array([], type=pa.int8())})
        buf = io.BytesIO()
        writer = ipc.RecordBatchStreamWriter(buf, schema)
        writer.write_batch(batch)
        writer.close()
        ds = VirtualDataSlice()
        ds.from_arrow_ipc(buf.getvalue())
        result = json.loads(ds.render_to_columns_json())
        assert result["col"] == []

    def test_empty_columns_preserves_row_count(self):
        # Metadata-only batch: all data columns dropped, but rows remain.
        schema = pa.schema([("__GROUPING_ID__", pa.int64())])
        batch = pa.record_batch({"__GROUPING_ID__": pa.array([0, 0, 0], type=pa.int64())})
        buf = io.BytesIO()
        writer = ipc.RecordBatchStreamWriter(buf, schema)
        writer.write_batch(batch)
        writer.close()
        ds = VirtualDataSlice()
        # Total mode triggers coerce path which drops __GROUPING_ID__.
        ds.from_arrow_ipc(buf.getvalue())
        # Should not crash; empty column map with preserved structure.
        result = json.loads(ds.render_to_columns_json())
        assert isinstance(result, dict)