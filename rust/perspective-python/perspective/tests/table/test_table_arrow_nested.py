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
import pytest
import perspective as psp


client = psp.Server().new_local_client()
Table = client.table


def arrow_bytes(table):
    sink = pa.BufferOutputStream()
    with pa.RecordBatchFileWriter(sink, table.schema) as writer:
        writer.write_table(table)

    return sink.getvalue().to_pybytes()


class TestTableArrowStruct(object):
    def test_struct_flattens_to_dotted_columns(self):
        data = pa.table(
            {
                "id": pa.array([1, 2], type=pa.int64()),
                "s": pa.array(
                    [{"a": 10, "b": 1.5}, {"a": 20, "b": 2.5}],
                    type=pa.struct([("a", pa.int64()), ("b", pa.float64())]),
                ),
            }
        )

        tbl = Table(data)
        assert tbl.schema() == {
            "id": "integer",
            "s.a": "integer",
            "s.b": "float",
        }

        assert tbl.view().to_columns() == {
            "id": [1, 2],
            "s.a": [10, 20],
            "s.b": [1.5, 2.5],
        }

    def test_struct_of_struct_recurses(self):
        inner = pa.struct([("c", pa.int64())])
        data = pa.table(
            {
                "s": pa.array(
                    [{"b": {"c": 1}}, {"b": {"c": 2}}],
                    type=pa.struct([("b", inner)]),
                )
            }
        )

        tbl = Table(data)
        assert tbl.schema() == {"s.b.c": "integer"}
        assert tbl.view().to_columns() == {"s.b.c": [1, 2]}

    def test_struct_null_parent_nulls_all_leaves(self):
        data = pa.table(
            {
                "s": pa.array(
                    [{"a": 1, "b": 2}, None, {"a": 3, "b": 4}],
                    type=pa.struct([("a", pa.int64()), ("b", pa.int64())]),
                )
            }
        )

        tbl = Table(data)
        assert tbl.view().to_columns() == {
            "s.a": [1, None, 3],
            "s.b": [2, None, 4],
        }

    def test_struct_null_child_and_null_parent(self):
        data = pa.table(
            {
                "s": pa.array(
                    [{"a": 1}, {"a": None}, None],
                    type=pa.struct([("a", pa.int64())]),
                )
            }
        )

        tbl = Table(data)
        assert tbl.view().to_columns() == {"s.a": [1, None, None]}

    def test_struct_sliced_input(self):
        data = pa.table(
            {
                "s": pa.array(
                    [{"a": 1}, {"a": 2}, {"a": 3}, {"a": 4}],
                    type=pa.struct([("a", pa.int64())]),
                )
            }
        ).slice(1, 2)

        tbl = Table(data)
        assert tbl.view().to_columns() == {"s.a": [2, 3]}

    def test_struct_multi_chunk(self):
        chunk = pa.array([{"a": 1}], type=pa.struct([("a", pa.int64())]))
        data = pa.table({"s": pa.chunked_array([chunk, chunk, chunk])})
        tbl = Table(data)
        assert tbl.view().to_columns() == {"s.a": [1, 1, 1]}

    def test_struct_update_matches_declared_dotted_schema(self):
        tbl = Table({"id": "integer", "s.a": "integer"})
        tbl.update(
            arrow_bytes(
                pa.table(
                    {
                        "id": pa.array([1], type=pa.int64()),
                        "s": pa.array(
                            [{"a": 7}], type=pa.struct([("a", pa.int64())])
                        ),
                    }
                )
            )
        )

        assert tbl.view().to_columns() == {"id": [1], "s.a": [7]}


