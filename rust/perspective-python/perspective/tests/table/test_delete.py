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

from perspective.table import Table


class TestDelete(object):
    # delete

    def test_table_delete(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        tbl.delete()
        # don't segfault

    def test_table_delete_callback(self, sentinel):
        s = sentinel(False)

        def callback():
            s.set(True)

        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        tbl.on_delete(callback)
        tbl.delete()
        assert s.get() is True

    def test_table_delete_with_view(self, sentinel):
        s = sentinel(False)

        def callback():
            s.set(True)

        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        tbl.on_delete(callback)
        view = tbl.view()
        view.delete()
        tbl.delete()
        assert s.get() is True

    def test_table_delete_multiple_callback(self, sentinel):
        s1 = sentinel(False)
        s2 = sentinel(False)

        def callback1():
            s1.set(True)

        def callback2():
            s2.set(True)

        tbl = Table([{"a": 1}])
        tbl.on_delete(callback1)
        tbl.on_delete(callback2)

        tbl.delete()

        assert s1.get() is True
        assert s2.get() is True

    def test_table_remove_delete_callback(self, sentinel):
        s = sentinel(False)

        def callback():
            s.set(True)

        tbl = Table([{"a": 1}])
        tbl.on_delete(callback)
        tbl.remove_delete(callback)

        tbl.delete()

        assert s.get() is False

    def test_view_delete_multiple_callback(self, sentinel):
        s1 = sentinel(False)
        s2 = sentinel(False)

        def callback1():
            s1.set(True)

        def callback2():
            s2.set(True)

        tbl = Table([{"a": 1}])
        view = tbl.view()

        view.on_delete(callback1)
        view.on_delete(callback2)

        view.delete()
        tbl.delete()

        assert s1.get() is True
        assert s2.get() is True

    def test_view_remove_delete_callback(self, sentinel):
        s = sentinel(False)

        def callback():
            s.set(True)

        tbl = Table([{"a": 1}])
        view = tbl.view()

        view.on_delete(callback)
        view.remove_delete(callback)

        view.delete()
        tbl.delete()

        assert s.get() is False
