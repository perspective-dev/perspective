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

from datetime import date, datetime
from functools import partial
from types import MethodType

import numpy as np
from perspective import PerspectiveError, PerspectiveWidget, Table
from pytest import raises


def mock_post(self, msg, msg_id=None, assert_msg=None):
    """Mock the widget's `post()` method so we can introspect the contents."""
    assert msg == assert_msg


class TestWidget:
    def test_widget(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data, plugin="X Bar")
        assert widget.plugin == "X Bar"
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {}},
        }

    def test_widget_indexed(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data, plugin="X Bar", index="a")
        assert widget.plugin == "X Bar"
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {"index": "a"}},
        }

    def test_widget_no_data(self):
        widget = PerspectiveWidget(None, plugin="X Bar", group_by=["a"])
        assert widget.plugin == "X Bar"
        assert widget.group_by == ["a"]

    def test_widget_schema(self):
        schema = {"a": int, "b": float, "c": bool, "d": date, "e": datetime, "f": str}
        widget = PerspectiveWidget(schema)
        assert widget.table.schema() == schema

    def test_widget_schema_with_index(self):
        widget = PerspectiveWidget({"a": int}, index="a")
        assert widget.table.get_index() == "a"

    def test_widget_schema_with_limit(self):
        widget = PerspectiveWidget({"a": int}, limit=5)
        assert widget.table.get_limit() == 5

    def test_widget_no_data_with_index(self):
        # should fail
        with raises(PerspectiveError):
            PerspectiveWidget(None, index="a")

    def test_widget_no_data_with_limit(self):
        # should fail
        with raises(PerspectiveError):
            PerspectiveWidget(None, limit=5)

    def test_widget_eventual_data(self):
        table = Table({"a": np.arange(0, 50)})
        widget = PerspectiveWidget(None, plugin="X Bar")
        assert widget.plugin == "X Bar"

        with raises(PerspectiveError):
            widget._make_load_message()

        widget.load(table)

        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {}},
        }

    def test_widget_eventual_data_server(self):
        widget = PerspectiveWidget(None, plugin="X Bar", server=True)
        assert widget.plugin == "X Bar"
        widget.load({"a": np.arange(0, 50)}, index="a")
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {
                "table_name": widget.table_name,
            },
        }

    def test_widget_eventual_data_indexed(self):
        widget = PerspectiveWidget(None, plugin="X Bar")
        assert widget.plugin == "X Bar"
        widget.load({"a": np.arange(0, 50)}, index="a")
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {"index": "a"}},
        }

    def test_widget_eventual_table_indexed(self):
        table = Table({"a": np.arange(0, 50)}, index="a")
        widget = PerspectiveWidget(None, plugin="X Bar")
        assert widget.plugin == "X Bar"
        widget.load(table)
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {"index": "a"}},
        }

    def test_widget_load_table(self):
        table = Table({"a": np.arange(0, 50)})
        widget = PerspectiveWidget(table, plugin="X Bar")
        assert widget.plugin == "X Bar"
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {}},
        }

    def test_widget_load_table_indexed(self):
        table = Table({"a": np.arange(0, 50)}, index="a")
        widget = PerspectiveWidget(table, plugin="X Bar")
        assert widget.plugin == "X Bar"
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name, "options": {"index": "a"}},
        }

    def test_widget_load_table_ignore_limit(self):
        table = Table({"a": np.arange(0, 50)})
        widget = PerspectiveWidget(table, limit=1)
        assert widget.table.size() == 50

    def test_widget_pass_index(self):
        data = {"a": [1, 2, 3, 1]}
        widget = PerspectiveWidget(data, index="a")
        assert widget.table.size() == 3

    def test_widget_pass_limit(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data, limit=1)
        assert widget.table.size() == 1

    def test_widget_pass_options_invalid(self):
        data = {"a": np.arange(0, 50)}
        with raises(PerspectiveError):
            PerspectiveWidget(data, index="index", limit=1)

    # server mode
    def test_widget_load_table_server(self):
        table = Table({"a": np.arange(0, 50)})
        widget = PerspectiveWidget(table, server=True)
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name},
        }

    def test_widget_no_data_with_server(self):
        # should fail
        widget = PerspectiveWidget(None, server=True)
        with raises(PerspectiveError):
            widget._make_load_message()

    def test_widget_eventual_data_with_server(self):
        # should fail
        widget = PerspectiveWidget(None, server=True)

        with raises(PerspectiveError):
            widget._make_load_message()

        # then succeed
        widget.load(Table({"a": np.arange(0, 50)}))
        load_msg = widget._make_load_message()
        assert load_msg.to_dict() == {
            "id": -2,
            "type": "table",
            "data": {"table_name": widget.table_name},
        }

    # clear

    def test_widget_clear(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data)
        widget.clear()
        assert widget.table.size() == 0

    def test_widget_clear_server(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data, server=True)
        widget.clear()
        assert widget.table.size() == 0

    # replace

    def test_widget_replace(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data)
        widget.replace({"a": [1]})
        assert widget.table.size() == 1

    def test_widget_replace_server(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data, server=True)
        widget.replace({"a": [1]})
        assert widget.table.size() == 1

    # delete

    def test_widget_delete(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data)
        mocked_post = partial(mock_post, assert_msg={"cmd": "delete"})
        widget.post = MethodType(mocked_post, widget)
        widget.delete()
        assert widget.table is None

    def test_widget_delete_with_view(self):
        data = {"a": np.arange(0, 50)}
        widget = PerspectiveWidget(data)

        # create a view on the manager
        table_name, table = list(widget.manager._tables.items())[0]
        make_view_message = {
            "id": 1,
            "table_name": table_name,
            "view_name": "view1",
            "cmd": "view",
            "config": {"group_by": ["a"]},
        }
        widget.manager._process(make_view_message, lambda x: True)

        assert len(widget.manager._views) == 1

        mocked_post = partial(mock_post, assert_msg={"cmd": "delete"})

        widget.post = MethodType(mocked_post, widget)
        widget.delete()

        assert widget.table is None
