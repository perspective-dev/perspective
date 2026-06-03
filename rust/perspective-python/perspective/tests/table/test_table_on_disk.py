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
import tempfile

import perspective as psp

client = psp.Server().new_local_client()
Table = client.table


def _perspective_temp_dirs():
    """All `perspective_*` directories currently in the OS temp directory.

    `BACKING_STORE_DISK` columns are written to a unique
    `<tempdir>/perspective_<uuid>/` directory by the C++ engine.
    """
    tmp = tempfile.gettempdir()
    try:
        entries = os.listdir(tmp)
    except OSError:
        return set()

    print(tmp)
    return {
        os.path.join(tmp, e)
        for e in entries
        if e.startswith("perspective_") and os.path.isdir(os.path.join(tmp, e))
    }


class TestTableOnDisk:
    # An on-disk table must be observationally identical to an in-memory one.

    def test_on_disk_schema_and_view(self):
        data = {
            "x": [1, 2, 3, 4],
            "y": ["a", "b", "c", "d"],
            "z": [True, False, True, False],
        }

        mem = Table(data)
        disk = Table(data, on_disk=True)
        assert disk.schema() == mem.schema()
        assert disk.view().to_columns() == mem.view().to_columns()

    def test_on_disk_csv(self):
        data = "x,y,z\n1,a,true\n2,b,false\n3,c,true\n4,d,false"
        tbl = Table(data, on_disk=True)
        assert tbl.schema() == {"x": "integer", "y": "string", "z": "boolean"}
        assert tbl.view().to_columns() == {
            "x": [1, 2, 3, 4],
            "y": ["a", "b", "c", "d"],
            "z": [True, False, True, False],
        }

    def test_on_disk_update_indexed(self):
        mem = Table({"x": [1, 2, 3], "y": [1.0, 2.0, 3.0]}, index="x")
        disk = Table({"x": [1, 2, 3], "y": [1.0, 2.0, 3.0]}, index="x", on_disk=True)
        update = {"x": [2, 4], "y": [20.0, 40.0]}
        mem.update(update)
        disk.update(update)
        assert disk.view().to_columns() == mem.view().to_columns()
        assert disk.size() == mem.size()

    def test_on_disk_group_by_aggregation(self):
        data = {"g": ["a", "b", "a", "b", "a"], "v": [1, 2, 3, 4, 5]}
        mem = Table(data)
        disk = Table(data, on_disk=True)
        config = {"group_by": ["g"], "columns": ["v"], "aggregates": {"v": "sum"}}
        assert disk.view(**config).to_columns() == mem.view(**config).to_columns()

    def test_on_disk_arrow_roundtrip(self):
        data = {"x": list(range(100)), "y": [float(i) / 2 for i in range(100)]}
        mem = Table(data)
        disk = Table(data, on_disk=True)
        assert disk.view().to_arrow() == mem.view().to_arrow()

    def test_on_disk_creates_backing_files(self):
        before = _perspective_temp_dirs()
        tbl = Table({"x": [1, 2, 3], "y": ["a", "b", "c"]}, on_disk=True)

        # Touch the table so it is not optimized away before we inspect the FS.
        assert tbl.size() == 3
        after = _perspective_temp_dirs()
        new_dirs = after - before
        assert new_dirs, "expected a new perspective_<uuid> directory on disk"
        assert any(os.listdir(d) for d in new_dirs), "expected column files on disk"

    def test_memory_table_creates_no_backing_files(self):
        before = _perspective_temp_dirs()
        tbl = Table({"x": [1, 2, 3]})
        assert tbl.size() == 3
        after = _perspective_temp_dirs()
        assert after == before, "in-memory table must not write to disk"

    def test_on_disk_growth_forces_resize(self):
        tbl = Table({"x": [0], "y": [0.0]}, index="x", on_disk=True)
        n = 50000
        tbl.update({"x": list(range(n)), "y": [float(i) for i in range(n)]})
        assert tbl.size() == n
        cols = tbl.view().to_columns()
        assert cols["x"][0] == 0
        assert cols["x"][-1] == n - 1
        assert cols["y"][-1] == float(n - 1)

    def test_on_disk_larger_dataset_matches_memory(self):
        n = 20000
        data = {
            "i": list(range(n)),
            "f": [float(i) * 1.5 for i in range(n)],
            "s": ["row_{}".format(i % 97) for i in range(n)],
        }

        mem = Table(data)
        disk = Table(data, on_disk=True)
        assert disk.view().to_arrow() == mem.view().to_arrow()


