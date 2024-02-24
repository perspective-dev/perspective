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

import json
import time
import numpy as np
import pyarrow as pa
from datetime import datetime
from functools import partial
from pytest import raises
from perspective import Table, PerspectiveError, PerspectiveManager

data = {"a": [1, 2, 3], "b": ["a", "b", "c"]}


class TestPerspectiveManager(object):
    def post(self, msg):
        """boilerplate callback to simulate a client's `post()` method."""
        msg = json.loads(msg)
        assert msg["id"] is not None

    def validate_post(self, msg, expected=None):
        msg = json.loads(msg)
        if expected:
            assert msg == expected

    def test_manager_host_table(self):
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "schema",
            "args": [],
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._tables["table1"].schema() == {"a": int, "b": str}

    def test_manager_host_invalid(self):
        manager = PerspectiveManager()
        with raises(PerspectiveError):
            manager.host({})

    def test_manager_host(self):
        manager = PerspectiveManager()
        table = Table(data)
        manager.host(table)
        table.update({"a": [4, 5, 6], "b": ["d", "e", "f"]})
        names = manager.get_table_names()
        assert manager.get_table(names[0]).size() == 6

    def test_manager_host_table_transitive(self):
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        table.update({"a": [4, 5, 6], "b": ["d", "e", "f"]})
        assert manager.get_table("table1").size() == 6

    def test_manager_get_hosted_table_names(self):
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        assert manager.get_table_names() == ["table1"]

        manager.host_table("table2", table)
        assert manager.get_table_names() == ["table1", "table2"]

    def test_manager_get_hosted_table_names_with_cmd(self):
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        message = {"id": 1, "cmd": "get_hosted_table_names"}
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "data": ["table1"]},
        )
        manager._process(message, post_callback)

    def test_manager_create_table(self):
        message = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(message, self.post)
        assert manager._tables["table1"].schema() == {"a": int, "b": str}

    def test_locked_manager_create_table(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "error": "`table` failed - access denied"},
        )
        message = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager(lock=True)
        manager._process(message, post_callback)

    def test_manager_create_indexed_table(self):
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table",
            "args": [data],
            "options": {"index": "a"},
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._tables["table1"].schema() == {"a": int, "b": str}

        assert manager._tables["table1"].get_index() == "a"

    def test_manager_create_indexed_table_and_update(self):
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table",
            "args": [data],
            "options": {"index": "a"},
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._tables["table1"].schema() == {"a": int, "b": str}
        assert manager._tables["table1"].get_index() == "a"
        update_message = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [1, 2, 3], "b": ["str1", "str2", "str3"]}],
        }
        manager._process(update_message, self.post)
        assert manager._tables["table1"].view().to_dict() == {
            "a": [1, 2, 3],
            "b": ["str1", "str2", "str3"],
        }

    def test_manager_create_indexed_table_and_remove(self):
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table",
            "args": [data],
            "options": {"index": "a"},
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._tables["table1"].schema() == {"a": int, "b": str}
        assert manager._tables["table1"].get_index() == "a"
        remove_message = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "remove",
            "args": [[1, 2]],
        }
        manager._process(remove_message, self.post)
        assert manager._tables["table1"].view().to_dict() == {"a": [3], "b": ["c"]}

    def test_locked_manager_create_view(self):
        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager(lock=True)
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._get_view("view1").schema() == {"a": int, "b": str}

    def test_manager_create_view_zero(self):
        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._views["view1"].num_rows() == 3

    def test_manager_create_view_one(self):
        message = {
            "id": 1,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
            "config": {"group_by": ["a"]},
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._views["view1"].to_dict() == {
            "__ROW_PATH__": [[], [1], [2], [3]],
            "a": [6, 1, 2, 3],
            "b": [3, 1, 1, 1],
        }

    def test_manager_create_view_two(self):
        message = {
            "id": 1,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
            "config": {"group_by": ["a"], "split_by": ["b"]},
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        assert manager._views["view1"].to_dict() == {
            "__ROW_PATH__": [[], [1], [2], [3]],
            "a|a": [1, 1, None, None],
            "a|b": [1, 1, None, None],
            "b|a": [2, None, 2, None],
            "b|b": [1, None, 1, None],
            "c|a": [3, None, None, 3],
            "c|b": [1, None, None, 1],
        }

    # clear views

    def test_manager_clear_view(self):
        messages = [
            {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"},
            {"id": 2, "table_name": "table1", "view_name": "view2", "cmd": "view"},
            {"id": 3, "table_name": "table1", "view_name": "view3", "cmd": "view"},
        ]
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        for message in messages:
            manager._process(message, self.post, client_id=1)
        manager.clear_views(1)
        assert manager._views == {}

    def test_manager_clear_view_nonseq(self):
        messages = [
            {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"},
            {"id": 2, "table_name": "table1", "view_name": "view2", "cmd": "view"},
            {"id": 3, "table_name": "table1", "view_name": "view3", "cmd": "view"},
        ]
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        for i, message in enumerate(messages, 1):
            manager._process(message, self.post, client_id=i)
        manager.clear_views(1)
        manager.clear_views(3)
        assert "view1" not in manager._views
        assert "view3" not in manager._views
        assert "view2" in manager._views

    def test_manager_clear_view_no_client_id(self):
        messages = [
            {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"},
            {"id": 2, "table_name": "table1", "view_name": "view2", "cmd": "view"},
            {"id": 3, "table_name": "table1", "view_name": "view3", "cmd": "view"},
        ]
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        for message in messages:
            manager._process(message, self.post)
        with raises(PerspectiveError):
            manager.clear_views(None)

    # locked manager
    def test_locked_manager_update_table(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "error": "`table_method.update` failed - access denied"},
        )
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [data],
        }
        manager = PerspectiveManager(lock=True)
        manager._process(message, post_callback)

    def test_locked_manager_clear_table(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "error": "`table_method.clear` failed - access denied"},
        )
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "clear",
            "args": [],
        }
        manager = PerspectiveManager(lock=True)
        manager._process(message, post_callback)

    def test_locked_manager_replace_table(self):
        post_callback = partial(
            self.validate_post,
            expected={
                "id": 1,
                "error": "`table_method.replace` failed - access denied",
            },
        )
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "replace",
            "args": [data],
        }
        manager = PerspectiveManager(lock=True)
        manager._process(message, post_callback)

    def test_locked_manager_remove_table(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "error": "`table_method.remove` failed - access denied"},
        )
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "remove",
            "args": [],
        }
        manager = PerspectiveManager(lock=True)
        manager._process(message, post_callback)

    def test_locked_manager_delete_table(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "error": "`table_method.delete` failed - access denied"},
        )
        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "delete",
            "args": [],
        }
        manager = PerspectiveManager(lock=True)
        manager._process(message, post_callback)

    def test_arbitary_lock_unlock_manager(self):
        manager = PerspectiveManager(lock=True)
        make_table_message = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager._process(
            make_table_message,
            partial(
                self.validate_post,
                expected={"id": 1, "error": "`table` failed - access denied"},
            ),
        )
        manager.unlock()
        manager._process(make_table_message, self.post)
        assert manager._tables["table1"].schema() == {"a": int, "b": str}
        update_message = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [data],
        }
        manager._process(update_message, self.post)
        assert manager._tables["table1"].size() == 6
        manager.lock()
        update_message_new = {
            "id": 3,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [data],
        }
        manager._process(
            update_message_new,
            partial(
                self.validate_post,
                expected={
                    "id": 3,
                    "error": "`table_method.update` failed - access denied",
                },
            ),
        )

    # schema

    def test_manager_table_schema(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "data": {"a": "integer", "b": "string"}},
        )

        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "schema",
            "args": [False],
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, post_callback)

    def test_manager_view_schema(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 2, "data": {"a": "integer", "b": "integer"}},
        )

        make_view_message = {
            "id": 1,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
            "config": {"group_by": ["a"]},
        }
        message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "schema",
            "args": [False],
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(make_view_message, self.post)
        manager._process(message, post_callback)

    def test_manager_table_validate_expressions(self):
        post_callback = partial(
            self.validate_post,
            expected={
                "id": 1,
                "data": {
                    "expression_schema": {'"a" + "a"': "float"},
                    "errors": {},
                    "expression_alias": {'"a" + "a"': '"a" + "a"'},
                },
            },
        )

        message = {
            "id": 1,
            "name": "table1",
            "cmd": "table_method",
            "method": "validate_expressions",
            "args": [['"a" + "a"']],
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, post_callback)

    def test_manager_view_expression_schema(self):
        post_callback = partial(
            self.validate_post, expected={"id": 2, "data": {"abc": "float"}}
        )

        make_view_message = {
            "id": 1,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
            "config": {"expressions": {"abc": '"a" + "a"'}},
        }
        message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "expression_schema",
            "args": [False],
        }
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(make_view_message, self.post)
        manager._process(message, post_callback)

    # serialization

    def test_manager_to_dict(self, sentinel):
        s = sentinel(False)

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message["data"] == data

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }
        manager._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_locked_manager_to_dict(self, sentinel):
        s = sentinel(False)

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message["data"] == data

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager(lock=True)
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }
        manager._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_manager_to_dict_with_options(self, sentinel):
        s = sentinel(False)

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message["data"] == {"a": [1], "b": ["a"]}

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
            "args": [{"start_row": 0, "end_row": 1}],
        }
        manager._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_manager_to_dict_with_nan(self, util, sentinel):
        data = util.make_arrow(
            ["a"], [[1.5, np.nan, 2.5, np.nan]], types=[pa.float64()]
        )
        s = sentinel(False)

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message == {"id": 2, "data": {"a": [1.5, None, 2.5, None]}}

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }
        manager._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_manager_to_dict_unix_timestamps(self, sentinel):
        """The conversion from `datetime` to a Unix timestamp should not
        alter the timestamp in any way if both are in local time."""
        s = sentinel(False)

        timestamp_data = {"a": [1580515140000]}

        schema = {"a": datetime}

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message["data"] == timestamp_data

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()

        table = Table(schema)
        table.update(timestamp_data)

        manager.host_table("table1", table)
        manager._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }
        manager._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_manager_to_dict_unix_timestamps_from_datetime(self, sentinel):
        """The conversion from `datetime` to a Unix timestamp should not
        alter the timestamp in any way if both are in local time."""
        s = sentinel(False)

        timestamp_data = {"a": [1580515140000]}

        schema = {"a": datetime}

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)

            assert message["data"] == timestamp_data

            # convert back
            ts = datetime.fromtimestamp(message["data"]["a"][0] / 1000)

            assert ts == datetime(2020, 1, 31, 23, 59)

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()

        table = Table(schema)
        table.update(timestamp_data)

        manager.host_table("table1", table)
        manager._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }
        manager._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_manager_create_view_and_update_table(self):
        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        manager = PerspectiveManager()
        table = Table(data)
        manager.host_table("table1", table)
        manager._process(message, self.post)
        table.update([{"a": 4, "b": "d"}])
        assert manager._views["view1"].num_rows() == 4

    def test_manager_on_update(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id):
            s.set(s.get() + 1)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        # hook into the created view and pass it the callback
        view = manager._views["view1"]
        view.on_update(update_callback)

        # call updates
        update1 = {
            "id": 3,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        update2 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        manager._process(update1, self.post)
        manager._process(update2, self.post)
        assert s.get() == 2

    def test_manager_on_update_rows(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": int, "b": str}
            table.delete()
            s.set(s.get() + 1)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        # hook into the created view and pass it the callback
        view = manager._views["view1"]
        view.on_update(update_callback, mode="row")

        # call updates
        update1 = {
            "id": 3,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        update2 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        manager._process(update1, self.post)
        manager._process(update2, self.post)
        assert s.get() == 2

    def test_manager_on_update_rows_with_port_id(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": int, "b": str}
            table.delete()
            s.set(s.get() + 1)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        # Get two ports on the table
        make_port = {
            "id": 3,
            "name": "table1",
            "cmd": "table_method",
            "method": "make_port",
        }
        make_port2 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "make_port",
        }

        manager._process(make_port, self.post)
        manager._process(make_port2, self.post)

        # hook into the created view and pass it the callback
        view = manager._views["view1"]
        view.on_update(update_callback, mode="row")

        # call updates
        update1 = {
            "id": 5,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}, {"port_id": 1}],
        }
        update2 = {
            "id": 6,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}, {"port_id": 2}],
        }

        manager._process(update1, self.post)
        manager._process(update2, self.post)

        assert s.get() == 2

    def test_manager_remove_update(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta):
            s.set(s.get() + 1)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        # hook into the created view and pass it the callback
        view = manager._views["view1"]
        view.on_update(update_callback)
        view.remove_update(update_callback)

        # call updates
        update1 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        update2 = {
            "id": 5,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        manager._process(update1, self.post)
        manager._process(update2, self.post)
        assert s.get() == 0

    def test_manager_on_update_through_wire_API(self, sentinel):
        s = sentinel(0)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        def callback(updated):
            assert updated["port_id"] == 0
            s.set(s.get() + 100)

        # simulate a client that holds callbacks by id
        callbacks = {3: callback}

        def post_update(msg):
            # when `on_update` is triggered, this callback gets the message
            # and has to decide which callback to trigger.
            message = json.loads(msg)
            assert message["id"] is not None
            if message["id"] == 3:
                # trigger callback
                assert message["data"] == {"port_id": 0}
                callbacks[message["id"]](message["data"])

        # hook into the created view and pass it the callback
        make_on_update = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "subscribe": True,
            "method": "on_update",
            "callback_id": "callback_1",
        }
        manager._process(make_on_update, post_update)

        # call updates
        update1 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        update2 = {
            "id": 5,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        manager._process(update1, self.post)
        manager._process(update2, self.post)
        assert s.get() == 200

    def test_manager_on_update_rows_through_wire_API(self, sentinel):
        s = sentinel(0)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        def callback(delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": int, "b": str}
            table.delete()
            s.set(s.get() + 100)

        # simulate a client that holds callbacks by id
        callbacks = {3: callback}

        def post_update(msg, binary=False):
            # when `on_update` is triggered, this callback gets the message
            # and has to decide which callback to trigger.
            if binary:
                # trigger callback - "msg" here is binary
                callbacks[3](msg)
                return

            message = json.loads(msg)
            assert message["id"] is not None
            if message["id"] == 3:
                # wait for transferable
                assert message["data"]["port_id"] == 0
                return

        # hook into the created view and pass it the callback
        make_on_update = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "subscribe": True,
            "method": "on_update",
            "callback_id": "callback_1",
            "args": [{"mode": "row"}],
        }
        manager._process(make_on_update, post_update)

        # call updates
        update1 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        update2 = {
            "id": 5,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        manager._process(update1, self.post)
        manager._process(update2, self.post)
        assert s.get() == 200

    def test_manager_on_update_rows_with_port_id_through_wire_API(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": int, "b": str}
            table.delete()
            s.set(s.get() + 1)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        # Get two ports on the table
        make_port = {
            "id": 3,
            "name": "table1",
            "cmd": "table_method",
            "method": "make_port",
        }
        make_port2 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "make_port",
        }

        manager._process(make_port, self.post)
        manager._process(make_port2, self.post)

        # define an update callback
        def callback(delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": int, "b": str}
            table.delete()
            s.set(s.get() + 100)

        # simulate a client that holds callbacks by id
        callbacks = {3: callback}

        def post_update(msg, binary=False):
            # when `on_update` is triggered, this callback gets the message
            # and has to decide which callback to trigger.
            if binary:
                # trigger callback - "msg" here is binary
                callbacks[3](msg)
                return

            message = json.loads(msg)

            assert message["id"] is not None

            if message["id"] == 3:
                # wait for transferable
                assert message["data"]["port_id"] in (1, 2)
                return

        # hook into the created view and pass it the callback
        make_on_update = {
            "id": 5,
            "name": "view1",
            "cmd": "view_method",
            "subscribe": True,
            "method": "on_update",
            "callback_id": "callback_1",
            "args": [{"mode": "row"}],
        }
        manager._process(make_on_update, post_update)

        # call updates
        update1 = {
            "id": 6,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}, {"port_id": 1}],
        }
        update2 = {
            "id": 7,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}, {"port_id": 2}],
        }

        manager._process(update1, self.post)
        manager._process(update2, self.post)

        assert s.get() == 200

    def test_manager_remove_update_through_wire_API(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta):
            s.set(s.get() + 1)

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        def callback(updated):
            assert updated["port_id"] == 0
            s.set(s.get() + 100)

        # simulate a client that holds callbacks by id
        callbacks = {3: callback}

        def post_update(msg):
            # when `on_update` is triggered, this callback gets the message
            # and has to decide which callback to trigger.
            message = json.loads(msg)
            assert message["id"] is not None
            if message["id"] == 3:
                # trigger callback
                assert message["data"] == {"port_id": 0}
                callbacks[message["id"]](message["data"])

        # create an on_update callback
        make_on_update = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "subscribe": True,
            "method": "on_update",
            "callback_id": "callback_1",
        }
        manager._process(make_on_update, post_update)

        # call updates
        update1 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        manager._process(update1, self.post)

        # remove update callback
        remove_on_update = {
            "id": 5,
            "name": "view1",
            "cmd": "view_method",
            "subscribe": True,
            "method": "remove_update",
            "callback_id": "callback_1",
        }
        manager._process(remove_on_update, self.post)

        update2 = {
            "id": 6,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        manager._process(update2, self.post)
        assert s.get() == 100

    def test_manager_delete_table_should_fail(self):
        post_callback = partial(
            self.validate_post,
            expected={
                "id": 2,
                "error": "table.delete() cannot be called on a remote table, as the remote has full ownership.",
            },
        )
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        delete_table = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "delete",
            "args": [],
        }
        manager._process(delete_table, post_callback)
        assert len(manager._tables) == 1

    def test_manager_delete_view(self):
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)
        delete_view = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "method": "delete",
        }
        manager._process(delete_view, self.post)
        assert len(manager._views) == 0

    def test_manager_on_delete_view(self, sentinel):
        s = sentinel(False)

        def delete_callback():
            s.set(True)

        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        view = manager._get_view("view1")
        view.on_delete(delete_callback)

        delete_view = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "method": "delete",
        }

        manager._process(delete_view, self.post)

        assert len(manager._views) == 0
        assert s.get() is True

    def test_manager_remove_delete_view(self, sentinel):
        s = sentinel(False)

        def delete_callback():
            s.set(True)

        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager = PerspectiveManager()
        manager._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        manager._process(make_view, self.post)

        view = manager._get_view("view1")
        view.on_delete(delete_callback)
        view.remove_delete(delete_callback)

        delete_view = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "method": "delete",
        }

        manager._process(delete_view, self.post)

        assert len(manager._views) == 0
        assert s.get() is False

    def test_manager_set_queue_process(self, sentinel):
        s = sentinel(0)
        manager = PerspectiveManager()
        table = Table({"a": [1, 2, 3]})
        manager.host_table("tbl", table)
        table.update({"a": [4, 5, 6]})
        assert table.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6]}

        def fake_queue_process(f, *args, **kwargs):
            s.set(s.get() + 1)
            f(*args, **kwargs)

        manager.set_loop_callback(fake_queue_process)
        table.update({"a": [7, 8, 9]})
        assert s.get() == 1

    def test_manager_set_queue_process_before_host_table(self, sentinel):
        s = sentinel(0)
        manager = PerspectiveManager()
        table = Table({"a": [1, 2, 3]})

        def fake_queue_process(f, *args, **kwargs):
            s.set(s.get() + 1)
            f(*args, **kwargs)

        manager.set_loop_callback(fake_queue_process)
        manager.host_table("tbl", table)
        table.update({"a": [4, 5, 6]})
        table.update({"a": [4, 5, 6]})

        assert s.get() == 2

    def test_manager_set_queue_process_multiple(self, sentinel):
        # manager2's queue process should not affect manager1,
        # provided they manage different tables
        s = sentinel(0)
        s2 = sentinel(0)
        manager = PerspectiveManager()
        manager2 = PerspectiveManager()
        table = Table({"a": [1, 2, 3]})
        table2 = Table({"a": [1, 2, 3]})
        manager.host_table("tbl", table)
        manager2.host_table("tbl2", table2)

        def fake_queue_process(f, *args, **kwargs):
            s2.set(s2.get() + 1)
            f(*args, **kwargs)

        manager2.set_loop_callback(fake_queue_process)

        table.update({"a": [4, 5, 6]})
        assert table.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6]}

        table2.update({"a": [7, 8, 9]})
        table.update({"a": [7, 8, 9]})

        assert table.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6, 7, 8, 9]}
        assert table2.view().to_dict() == {"a": [1, 2, 3, 7, 8, 9]}
        assert s.get() == 0
        assert s2.get() == 1
