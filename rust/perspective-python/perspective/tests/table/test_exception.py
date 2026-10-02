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

from pytest import raises
from perspective import PerspectiveError

import perspective as psp

client = psp.Server().new_local_client()
Table = client.table


class TestException(object):
    def test_instantiation_exception_table(self):
        from perspective import Table
        with raises(TypeError) as ex:
            Table()
        assert "Do not call Table's constructor directly" in str(ex.value)

    def test_instantiation_exception_view(self):
        from perspective import View
        with raises(TypeError) as ex:
            View()
        assert "Do not call View's constructor directly" in str(ex.value)

    def test_exception_from_core(self):
        tbl = Table({"a": [1, 2, 3]})

        with raises(PerspectiveError) as ex:
            # creating view with unknown column should throw
            tbl.view(group_by=["b"])

        assert str(ex.value) == "Abort(): Invalid column 'b' found in View group_by.\n"

    def test_exception_duplicate_group_by(self):
        tbl = Table({"a": [1, 2, 3]})

        with raises(PerspectiveError) as ex:
            tbl.view(group_by=["a", "a"])

        assert str(ex.value) == "Abort(): Duplicate column 'a' found in View group_by.\n"

    def test_exception_from_core_catch_generic(self):
        tbl = Table({"a": [1, 2, 3]})
        # `PerspectiveCppError` should inherit from `Exception`
        with raises(Exception) as ex:
            tbl.view(group_by=["b"])

        assert str(ex.value) == "Abort(): Invalid column 'b' found in View group_by.\n"

    def test_exception_from_core_correct_types(self):
        tbl = Table({"a": [1, 2, 3]})

        # `PerspectiveError` should be raised from the Python layer
        with raises(PerspectiveError) as ex:
            tbl.view()
            tbl.delete()

        assert str(ex.value) == "Abort(): Cannot delete table with views"

        with raises(PerspectiveError) as ex:
            tbl.view(group_by=["b"])

        assert str(ex.value) == "Abort(): Invalid column 'b' found in View group_by.\n"
