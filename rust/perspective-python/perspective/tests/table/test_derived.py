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

from perspective import Server

import pytest


def _rows(n, offset=0):
    return [
        {
            "id": i,
            "g": ["a", "b", "c"][i % 3],
            "s": ["Mon", "Tue"][(i // 3) % 2],
            "x": i * 1.5,
            "y": i % 7,
        }
        for i in range(offset, offset + n)
    ]


def _unrolled(view, group_by):
    columns = view.to_columns()
    paths = columns.pop("__ROW_PATH__", [])
    names = list(columns.keys())
    out = []
    for i, path in enumerate(paths):
        row = {
            "{} (Group by {})".format(g, d + 1): (path[d] if d < len(path) else None)
            for d, g in enumerate(group_by)
        }

        row.update({n: columns[n][i] for n in names})
        out.append(row)

    return out


def _key(row):
    return sorted((k, str(v)) for k, v in row.items())


def _same(a, b):
    return sorted(map(_key, a)) == sorted(map(_key, b))


class TestDerivedTable(object):
    def _source(self):
        client = Server().new_local_client()
        table = client.table(
            {"id": "integer", "g": "string", "s": "string", "x": "float", "y": "integer"},
            index="id",
        )

        table.update(_rows(24))
        return client, table

    def test_group_by_parent_tracks_updates_and_removes(self):
        client, table = self._source()
        view = table.view(
            group_by=["g"], columns=["x", "y"], aggregates={"x": "sum", "y": "mean"}
        )

        derived = client.table(view)
        assert derived.schema() == {
            "g (Group by 1)": "string",
            "x": "float",
            "y": "float",
        }

        child = derived.view()
        assert _same(child.to_records(), _unrolled(view, ["g"]))
        for i in range(10):
            table.update([{"id": i, "x": i * 100.0}])

        assert derived.size() == 4
        table.remove([0, 3, 6, 9, 12, 15, 18, 21])
        assert derived.size() == 3
        assert _same(child.to_records(), _unrolled(view, ["g"]))

    def test_split_by_parent(self):
        client, table = self._source()
        view = table.view(
            group_by=["g"], split_by=["s"], columns=["x"], group_rollup_mode="flat"
        )

        derived = client.table(view)
        child = derived.view()
        table.update(_rows(12, 18))
        assert _same(child.to_records(), _unrolled(view, ["g"]))

    def test_flat_parent_follows_filter(self):
        client, table = self._source()
        view = table.view(filter=[["y", ">", 3]])
        derived = client.table(view)
        assert derived.get_index() == "id"
        child = derived.view()
        assert _same(child.to_records(), view.to_records())
        table.update([{"id": 0, "y": 6}, {"id": 4, "y": 0}])
        table.remove([5])
        assert _same(child.to_records(), view.to_records())

    def test_explicit_schema(self):
        client, table = self._source()
        view = table.view(
            group_by=["g"], split_by=["s"], columns=["x"], group_rollup_mode="flat"
        )

        derived = client.table(
            view, schema={"g (Group by 1)": "string", "Tue|x": "float", "Wed|x": "float"}
        )

        assert derived.columns() == ["g (Group by 1)", "Tue|x", "Wed|x"]
        child = derived.view()
        assert all(v is None for v in child.to_columns()["Wed|x"])
        table.update([{"id": 100, "g": "a", "s": "Wed", "x": 7.0, "y": 1}])
        assert child.to_columns()["Wed|x"].count(7.0) == 1

    def test_read_only(self):
        client, table = self._source()
        view = table.view(group_by=["g"], columns=["x"])
        derived = client.table(view)
        with pytest.raises(Exception):
            derived.update([{"x": 1.0}])

        with pytest.raises(Exception):
            derived.clear()

    def test_index_and_limit_rejected(self):
        client, table = self._source()
        view = table.view(group_by=["g"], columns=["x"])
        with pytest.raises(Exception):
            client.table(view, index="x")

        with pytest.raises(Exception):
            client.table(view, limit=10)
