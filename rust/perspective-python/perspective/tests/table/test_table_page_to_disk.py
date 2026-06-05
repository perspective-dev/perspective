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
from pytest import mark

client = psp.Server().new_local_client()
Table = client.table


def _perspective_temp_dirs():
    """All `perspective_*` directories currently in the OS temp directory.

    `BACKING_STORE_DISK` columns are written to a unique
    `<tempdir>/perspective_<uuid>/` directory.
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
    def test_page_to_disk_schema_and_view(self):
        data = {
            "x": [1, 2, 3, 4],
            "y": ["a", "b", "c", "d"],
            "z": [True, False, True, False],
        }

        mem = Table(data)
        disk = Table(data, page_to_disk=True)
        assert disk.schema() == mem.schema()
        assert disk.view().to_columns() == mem.view().to_columns()

    def test_page_to_disk_csv(self):
        data = "x,y,z\n1,a,true\n2,b,false\n3,c,true\n4,d,false"
        tbl = Table(data, page_to_disk=True)
        assert tbl.schema() == {"x": "integer", "y": "string", "z": "boolean"}
        assert tbl.view().to_columns() == {
            "x": [1, 2, 3, 4],
            "y": ["a", "b", "c", "d"],
            "z": [True, False, True, False],
        }

    def test_page_to_disk_update_indexed(self):
        mem = Table({"x": [1, 2, 3], "y": [1.0, 2.0, 3.0]}, index="x")
        disk = Table(
            {"x": [1, 2, 3], "y": [1.0, 2.0, 3.0]}, index="x", page_to_disk=True
        )
        update = {"x": [2, 4], "y": [20.0, 40.0]}
        mem.update(update)
        disk.update(update)
        assert disk.view().to_columns() == mem.view().to_columns()
        assert disk.size() == mem.size()

    def test_page_to_disk_group_by_aggregation(self):
        data = {"g": ["a", "b", "a", "b", "a"], "v": [1, 2, 3, 4, 5]}
        mem = Table(data)
        disk = Table(data, page_to_disk=True)
        config = {"group_by": ["g"], "columns": ["v"], "aggregates": {"v": "sum"}}
        assert disk.view(**config).to_columns() == mem.view(**config).to_columns()

    def test_page_to_disk_arrow_roundtrip(self):
        data = {"x": list(range(100)), "y": [float(i) / 2 for i in range(100)]}
        mem = Table(data)
        disk = Table(data, page_to_disk=True)
        assert disk.view().to_arrow() == mem.view().to_arrow()

    def test_page_to_disk_creates_backing_files(self):
        before = _perspective_temp_dirs()
        tbl = Table({"x": [1, 2, 3], "y": ["a", "b", "c"]}, page_to_disk=True)

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

    def test_page_to_disk_growth_forces_resize(self):
        tbl = Table({"x": [0], "y": [0.0]}, index="x", page_to_disk=True)
        n = 50000
        tbl.update({"x": list(range(n)), "y": [float(i) for i in range(n)]})
        assert tbl.size() == n
        cols = tbl.view().to_columns()
        assert cols["x"][0] == 0
        assert cols["x"][-1] == n - 1
        assert cols["y"][-1] == float(n - 1)

    def test_page_to_disk_clone_keeps_master_files(self):
        # Cloning a disk-backed column (e.g. the masked clone that serializing a
        # table with removed rows performs) must give the clone its OWN backing
        # file. Otherwise the clone aliases — and on teardown `rmfile`s — the
        # master's file, silently unlinking the master's named backing store.
        before = _perspective_temp_dirs()
        tbl = Table(
            {"x": [1, 2, 3, 4], "y": [10.0, 20.0, 30.0, 40.0]},
            index="x",
            page_to_disk=True,
        )
        view = tbl.view()
        new_dirs = _perspective_temp_dirs() - before
        master_dirs = [
            d
            for d in new_dirs
            if not os.path.basename(d).startswith("perspective_expr_")
        ]
        assert len(master_dirs) == 1
        master_dir = master_dirs[0]
        master_files = set(os.listdir(master_dir))
        assert master_files, "expected master backing files on disk"

        # Removing rows triggers a masked clone of the disk master columns.
        tbl.remove([2, 3])
        assert view.to_columns()["x"] == [1, 4]
        # The master's own backing files must survive the clone's teardown.
        survived = set(os.listdir(master_dir))
        assert master_files <= survived, (
            "clone teardown unlinked master backing files: {}".format(
                master_files - survived
            )
        )

        # And the master must remain usable for subsequent updates.
        tbl.update({"x": [5, 6], "y": [50.0, 60.0]})
        assert sorted(view.to_columns()["x"]) == [1, 4, 5, 6]

    def test_page_to_disk_larger_dataset_matches_memory(self):
        n = 20000
        data = {
            "i": list(range(n)),
            "f": [float(i) * 1.5 for i in range(n)],
            "s": ["row_{}".format(i % 97) for i in range(n)],
        }

        mem = Table(data)
        disk = Table(data, page_to_disk=True)
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
        disk = Table(data, page_to_disk=True)
        exprs = {"sum": '"x" + "y"', "prod": '"x" * "y"'}
        assert (
            disk.view(expressions=exprs).to_columns()
            == mem.view(expressions=exprs).to_columns()
        )

    def test_expression_string_equivalence(self):
        data = {"a": ["foo", "bar", "baz"], "b": ["AA", "BB", "CC"]}
        mem = Table(data)
        disk = Table(data, page_to_disk=True)
        exprs = {"up": 'upper("a")', "lo": 'lower("b")'}
        assert (
            disk.view(expressions=exprs).to_columns()
            == mem.view(expressions=exprs).to_columns()
        )

    def test_expression_with_group_by_equivalence(self):
        data = {"g": ["a", "b", "a", "b"], "v": [1, 2, 3, 4]}
        mem = Table(data)
        disk = Table(data, page_to_disk=True)
        config = {
            "expressions": {"v2": '"v" * 2'},
            "group_by": ["g"],
            "columns": ["v2"],
            "aggregates": {"v2": "sum"},
        }

        assert disk.view(**config).to_columns() == mem.view(**config).to_columns()

    def test_expression_master_is_page_to_disk(self):
        before = _perspective_expr_dirs()
        tbl = Table({"x": [1, 2, 3], "y": [10.0, 20.0, 30.0]}, page_to_disk=True)
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

    def test_expression_page_to_disk_update_and_larger(self):
        n = 10000
        tbl = Table({"x": [0], "y": [0.0]}, index="x", page_to_disk=True)
        tbl.update({"x": list(range(n)), "y": [float(i) for i in range(n)]})
        cols = tbl.view(expressions={"e": '"x" + "y"'}).to_columns()
        assert cols["e"][0] == 0.0
        assert cols["e"][-1] == float((n - 1) + (n - 1))


class TestResidency:
    # The residency manager evicts disk-backed column buffers to their files
    # when over the `PSP_MEMORY_BUDGET` and restores them transparently on
    # access. Under a tiny budget, eviction fires aggressively and data must
    # still round-trip identically to an in-memory table.

    @mark.skip(reason="No secret hooks in the engine")
    def test_residency_evicts_and_data_is_correct(self):
        stats_fd, stats_path = tempfile.mkstemp(prefix="psp_residency_")
        os.close(stats_fd)
        os.environ["PSP_MEMORY_BUDGET"] = "1024"
        os.environ["PSP_RESIDENCY_STATS_FILE"] = stats_path
        try:
            n = 5000
            data = {
                "x": list(range(n)),
                "y": [float(i) * 1.5 for i in range(n)],
                "s": ["row_{}".format(i % 50) for i in range(n)],
            }
            mem = Table(data)
            disk = Table(data, page_to_disk=True)

            # Each request is a safepoint that trims to budget; data read back
            # must be correct (round-tripped through evict -> restore).
            assert disk.view().to_columns() == mem.view().to_columns()
            assert disk.view().to_arrow() == mem.view().to_arrow()

            upd = {
                "x": list(range(n, n + 200)),
                "y": [float(i) for i in range(n, n + 200)],
                "s": ["upd_{}".format(i) for i in range(200)],
            }
            mem.update(upd)
            disk.update(upd)
            assert disk.view().to_columns() == mem.view().to_columns()

            # An expression view on an evicted disk table must still compute.
            exprs = {"e": '"x" + "y"'}
            assert (
                disk.view(expressions=exprs).to_columns()
                == mem.view(expressions=exprs).to_columns()
            )

            # Confirm eviction actually occurred (otherwise the test is vacuous).
            with open(stats_path) as f:
                stats = f.read()
            evictions = int(stats.split("evictions=")[1].split()[0])
            assert evictions > 0, "expected evictions under a tiny budget: " + stats
        finally:
            os.environ.pop("PSP_MEMORY_BUDGET", None)
            os.environ.pop("PSP_RESIDENCY_STATS_FILE", None)
            os.remove(stats_path)
            # Drain a safepoint with residency disabled so any evicted stores
            # from other live tables are restored before subsequent tests.
            Table({"_": [0]}).view().to_columns()
