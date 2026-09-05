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

import perspective as psp

client = psp.Server().new_local_client()
Table = client.table

data = [{"x": 1, "y": "a"}, {"x": 2, "y": "b"}, {"x": 3, "y": "c"}]


def removed_indices(indices):
    return Table(indices).view().to_records()


class TestOnRemove(object):
    def test_on_remove_fires_with_removed_index_values(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        calls = []
        cid = view.on_remove(lambda port_id, indices: calls.append((port_id, indices)))
        tbl.remove([2])
        assert len(calls) == 1
        assert calls[0][0] == 0
        assert removed_indices(calls[0][1]) == [{"x": 2}]
        view.remove_remove(cid)

    def test_on_remove_string_index(self):
        tbl = Table(data, index="y")
        view = tbl.view()
        calls = []
        cid = view.on_remove(lambda port_id, indices: calls.append(indices))
        tbl.remove(["b", "c"])
        assert len(calls) == 1
        assert removed_indices(calls[0]) == [{"y": "b"}, {"y": "c"}]
        view.remove_remove(cid)

    def test_on_remove_ignores_unknown_and_update(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        calls = []
        cid = view.on_remove(lambda port_id, indices: calls.append(indices))
        tbl.remove([9])
        tbl.update([{"x": 1, "y": "aa"}, {"x": 4, "y": "d"}])
        assert tbl.size() == 4
        assert calls == []
        tbl.remove([3])
        assert len(calls) == 1
        assert removed_indices(calls[0]) == [{"x": 3}]
        view.remove_remove(cid)

    def test_on_remove_replace_reports_keys_not_resupplied(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        calls = []
        cid = view.on_remove(lambda port_id, indices: calls.append(indices))
        tbl.replace([{"x": 2, "y": "bb"}, {"x": 4, "y": "d"}])
        assert len(calls) == 1
        assert removed_indices(calls[0]) == [{"x": 1}, {"x": 3}]
        assert view.to_records() == [{"x": 2, "y": "bb"}, {"x": 4, "y": "d"}]
        view.remove_remove(cid)

    def test_on_remove_clear_reports_every_key(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        calls = []
        updates = []
        cid = view.on_remove(lambda port_id, indices: calls.append(indices))
        view.on_update(lambda port_id: updates.append(port_id))
        tbl.clear()
        assert len(calls) == 1
        assert removed_indices(calls[0]) == [{"x": 1}, {"x": 2}, {"x": 3}]
        assert view.to_records() == []
        assert updates == [0]
        view.remove_remove(cid)

    def test_remove_remove_stops_delivery(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        first = []
        second = []
        cid = view.on_remove(lambda port_id, indices: first.append(indices))
        view.remove_remove(cid)
        cid2 = view.on_remove(lambda port_id, indices: second.append(indices))
        tbl.remove([1])
        assert first == []
        assert len(second) == 1
        view.remove_remove(cid2)

    def test_remove_accepts_arrow(self):
        tbl = Table(data, index="x")
        arrow = Table({"x": [2, 3]}).view().to_arrow()
        tbl.remove(arrow)
        assert tbl.view().to_records() == [{"x": 1, "y": "a"}]

    def test_table_from_view_inherits_index_and_replicates_removes(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        tbl2 = Table(view)
        assert tbl2.get_index() == "x"
        view2 = tbl2.view()

        tbl.update([{"x": 2, "y": "bb"}])
        assert tbl2.size() == 3
        assert view2.to_records() == view.to_records()

        tbl.remove([1])
        assert tbl2.size() == 2
        assert view2.to_records() == [{"x": 2, "y": "bb"}, {"x": 3, "y": "c"}]
        assert view2.to_records() == view.to_records()

    def test_table_from_view_mirrors_replace_and_clear(self):
        tbl = Table(data, index="x")
        view = tbl.view()
        tbl2 = Table(view)
        view2 = tbl2.view()

        tbl.replace([{"x": 2, "y": "bb"}, {"x": 4, "y": "d"}])
        assert view2.to_records() == [{"x": 2, "y": "bb"}, {"x": 4, "y": "d"}]

        tbl.clear()
        assert view2.to_records() == []

        tbl.update([{"x": 5, "y": "e"}])
        assert view2.to_records() == [{"x": 5, "y": "e"}]

    def test_table_from_pivoted_view_stays_unindexed(self):
        tbl = Table(data, index="x")
        view = tbl.view(group_by=["y"])
        tbl2 = Table(view)
        assert tbl2.get_index() is None
