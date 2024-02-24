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
import pytest
import sys
import numpy as np
import pandas as pd

from datetime import date, datetime
from functools import partial
from types import MethodType


if os.name == "nt":
    BINDING = "libpsppy.pyd"
    PSP = "libpsp.dll"
else:
    BINDING = "libpsppy.so"
    PSP = "libpsp.so"

# rename libpsppy.so and libpsp.so temporarily to ensure that client mode
# works automatically when the C++ build fails.
lib_path = os.path.join(os.path.dirname(__file__), "..", "..", "table")
binding = os.path.join(lib_path, BINDING)
psp = os.path.join(lib_path, PSP)
new_binding = os.path.join(lib_path, "notlibpsppy.so")
new_psp = os.path.join(lib_path, "notlibpsp.so")


def mock_post(self, msg, msg_id=None, assert_msg=None):
    """Mock the widget's `post()` method so we can introspect the contents."""
    assert msg == assert_msg


def unload():
    to_pop = []
    for mod in sys.modules:
        if mod.startswith("perspective"):
            to_pop.append(mod)
    for mod in to_pop:
        sys.modules.pop(mod)


@pytest.fixture(scope="class")
def rename_libraries():
    print("SETTING UP")
    # unload perspective from sys modules
    unload()

    # rename the binding so it doesnt import
    os.rename(binding, new_binding)
    os.rename(psp, new_psp)
    assert os.path.exists(new_binding)
    assert os.path.exists(new_psp)
    assert not os.path.exists(binding)
    assert not os.path.exists(psp)

    # import
    import perspective

    # defer to test
    yield

    # rename back
    os.rename(new_binding, binding)
    os.rename(new_psp, psp)
    assert os.path.exists(binding)
    assert os.path.exists(psp)
    assert not os.path.exists(new_binding)
    assert not os.path.exists(new_psp)

    # unload from sys.modules
    unload()

    # import again
    import perspective


