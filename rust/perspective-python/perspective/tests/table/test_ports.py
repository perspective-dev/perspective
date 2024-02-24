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

import random
from perspective.table import Table

data = {"a": [1, 2, 3, 4], "b": ["a", "b", "c", "d"], "c": [True, False, True, False]}


class TestPorts(object):
    def test_make_port_sequential(self):
        table = Table(data)
        port_ids = []

        for i in range(10):
            port_ids.append(table.make_port())

        assert port_ids == list(range(1, 11))

    def test_make_port_sequential_and_update(self):
        table = Table(data)
        port_ids = []

        for i in range(10):
            port_ids.append(table.make_port())

        assert port_ids == list(range(1, 11))

        for i in range(1, 11):
            table.update({"a": [i], "b": ["a"], "c": [True]}, port_id=i)

        view = table.view()
        result = view.to_dict()

        assert result == {
            "a": [1, 2, 3, 4] + [i for i in range(1, 11)],
            "b": ["a", "b", "c", "d"] + ["a" for i in range(10)],
            "c": [True, False, True, False] + [True for i in range(10)],
        }

    def test_arbitary_port_updates(self):
        table = Table(data)
        port_ids = []

        for i in range(10):
            port_ids.append(table.make_port())

        assert port_ids == list(range(1, 11))

        port = random.randint(0, 10)

        table.update(data, port_id=port)

        assert table.size() == 8

        assert table.view().to_dict() == {
            "a": [1, 2, 3, 4] * 2,
            "b": ["a", "b", "c", "d"] * 2,
            "c": [True, False, True, False] * 2,
        }

    def test_ports_should_only_notify_if_they_have_a_queued_update(self):
        table = Table(data)
        port_ids = []

        for i in range(10):
            port_ids.append(table.make_port())

        assert port_ids == list(range(1, 11))

        view = table.view()
        ports_to_update = [random.randint(0, 10) for i in range(5)]

        def callback(port_id):
            assert port_id in ports_to_update

        view.on_update(callback)

        for port in ports_to_update:
            table.update(data, port_id=port)

    def test_ports_should_have_unique_deltas(self):
        table = Table(data)
        port_ids = []

        for i in range(10):
            port_ids.append(table.make_port())

        assert port_ids == list(range(1, 11))

        view = table.view()
        ports_to_update = [random.randint(0, 10) for i in range(5)]
        unique_data = {
            port: [{"a": port, "b": str(port), "c": True}] for port in ports_to_update
        }

        def callback(port_id, delta):
            assert port_id in ports_to_update
            _t = Table(delta)
            _v = _t.view()
            assert _v.to_records() == unique_data[port]
            _v.delete()
            _t.delete()

        view.on_update(callback, mode="row")

        for port in ports_to_update:
            table.update(unique_data[port], port_id=port)

    def test_ports_should_queue_updates_properly(self):
        table = Table(data)
        port_ids = []

        for i in range(10):
            port_ids.append(table.make_port())

        assert port_ids == list(range(1, 11))

        view = table.view()
        ports_to_update = [random.randint(0, 10) for i in range(5)]

        def callback(port_id):
            assert port_id in ports_to_update

        view.on_update(callback)

        for port in ports_to_update:
            table.update(data, port_id=port)

    def test_ports_multiple_tables_with_different_ports(self):
        server = Table(data)
        client = Table(data)

        for i in range(random.randint(5, 15)):
            # reserve an arbitary number of ports
            server.make_port()

        # port for client is now far above the ports "ON" the client, as the
        # client ports will begin creation at 1.
        server_port_for_client = server.make_port()
        client_port = client.make_port()

        server_view = server.view()
        client_view = client.view()

        # when the client updates, check whether the port id matches that
        # of the server, and complete the test.
        def client_callback(port_id, delta):
            if port_id == client_port:
                print("UPDATING SERVER")
                server.update(delta, port_id=server_port_for_client)

        # when the server updates, pass the update back to the client
        def server_callback(port_id, delta):
            print("UPDATING CLIENT")
            assert port_id == server_port_for_client
            assert server.size() == 8
            server_view.delete()
            server.delete()
            client_view.delete()
            client.delete()

        client_view.on_update(client_callback, mode="row")
        server_view.on_update(server_callback, mode="row")

        client.update(data, port_id=client_port)
