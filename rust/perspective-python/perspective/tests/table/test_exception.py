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
from perspective import Table, PerspectiveError, PerspectiveCppError


class TestException(object):
    def test_exception_from_core(self):
        tbl = Table({"a": [1, 2, 3]})

        with raises(PerspectiveCppError) as ex:
            # creating view with unknown column should throw
            tbl.view(group_by=["b"])

        assert str(ex.value) == "Invalid column 'b' found in View group_by.\n"

    def test_exception_from_core_catch_generic(self):
        tbl = Table({"a": [1, 2, 3]})
        # `PerspectiveCppError` should inherit from `Exception`
        with raises(Exception) as ex:
            tbl.view(group_by=["b"])

        assert str(ex.value) == "Invalid column 'b' found in View group_by.\n"

    def test_exception_from_core_correct_types(self):
        tbl = Table({"a": [1, 2, 3]})

        # `PerspectiveError` should be raised from the Python layer
        with raises(PerspectiveError) as ex:
            tbl.view()
            tbl.delete()

        assert (
            str(ex.value)
            == "Cannot delete a Table with active views still linked to it - call delete() on each view, and try again."
        )

        with raises(PerspectiveCppError) as ex:
            tbl.view(group_by=["b"])

        assert str(ex.value) == "Invalid column 'b' found in View group_by.\n"
