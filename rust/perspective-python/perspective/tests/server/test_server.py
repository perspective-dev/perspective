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
import numpy as np
import pyarrow as pa
from functools import partial
from pytest import raises, mark
from perspective import Server, Client, PerspectiveError


client = Server().new_local_client()
Table = client.table


data = {"a": [1, 2, 3], "b": ["a", "b", "c"]}


class TestServer(object):
    def post(self, msg):
        """boilerplate callback to simulate a client's `post()` method."""
        msg = json.loads(msg)
        assert msg["id"] is not None

    def validate_post(self, msg, expected=None):
        msg = json.loads(msg)
        if expected:
            assert msg == expected

    def test_server_host_table(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table2 = client.open_table("table1")
        assert table2.schema() == {"a": "integer", "b": "string"}

    def test_session_close(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data)
        client.terminate()

    def test_server_host(self):
        server = Server()
        client = Client.from_server(server)
        table = client.table(data)
        table.update({"a": [4, 5, 6], "b": ["d", "e", "f"]})
        names = client.get_hosted_table_names()
        assert client.open_table(names[0]).size() == 6

    def test_server_host_table_transitive(self):
        server = Server()
        client = Client.from_server(server)
        table = client.table(data, name="table1")
        table.update({"a": [4, 5, 6], "b": ["d", "e", "f"]})
        assert client.open_table("table1").size() == 6

    def test_server_get_hosted_table_names(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        assert client.get_hosted_table_names() == ["table1"]

        client.table(data, name="table2")
        assert client.get_hosted_table_names() == ["table1", "table2"]

    def test_server_get_hosted_table_names_with_cmd(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        assert client.get_hosted_table_names() == ["table1"]

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_create_table(self):
        post_callback = partial(
            self.validate_post,
            expected={"id": 1, "error": "`table` failed - access denied"},
        )
        message = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        client = Server(lock=True)
        client._process(message, post_callback)

    def test_server_create_indexed_table(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1", index="a")
        table = client.open_table("table1")
        assert table.schema() == {"a": "integer", "b": "string"}
        assert table.get_index() == "a"

    def test_server_create_indexed_table_and_update(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1", index="a")
        table = client.open_table("table1")

        assert table.schema() == {"a": "integer", "b": "string"}
        assert table.get_index() == "a"

        table.update({"a": [1, 2, 3], "b": ["str1", "str2", "str3"]})
        assert table.view().to_columns() == {
            "a": [1, 2, 3],
            "b": ["str1", "str2", "str3"],
        }

    def test_server_create_indexed_table_and_remove(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1", index="a")
        table = client.open_table("table1")
        assert table.schema() == {"a": "integer", "b": "string"}
        assert table.get_index() == "a"
        table.remove([1, 2])
        assert table.view().to_columns() == {"a": [3], "b": ["c"]}

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_create_view(self):
        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        client = Server(lock=True)
        table = Table(data)
        client.host_table("table1", table)
        client._process(message, self.post)
        assert client._get_view("view1").schema() == {"a": "integer", "b": "string"}

    def test_server_create_view_zero(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        assert table.view().dimensions()["num_view_rows"] == 3

    def test_server_create_view_one(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view(group_by=["a"])
        assert view.to_columns() == {
            "__ROW_PATH__": [[], [1], [2], [3]],
            "a": [6, 1, 2, 3],
            "b": [3, 1, 1, 1],
        }

    def test_server_create_view_two(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view(group_by=["a"], split_by=["b"])
        assert view.to_columns() == {
            "__ROW_PATH__": [[], [1], [2], [3]],
            "a|a": [1, 1, None, None],
            "a|b": [1, 1, None, None],
            "b|a": [2, None, 2, None],
            "b|b": [1, None, 1, None],
            "c|a": [3, None, None, 3],
            "c|b": [1, None, None, 1],
        }

    # clear views

    @mark.skip("Need to implement clear_views")
    def test_server_clear_view(self):
        messages = [
            {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"},
            {"id": 2, "table_name": "table1", "view_name": "view2", "cmd": "view"},
            {"id": 3, "table_name": "table1", "view_name": "view3", "cmd": "view"},
        ]
        server = Server()
        client = Client.from_server(server)
        table = Table(data)
        client.host_table("table1", table)
        for message in messages:
            client._process(message, self.post, client_id=1)
        client.clear_views(1)
        assert client._views == {}

    @mark.skip("Need to implement clear_views")
    def test_server_clear_view_nonseq(self):
        messages = [
            {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"},
            {"id": 2, "table_name": "table1", "view_name": "view2", "cmd": "view"},
            {"id": 3, "table_name": "table1", "view_name": "view3", "cmd": "view"},
        ]
        server = Server()
        client = Client.from_server(server)
        table = Table(data)
        client.host_table("table1", table)
        for i, message in enumerate(messages, 1):
            client._process(message, self.post, client_id=i)
        client.clear_views(1)
        client.clear_views(3)
        assert "view1" not in client._views
        assert "view3" not in client._views
        assert "view2" in client._views

    @mark.skip("Need to implement clear_views")
    def test_server_clear_view_no_client_id(self):
        messages = [
            {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"},
            {"id": 2, "table_name": "table1", "view_name": "view2", "cmd": "view"},
            {"id": 3, "table_name": "table1", "view_name": "view3", "cmd": "view"},
        ]
        server = Server()
        client = Client.from_server(server)
        table = Table(data)
        client.host_table("table1", table)
        for message in messages:
            client._process(message, self.post)
        with raises(PerspectiveError):
            client.clear_views(None)

    # locked client
    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_update_table(self):
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
        client = Server(lock=True)
        client._process(message, post_callback)

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_clear_table(self):
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
        client = Server(lock=True)
        client._process(message, post_callback)

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_replace_table(self):
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
        client = Server(lock=True)
        client._process(message, post_callback)

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_remove_table(self):
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
        client = Server(lock=True)
        client._process(message, post_callback)

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_delete_table(self):
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
        client = Server(lock=True)
        client._process(message, post_callback)

    @mark.skip(reason="Have not implemented locking yet")
    def test_arbitary_lock_unlock_client(self):
        client = Server(lock=True)
        make_table_message = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        client._process(
            make_table_message,
            partial(
                self.validate_post,
                expected={"id": 1, "error": "`table` failed - access denied"},
            ),
        )
        client.unlock()
        client._process(make_table_message, self.post)
        assert client._tables["table1"].schema() == {"a": "integer", "b": "string"}
        update_message = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [data],
        }
        client._process(update_message, self.post)
        assert client._tables["table1"].size() == 6
        client.lock()
        update_message_new = {
            "id": 3,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [data],
        }
        client._process(
            update_message_new,
            partial(
                self.validate_post,
                expected={
                    "id": 3,
                    "error": "`table_method.update` failed - access denied",
                },
            ),
        )

    # serialization

    def test_server_to_dict(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view()
        assert view.to_columns() == data

    @mark.skip(reason="Have not implemented locking yet")
    def test_locked_client_to_dict(self, sentinel):
        s = sentinel(False)

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message["data"] == data

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}
        client = Server(lock=True)
        table = Table(data)
        client.host_table("table1", table)
        client._process(message, self.post)
        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }
        client._process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_server_to_dict_with_options(self, sentinel):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view()
        d = view.to_columns(start_row=0, end_row=1)
        assert d == {"a": [1], "b": ["a"]}

    def test_server_to_dict_with_nan(self, util, sentinel):
        data = util.make_arrow(
            ["a"], [[1.5, np.nan, 2.5, np.nan]], types=[pa.float64()]
        )
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view()
        assert view.to_columns() == {"a": [1.5, None, 2.5, None]}

    def test_server_to_dict_unix_timestamps(self, sentinel):
        """The conversion from `datetime` to a Unix timestamp should not
        alter the timestamp in any way if both are in local time."""
        timestamp_data = {"a": [1580515140000]}

        server = Server()
        client = Client.from_server(server)
        schema = {"a": "datetime"}
        table = client.table(schema, name="table1")
        table.update(timestamp_data)

        table = client.open_table("table1")
        view = table.view()
        assert view.to_columns() == timestamp_data

    def test_server_create_view_and_update_table(self):
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view()
        table.update([{"a": 4, "b": "d"}])
        assert view.dimensions()["num_view_rows"] == 4

    def test_server_on_update_rows(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta, reset):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": "integer", "b": "string"}
            table.delete()
            s.set(s.get() + 1)

        # create a table and view using client
        server = Server()
        client = Client.from_server(server)
        client.table(data, name="table1")
        table = client.open_table("table1")
        view = table.view()
        view.on_update(update_callback, mode="row")
        table.update({"a": [4], "b": ["d"]})
        table.update({"a": [5], "b": ["e"]})
        assert s.get() == 2

    def test_repro(self, sentinel):
        s = sentinel(0)

        def update_callback(*args, **kwargs):
            s.set(s.get() + 1)

        table = Table(data)
        view = table.view()
        view.on_update(update_callback)
        table.update({"a": [5], "b": ["e"]})
        assert s.get() == 1

    @mark.skip
    def test_server_on_update_rows_with_port_id(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta, reset):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": "integer", "b": "string"}
            table.delete()
            s.set(s.get() + 1)

        # create a table and view using client
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

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

        client._process(make_port, self.post)
        client._process(make_port2, self.post)

        # hook into the created view and pass it the callback
        view = client._views["view1"]
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

        client._process(update1, self.post)
        client._process(update2, self.post)

        assert s.get() == 2

    @mark.skip
    def test_server_remove_update(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta, reset):
            s.set(s.get() + 1)

        # create a table and view using client
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

        # hook into the created view and pass it the callback
        view = client._views["view1"]
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
        client._process(update1, self.post)
        client._process(update2, self.post)
        assert s.get() == 0

    @mark.skip
    def test_server_on_update_through_wire_API(self, sentinel):
        s = sentinel(0)

        # create a table and view using client
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

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
        client._process(make_on_update, post_update)

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
        client._process(update1, self.post)
        client._process(update2, self.post)
        assert s.get() == 200

    @mark.skip
    def test_server_on_update_rows_through_wire_API(self, sentinel):
        s = sentinel(0)

        # create a table and view using client
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

        def callback(delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": "integer", "b": "string"}
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
        client._process(make_on_update, post_update)

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
        client._process(update1, self.post)
        client._process(update2, self.post)
        assert s.get() == 200

    @mark.skip
    def test_server_on_update_rows_with_port_id_through_wire_API(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta, reset):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": "integer", "b": "string"}
            table.delete()
            s.set(s.get() + 1)

        # create a table and view using client
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

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

        client._process(make_port, self.post)
        client._process(make_port2, self.post)

        # define an update callback
        def callback(delta):
            table = Table(delta)
            assert table.size() == 1
            assert table.schema() == {"a": "integer", "b": "string"}
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
        client._process(make_on_update, post_update)

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

        client._process(update1, self.post)
        client._process(update2, self.post)

        assert s.get() == 200

    @mark.skip
    def test_server_remove_update_through_wire_API(self, sentinel):
        s = sentinel(0)

        def update_callback(port_id, delta, reset):
            s.set(s.get() + 1)

        # create a table and view using client
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

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
        client._process(make_on_update, post_update)

        # call updates
        update1 = {
            "id": 4,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [4], "b": ["d"]}],
        }
        client._process(update1, self.post)

        # remove update callback
        remove_on_update = {
            "id": 5,
            "name": "view1",
            "cmd": "view_method",
            "subscribe": True,
            "method": "remove_update",
            "callback_id": "callback_1",
        }
        client._process(remove_on_update, self.post)

        update2 = {
            "id": 6,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [5], "b": ["e"]}],
        }
        client._process(update2, self.post)
        assert s.get() == 100

    @mark.skip
    def test_server_delete_table_should_fail(self):
        post_callback = partial(
            self.validate_post,
            expected={
                "id": 2,
                "error": "table.delete() cannot be called on a remote table, as the remote has full ownership.",
            },
        )
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        delete_table = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "delete",
            "args": [],
        }
        client._process(delete_table, post_callback)
        assert len(client._tables) == 1

    @mark.skip
    def test_server_delete_view(self):
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)
        delete_view = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "method": "delete",
        }
        client._process(delete_view, self.post)
        assert len(client._views) == 0

    @mark.skip
    def test_server_on_delete_view(self, sentinel):
        s = sentinel(False)

        def delete_callback():
            s.set(True)

        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

        view = client._get_view("view1")
        view.on_delete(delete_callback)

        delete_view = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "method": "delete",
        }

        client._process(delete_view, self.post)

        assert len(client._views) == 0
        assert s.get() is True

    @mark.skip
    def test_server_remove_delete_view(self, sentinel):
        s = sentinel(False)

        def delete_callback():
            s.set(True)

        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        server = Server()
        client = Client.from_server(server)
        client._process(make_table, self.post)
        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        client._process(make_view, self.post)

        view = client._get_view("view1")
        view.on_delete(delete_callback)
        view.remove_delete(delete_callback)

        delete_view = {
            "id": 3,
            "name": "view1",
            "cmd": "view_method",
            "method": "delete",
        }

        client._process(delete_view, self.post)

        assert len(client._views) == 0
        assert s.get() is False

    def test_server_set_queue_process(self, sentinel):
        s = sentinel(0)

        def fake_poll_process(server):
            s.set(s.get() + 1)
            server.poll()

        server = Server(on_poll_request=fake_poll_process)
        client = Client.from_server(server)
        table = client.table({"a": [1, 2, 3]}, name="tbl")
        view = table.view()
        view.on_update(lambda *args: print(args))
        table.update({"a": [4, 5, 6]})
        assert table.view().to_columns() == {"a": [1, 2, 3, 4, 5, 6]}

        table.update({"a": [7, 8, 9]})
        assert s.get() == 7
