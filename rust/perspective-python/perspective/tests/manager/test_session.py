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
import random
from perspective import Table, PerspectiveManager

data = {"a": [1, 2, 3], "b": ["a", "b", "c"]}


class TestPerspectiveSession(object):
    def post(self, msg):
        """boilerplate callback to simulate a client's `post()` method."""
        msg = json.loads(msg)
        assert msg["id"] is not None

    def validate_post(self, msg, expected=None):
        msg = json.loads(msg)
        if expected:
            assert msg == expected

    # test session
    def test_session_new_session(self, sentinel):
        s = sentinel(False)

        def handle_to_dict(msg):
            s.set(True)
            message = json.loads(msg)
            assert message["data"] == data

        message = {"id": 1, "table_name": "table1", "view_name": "view1", "cmd": "view"}

        manager = PerspectiveManager()
        session = manager.new_session()
        client_id = session.client_id
        table = Table(data)

        manager.host_table("table1", table)

        # create a view through the session to make sure it has a client id
        session.process(message, self.post)

        # make sure the client ID is attached to the new view
        assert len(manager._views.keys()) == 1
        assert manager._get_view("view1")._client_id == client_id

        to_dict_message = {
            "id": 2,
            "name": "view1",
            "cmd": "view_method",
            "method": "to_dict",
        }

        session.process(to_dict_message, handle_to_dict)
        assert s.get() is True

    def test_session_multiple_new_sessions(self, sentinel):
        s = sentinel(0)

        def handle_to_dict(msg):
            s.set(s.get() + 1)

            message = json.loads(msg)

            assert message["data"] == {
                "a": [1, 2, 3, 1, 2, 3],
                "b": ["a", "b", "c", "str1", "str2", "str3"],
            }

        manager = PerspectiveManager()
        sessions = [manager.new_session() for i in range(5)]
        table = Table(data)

        manager.host_table("table1", table)

        # create a view on each session
        for i, session in enumerate(sessions):
            # IDs have to conflict - each viewer will send the first message as
            # ID = 1, so we need to make sure we handle that.
            msg = {
                "id": 1,
                "table_name": "table1",
                "view_name": "view" + str(i),
                "cmd": "view",
            }
            session.process(msg, self.post)

        manager_views = list(manager._views.keys())
        for key in ["view" + str(i) for i in range(5)]:
            assert key in manager_views

        for i, session in enumerate(sessions):
            view = manager._get_view("view" + str(i))
            assert view._client_id == session.client_id

        # arbitrarily do an update
        random_session_id = random.randint(0, 4)
        update_message = {
            "id": 2,
            "name": "table1",
            "cmd": "table_method",
            "method": "update",
            "args": [{"a": [1, 2, 3], "b": ["str1", "str2", "str3"]}],
        }
        sessions[random_session_id].process(update_message, self.post)

        # should reflect in all sessions
        for i, session in enumerate(sessions):
            to_dict_message = {
                "id": 3,
                "name": "view" + str(i),
                "cmd": "view_method",
                "method": "to_dict",
            }
            session.process(to_dict_message, handle_to_dict)

        assert s.get() == 5

    def test_session_close_session_with_callbacks(self, sentinel):
        s = sentinel(0)

        manager = PerspectiveManager()
        session = manager.new_session()
        client_id = session.client_id

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        session.process(make_table, self.post)

        make_view = {
            "id": 2,
            "table_name": "table1",
            "view_name": "view1",
            "cmd": "view",
        }
        session.process(make_view, self.post)

        # make sure the client ID is attached to the new view
        assert len(manager._views.keys()) == 1
        assert manager._get_view("view1")._client_id == client_id

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
        session.process(make_on_update, post_update)

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

        session.process(update1, self.post)
        session.process(update2, self.post)

        assert s.get() == 200

        # close the session
        session.close()

        # make sure the view is gone - but not the table
        assert "table1" in manager._tables
        assert manager._views == {}
        assert len(manager._callback_cache) == 0

    def test_session_close_multiple_sessions_with_callbacks(self, sentinel):
        s = sentinel(0)

        manager = PerspectiveManager()
        sessions = [manager.new_session() for i in range(5)]

        # create a table and view using manager
        make_table = {"id": 1, "name": "table1", "cmd": "table", "args": [data]}
        manager._process(make_table, self.post)

        # create a view on each session
        for i, session in enumerate(sessions):
            # IDs have to conflict - each viewer will send the first message as
            # ID = 1, so we need to make sure we handle that.
            msg = {
                "id": 2,
                "table_name": "table1",
                "view_name": "view" + str(i),
                "cmd": "view",
            }
            session.process(msg, self.post)

        manager_views = list(manager._views.keys())
        for key in ["view" + str(i) for i in range(5)]:
            assert key in manager_views

        for i, session in enumerate(sessions):
            view = manager._get_view("view" + str(i))
            assert view._client_id == session.client_id

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

        # create a view and an on_update on each session
        for i, session in enumerate(sessions):
            view_name = "view" + str(i)
            # IDs have to conflict - each viewer will send the first message as
            # ID = 1, so we need to make sure we handle that.
            msg = {
                "id": 2,
                "table_name": "table1",
                "view_name": view_name,
                "cmd": "view",
            }
            session.process(msg, self.post)
            make_on_update = {
                "id": 3,
                "name": view_name,
                "cmd": "view_method",
                "subscribe": True,
                "method": "on_update",
                "callback_id": "callback_1",
            }
            session.process(make_on_update, post_update)

        # call updates using a random session - they should propagate
        random_session_id = random.randint(0, 4)
        random_session = sessions[random_session_id]
        random_client_id = random_session.client_id

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

        random_session.process(update1, self.post)
        random_session.process(update2, self.post)

        # all updates processed, all callbacks fired
        assert s.get() == 1000

        # close a random session, and make sure the other views and callbacks
        # are not affected
        random_session.close()

        # make sure the view is gone - but not the table
        assert "table1" in manager._tables

        assert "view" + str(random_session_id) not in manager._views.keys()
        assert len(manager._views.keys()) == 4

        for callback in manager._callback_cache:
            assert callback["client_id"] != random_client_id

        assert len(manager._callback_cache) == 4