def _perspective_expr_dirs():
    """`perspective_expr_*` directories — the on-disk expression `m_master`."""
    tmp = tempfile.gettempdir()
    try:
        entries = os.listdir(tmp)
    except OSError:
        return set()

    return {
        os.path.join(tmp, e)
        for e in entries
        if e.startswith("perspective_expr_") and os.path.isdir(os.path.join(tmp, e))
    }


class TestTableOnDiskExpressions:
    def test_expression_numeric_equivalence(self):
        data = {"x": [1, 2, 3, 4], "y": [10.0, 20.0, 30.0, 40.0]}
        mem = Table(data)
        disk = Table(data, on_disk=True)
        exprs = {"sum": '"x" + "y"', "prod": '"x" * "y"'}
        assert (
            disk.view(expressions=exprs).to_columns()
            == mem.view(expressions=exprs).to_columns()
        )

    def test_expression_string_equivalence(self):
        data = {"a": ["foo", "bar", "baz"], "b": ["AA", "BB", "CC"]}
        mem = Table(data)
        disk = Table(data, on_disk=True)
        exprs = {"up": 'upper("a")', "lo": 'lower("b")'}
        assert (
            disk.view(expressions=exprs).to_columns()
            == mem.view(expressions=exprs).to_columns()
        )

    def test_expression_with_group_by_equivalence(self):
        data = {"g": ["a", "b", "a", "b"], "v": [1, 2, 3, 4]}
        mem = Table(data)
        disk = Table(data, on_disk=True)
        config = {
            "expressions": {"v2": '"v" * 2'},
            "group_by": ["g"],
            "columns": ["v2"],
            "aggregates": {"v2": "sum"},
        }

        assert disk.view(**config).to_columns() == mem.view(**config).to_columns()

    def test_expression_master_is_on_disk(self):
        before = _perspective_expr_dirs()
        tbl = Table({"x": [1, 2, 3], "y": [10.0, 20.0, 30.0]}, on_disk=True)
        view = tbl.view(expressions={"e": '"x" + "y"'})
        assert view.to_columns()["e"] == [11.0, 22.0, 33.0]
        new_dirs = _perspective_expr_dirs() - before
        assert new_dirs, (
            "expected a perspective_expr_<uuid> dir for the expression master"
        )

        assert any(os.listdir(d) for d in new_dirs), (
            "expected expression backing files on disk"
        )

    def test_memory_expression_creates_no_expr_dir(self):
        before = _perspective_expr_dirs()
        tbl = Table({"x": [1, 2, 3], "y": [10.0, 20.0, 30.0]})
        view = tbl.view(expressions={"e": '"x" + "y"'})
        assert view.to_columns()["e"] == [11.0, 22.0, 33.0]
        assert _perspective_expr_dirs() == before, (
            "in-memory table must not write expression data to disk"
        )

    def test_expression_on_disk_update_and_larger(self):
        n = 10000
        tbl = Table({"x": [0], "y": [0.0]}, index="x", on_disk=True)
        tbl.update({"x": list(range(n)), "y": [float(i) for i in range(n)]})
        cols = tbl.view(expressions={"e": '"x" + "y"'}).to_columns()
        assert cols["e"][0] == 0.0
        assert cols["e"][-1] == float((n - 1) + (n - 1))