class TestTableArrowList(object):
    def test_list_zip_is_the_default(self):
        data = pa.table(
            {
                "x": pa.array([1, 2], type=pa.int64()),
                "y": pa.array([[10, 20, 30], [40]], type=pa.list_(pa.int64())),
            }
        )

        tbl = Table(data)
        assert tbl.schema() == {"x": "integer", "y": "integer"}
        assert tbl.view().to_columns() == {
            "x": [1, 1, 1, 2],
            "y": [10, 20, 30, 40],
        }

    def test_list_empty_yields_one_null_row(self):
        data = pa.table(
            {
                "x": pa.array([1, 2], type=pa.int64()),
                "y": pa.array([[], [40]], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data).view().to_columns() == {
            "x": [1, 2],
            "y": [None, 40],
        }

    def test_list_null_yields_one_null_row(self):
        data = pa.table(
            {
                "x": pa.array([1, 2], type=pa.int64()),
                "y": pa.array([None, [40]], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data).view().to_columns() == {
            "x": [1, 2],
            "y": [None, 40],
        }

    def test_list_of_struct_composes_both_passes(self):
        data = pa.table(
            {
                "id": pa.array([1], type=pa.int64()),
                "orders": pa.array(
                    [[{"price": 1.5}, {"price": 2.5}]],
                    type=pa.list_(pa.struct([("price", pa.float64())])),
                ),
            }
        )

        tbl = Table(data)
        assert tbl.schema() == {"id": "integer", "orders.price": "float"}
        assert tbl.view().to_columns() == {
            "id": [1, 1],
            "orders.price": [1.5, 2.5],
        }

    def test_list_nested_inside_a_struct(self):
        data = pa.table(
            {
                "id": pa.array([1, 2], type=pa.int64()),
                "s": pa.array(
                    [{"a": [10, 20]}, {"a": [30]}],
                    type=pa.struct([("a", pa.list_(pa.int64()))]),
                ),
            }
        )

        tbl = Table(data)
        assert tbl.schema() == {"id": "integer", "s.a": "integer"}
        assert tbl.view().to_columns() == {
            "id": [1, 1, 2],
            "s.a": [10, 20, 30],
        }

    def test_nested_list_recurses(self):
        data = pa.table(
            {
                "y": pa.array(
                    [[[1, 2], [3]]], type=pa.list_(pa.list_(pa.int64()))
                )
            }
        )

        assert Table(data).view().to_columns() == {"y": [1, 2, 3]}

    def test_list_zip_equal_lengths(self):
        data = pa.table(
            {
                "a": pa.array([[1, 2]], type=pa.list_(pa.int64())),
                "b": pa.array([[3, 4]], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data).view().to_columns() == {"a": [1, 2], "b": [3, 4]}

    def test_list_multi_chunk(self):
        chunk = pa.array([[1, 2]], type=pa.list_(pa.int64()))
        data = pa.table({"y": pa.chunked_array([chunk, chunk])})
        assert Table(data).view().to_columns() == {"y": [1, 2, 1, 2]}

    def test_list_cartesian(self):
        data = pa.table(
            {
                "a": pa.array([[1, 2]], type=pa.list_(pa.int64())),
                "b": pa.array([[3, 4, 5]], type=pa.list_(pa.int64())),
            }
        )

        tbl = Table(data, list_flatten="cartesian")
        assert tbl.view().to_columns() == {
            "a": [1, 1, 1, 2, 2, 2],
            "b": [3, 4, 5, 3, 4, 5],
        }

    def test_list_cartesian_empty_counts_as_one(self):
        data = pa.table(
            {
                "a": pa.array([[1, 2]], type=pa.list_(pa.int64())),
                "b": pa.array([[]], type=pa.list_(pa.int64())),
            }
        )

        tbl = Table(data, list_flatten="cartesian")
        assert tbl.view().to_columns() == {"a": [1, 2], "b": [None, None]}

    def test_list_stringify_preserves_legacy_behavior(self):
        data = pa.table(
            {
                "x": pa.array([1, 2], type=pa.int64()),
                "y": pa.array([[10, 20], [30]], type=pa.list_(pa.int64())),
            }
        )

        tbl = Table(data, list_flatten="stringify")
        assert tbl.schema() == {"x": "integer", "y": "string"}
        assert tbl.view().to_columns() == {
            "x": [1, 2],
            "y": ["[10,20]", "[30]"],
        }

    def test_list_stringify_integer_widths(self):
        data = pa.table(
            {
                "i8": pa.array([[-1, 2]], type=pa.list_(pa.int8())),
                "i16": pa.array([[-300, 300]], type=pa.list_(pa.int16())),
                "i32": pa.array([[-70000, 70000]], type=pa.list_(pa.int32())),
                "i64": pa.array(
                    [[-(2**40), 2**40]], type=pa.list_(pa.int64())
                ),
                "u8": pa.array([[255]], type=pa.list_(pa.uint8())),
                "u16": pa.array([[65535]], type=pa.list_(pa.uint16())),
                "u32": pa.array([[4294967295]], type=pa.list_(pa.uint32())),
                # Above INT64_MAX, so a signed writer would emit a negative.
                "u64": pa.array(
                    [[18446744073709551615]], type=pa.list_(pa.uint64())
                ),
            }
        )

        assert Table(data, list_flatten="stringify").view().to_columns() == {
            "i8": ["[-1,2]"],
            "i16": ["[-300,300]"],
            "i32": ["[-70000,70000]"],
            "i64": ["[-1099511627776,1099511627776]"],
            "u8": ["[255]"],
            "u16": ["[65535]"],
            "u32": ["[4294967295]"],
            "u64": ["[18446744073709551615]"],
        }

    def test_list_flatten_mode_persists_across_update(self):
        schema = pa.schema(
            [("x", pa.int64()), ("y", pa.list_(pa.int64()))]
        )

        tbl = Table(
            arrow_bytes(pa.table({"x": [1], "y": [[10, 20]]}, schema=schema)),
            list_flatten="cartesian",
        )

        tbl.update(
            arrow_bytes(pa.table({"x": [2], "y": [[30, 40]]}, schema=schema))
        )

        assert tbl.view().to_columns() == {
            "x": [1, 1, 2, 2],
            "y": [10, 20, 30, 40],
        }

    def test_list_limit_counts_expanded_rows(self):
        data = pa.table(
            {"y": pa.array([[1, 2, 3, 4]], type=pa.list_(pa.int64()))}
        )

        assert Table(data, limit=2).view().to_columns() == {"y": [3, 4]}


class TestTableArrowExpandedIndex(object):
    """An index is only rejected when expansion would REPEAT it. A column drawn
    from the exploded list takes a distinct element per row, so it is a
    legitimate key."""

    def orders(self, ids, prices):
        return pa.table(
            {
                "batch": pa.array([1], type=pa.int64()),
                "orders": pa.array(
                    [[{"id": i, "price": p} for i, p in zip(ids, prices)]],
                    type=pa.list_(
                        pa.struct([("id", pa.int64()), ("price", pa.float64())])
                    ),
                ),
            }
        )

    def test_index_on_a_column_from_the_list_is_allowed(self):
        tbl = Table(self.orders([1, 2, 3], [1.5, 2.5, 3.5]), index="orders.id")
        assert tbl.view().to_columns() == {
            "batch": [1, 1, 1],
            "orders.id": [1, 2, 3],
            "orders.price": [1.5, 2.5, 3.5],
        }

    def test_index_from_the_list_updates_by_element(self):
        tbl = Table(self.orders([1, 2], [1.5, 2.5]), index="orders.id")
        tbl.update(arrow_bytes(self.orders([2, 3], [9.5, 3.5])))
        assert tbl.view().to_columns() == {
            "batch": [1, 1, 1],
            "orders.id": [1, 2, 3],
            "orders.price": [1.5, 9.5, 3.5],
        }

    def test_index_on_a_sibling_is_rejected(self):
        with pytest.raises(psp.PerspectiveError, match=r"`batch`"):
            Table(self.orders([1, 2], [1.5, 2.5]), index="batch")

    def test_index_on_a_list_column_itself_is_allowed(self):
        data = pa.table(
            {
                "x": pa.array([1], type=pa.int64()),
                "id": pa.array([[10, 20]], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data, index="id").view().to_columns() == {
            "x": [1, 1],
            "id": [10, 20],
        }

    def test_cartesian_with_two_lists_repeats_every_column(self):
        data = pa.table(
            {
                "id": pa.array([[1, 2]], type=pa.list_(pa.int64())),
                "b": pa.array([[3, 4, 5]], type=pa.list_(pa.int64())),
            }
        )

        with pytest.raises(psp.PerspectiveError, match=r"`id`"):
            Table(data, index="id", list_flatten="cartesian")

    def test_cartesian_with_one_list_is_allowed(self):
        data = pa.table(
            {
                "x": pa.array([1], type=pa.int64()),
                "id": pa.array([[10, 20]], type=pa.list_(pa.int64())),
            }
        )

        tbl = Table(data, index="id", list_flatten="cartesian")
        assert tbl.view().to_columns() == {"x": [1, 1], "id": [10, 20]}

    def test_stringify_keeps_a_sibling_index_usable(self):
        data = pa.table(
            {
                "id": pa.array([1, 2], type=pa.int64()),
                "y": pa.array([[10, 20], [30]], type=pa.list_(pa.int64())),
            }
        )

        tbl = Table(data, index="id", list_flatten="stringify")
        assert tbl.view().to_columns() == {
            "id": [1, 2],
            "y": ["[10,20]", "[30]"],
        }


class TestTableArrowGather(object):
    """The expansion is deferred into the `t_column` write rather than
    materialized in Arrow, so these stress the gather paths specifically."""

    def test_expansion_gathers_across_chunks(self):
        x = pa.chunked_array(
            [pa.array([1], type=pa.int64()), pa.array([2], type=pa.int64())]
        )

        y = pa.chunked_array(
            [
                pa.array([[10, 20]], type=pa.list_(pa.int64())),
                pa.array([[30]], type=pa.list_(pa.int64())),
            ]
        )

        assert Table(pa.table({"x": x, "y": y})).view().to_columns() == {
            "x": [1, 1, 2],
            "y": [10, 20, 30],
        }

    def test_expansion_gathers_strings(self):
        data = pa.table(
            {
                "s": pa.array(["a", "b"], type=pa.string()),
                "y": pa.array([[1, 2, 3], [4]], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data).view().to_columns() == {
            "s": ["a", "a", "a", "b"],
            "y": [1, 2, 3, 4],
        }

    def test_expansion_gathers_nulls_in_siblings(self):
        data = pa.table(
            {
                "x": pa.array([None, 2], type=pa.int64()),
                "y": pa.array([[10, 20], [30]], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data).view().to_columns() == {
            "x": [None, None, 2],
            "y": [10, 20, 30],
        }

    def test_expansion_of_all_empty_lists(self):
        data = pa.table(
            {
                "x": pa.array([1, 2], type=pa.int64()),
                "y": pa.array([[], []], type=pa.list_(pa.int64())),
            }
        )

        assert Table(data).view().to_columns() == {
            "x": [1, 2],
            "y": [None, None],
        }

    def test_sliced_input_with_nulls(self):
        data = pa.table(
            {"a": pa.array([1, None, 3, None, 5], type=pa.int64())}
        ).slice(1, 3)

        assert Table(data).view().to_columns() == {"a": [None, 3, None]}


class TestTableArrowFlatUnaffected(object):
    """A table with neither struct nor list columns must be untouched by
    normalization; these lock the flat path against regressions."""

    def test_flat_arrow_roundtrip(self):
        data = pa.table(
            {
                "a": pa.array([1, 2, 3], type=pa.int64()),
                "b": pa.array(["x", "y", "z"], type=pa.string()),
                "c": pa.array([1.5, 2.5, 3.5], type=pa.float64()),
            }
        )

        tbl = Table(data)
        assert tbl.schema() == {"a": "integer", "b": "string", "c": "float"}
        assert tbl.view().to_columns() == {
            "a": [1, 2, 3],
            "b": ["x", "y", "z"],
            "c": [1.5, 2.5, 3.5],
        }

    def test_flat_arrow_indexed_update(self):
        data = pa.table(
            {
                "a": pa.array([1, 2], type=pa.int64()),
                "b": pa.array([10, 20], type=pa.int64()),
            }
        )

        tbl = Table(data, index="a")
        tbl.update(
            arrow_bytes(
                pa.table(
                    {
                        "a": pa.array([2], type=pa.int64()),
                        "b": pa.array([99], type=pa.int64()),
                    }
                )
            )
        )

        assert tbl.view().to_columns() == {"a": [1, 2], "b": [10, 99]}