@pytest.mark.skip
class TestClient(object):
    def test_widget_client(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": [i for i in range(50)]}
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == data

    def test_widget_client_np(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": np.arange(0, 50)}
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {"a": [i for i in range(50)]}

    def test_widget_client_df(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = pd.DataFrame(
            {
                "a": np.arange(10),
                "b": [True for i in range(10)],
                "c": [str(i) for i in range(10)],
            }
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "index": [i for i in range(10)],
            "a": [i for i in range(10)],
            "b": [True for i in range(10)],
            "c": [str(i) for i in range(10)],
        }

    def test_widget_client_date(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": [date(2020, i, 1) for i in range(1, 13)]}
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False

        # `data` is mutated at this point, so check against the expected
        # formatting just to make sure.
        assert widget._data == {"a": ["2020-{:02d}-01".format(i) for i in range(1, 13)]}

    def test_widget_client_np_date(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {
            "a": np.array(
                [date(2020, i, 1) for i in range(1, 13)], dtype="datetime64[D]"
            )
        }
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {"a": ["2020-{:02d}-01".format(i) for i in range(1, 13)]}

    def test_widget_client_np_date_object(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": np.array([date(2020, i, 1) for i in range(1, 13)], dtype="object")}
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {"a": ["2020-{:02d}-01".format(i) for i in range(1, 13)]}

    def test_widget_client_df_date(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = pd.DataFrame(
            {"a": [date(2020, i, 1) for i in range(1, 13)]}, dtype="datetime64[ns]"
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "index": [i for i in range(12)],
            "a": ["2020-{:02d}-01 00:00:00".format(i) for i in range(1, 13)],
        }

    def test_widget_client_df_date_object(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = pd.DataFrame(
            {"a": [date(2020, i, 1) for i in range(1, 13)]}, dtype="object"
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "index": [i for i in range(12)],
            "a": ["2020-{:02d}-01".format(i) for i in range(1, 13)],
        }

    def test_widget_client_datetime(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": [datetime(2020, i, 1, 12, 30, 45) for i in range(1, 13)]}
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-{:02d}-01 12:30:45".format(i) for i in range(1, 13)]
        }

    def test_widget_client_np_datetime(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {
            "a": np.array(
                [datetime(2020, i, 1, 12, 30, 45) for i in range(1, 13)],
                dtype="datetime64",
            )
        }
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-{:02d}-01 12:30:45".format(i) for i in range(1, 13)]
        }

    def test_widget_client_np_datetime_object(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {
            "a": np.array(
                [datetime(2020, i, 1, 12, 30, 45) for i in range(1, 13)], dtype="object"
            )
        }
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-{:02d}-01 12:30:45".format(i) for i in range(1, 13)]
        }

    def test_widget_client_df_datetime(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = pd.DataFrame(
            {"a": [datetime(2020, i, 1, 12, 30, 45) for i in range(1, 13)]},
            dtype="datetime64[ns]",
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "index": [i for i in range(12)],
            "a": ["2020-{:02d}-01 12:30:45".format(i) for i in range(1, 13)],
        }

    def test_widget_client_df_datetime_object(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = pd.DataFrame(
            {"a": [datetime(2020, i, 1, 12, 30, 45) for i in range(1, 13)]},
            dtype="object",
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "index": [i for i in range(12)],
            "a": ["2020-{:02d}-01 12:30:45".format(i) for i in range(1, 13)],
        }

    def test_widget_client_np_structured_array(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = np.array([(1, 2), (3, 4)], dtype=[("a", "int64"), ("b", "int64")])
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {"a": [1, 3], "b": [2, 4]}

    def test_widget_client_np_recarray(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = np.array([(1, 2), (3, 4)], dtype=[("a", "int64"), ("b", "int64")]).view(
            np.recarray
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {"a": [1, 3], "b": [2, 4]}

    def test_widget_client_np_structured_array_date(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = np.array(
            [
                (date(2020, 1, 1), date(2020, 2, 1)),
                (date(2020, 3, 1), date(2020, 4, 1)),
            ],
            dtype=[("a", "datetime64[D]"), ("b", "datetime64[D]")],
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-01-01", "2020-03-01"],
            "b": ["2020-02-01", "2020-04-01"],
        }

    def test_widget_client_np_recarray_date(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = np.array(
            [
                (date(2020, 1, 1), date(2020, 2, 1)),
                (date(2020, 3, 1), date(2020, 4, 1)),
            ],
            dtype=[("a", "datetime64[D]"), ("b", "datetime64[D]")],
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-01-01", "2020-03-01"],
            "b": ["2020-02-01", "2020-04-01"],
        }

    def test_widget_client_np_structured_array_date_object(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = np.array(
            [
                (date(2020, 1, 1), date(2020, 2, 1)),
                (date(2020, 3, 1), date(2020, 4, 1)),
            ],
            dtype=[("a", "object"), ("b", "object")],
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-01-01", "2020-03-01"],
            "b": ["2020-02-01", "2020-04-01"],
        }

    def test_widget_client_np_recarray_date_object(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = np.array(
            [
                (date(2020, 1, 1), date(2020, 2, 1)),
                (date(2020, 3, 1), date(2020, 4, 1)),
            ],
            dtype=[("a", "object"), ("b", "object")],
        )
        widget = perspective.PerspectiveWidget(data)
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": ["2020-01-01", "2020-03-01"],
            "b": ["2020-02-01", "2020-04-01"],
        }

    def test_widget_client_schema(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        widget = perspective.PerspectiveWidget(
            {"a": int, "b": float, "c": bool, "d": date, "e": datetime, "f": str}
        )
        assert hasattr(widget, "table") is False
        assert widget._data == {
            "a": "integer",
            "b": "float",
            "c": "boolean",
            "d": "date",
            "e": "datetime",
            "f": "string",
        }

    def test_widget_client_update(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": np.arange(0, 50)}
        comparison_data = {"a": [i for i in range(50)]}
        widget = perspective.PerspectiveWidget(data)
        mocked_post = partial(
            mock_post, assert_msg={"cmd": "update", "data": comparison_data}
        )
        widget.post = MethodType(mocked_post, widget)
        widget.update(data)
        assert hasattr(widget, "table") is False

    def test_widget_client_replace(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": np.arange(0, 50)}
        new_data = {"a": [1]}
        widget = perspective.PerspectiveWidget(data)
        mocked_post = partial(
            mock_post, assert_msg={"cmd": "replace", "data": new_data}
        )
        widget.post = MethodType(mocked_post, widget)
        widget.replace(new_data)
        assert widget._data is new_data

    def test_widget_delete_client(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        data = {"a": np.arange(0, 50)}
        widget = perspective.PerspectiveWidget(data)
        mocked_post = partial(mock_post, assert_msg={"cmd": "delete"})
        widget.delete()
        widget.post = MethodType(mocked_post, widget)

    def test_widget_load_split_by_client(self, rename_libraries):
        import perspective

        assert perspective.is_libpsp() is False
        # behavior should not change for client mode
        arrays = [
            np.array(
                [
                    "bar",
                    "bar",
                    "bar",
                    "bar",
                    "baz",
                    "baz",
                    "baz",
                    "baz",
                    "foo",
                    "foo",
                    "foo",
                    "foo",
                    "qux",
                    "qux",
                    "qux",
                    "qux",
                ]
            ),
            np.array(
                [
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                    "one",
                    "one",
                    "two",
                    "two",
                ]
            ),
            np.array(
                [
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                    "X",
                    "Y",
                ]
            ),
        ]
        tuples = list(zip(*arrays))
        index = pd.MultiIndex.from_tuples(tuples, names=["first", "second", "third"])
        df_both = pd.DataFrame(
            np.random.randn(3, 16), index=["A", "B", "C"], columns=index
        )
        widget = perspective.PerspectiveWidget(df_both)
        assert hasattr(widget, "table") is False
        assert widget.columns == ["value"]
        assert widget.split_by == ["first", "second", "third"]
        assert widget.group_by == ["index"]
