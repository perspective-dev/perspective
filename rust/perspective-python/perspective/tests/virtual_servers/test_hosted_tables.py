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


import perspective
from perspective import Client
from perspective.virtual_servers import VirtualServerHandler


class HostedTablesHandler(VirtualServerHandler):
    def get_hosted_tables(self):
        return [
            "plain",
            {"name": "single", "index": "a"},
            {"name": "composite", "index": ["a", "b"]},
        ]

    def table_schema(self, table_name):
        return {"a": "integer", "b": "string"}

    def table_size(self, table_name):
        return 0

    def table_make_view(self, table_name, view_name, config):
        pass

    def view_delete(self, view_name):
        pass

    def view_get_data(self, view_name, config, schema, viewport, data):
        pass


def make_client(handler):
    session = perspective.VirtualServer(handler)

    def handle_request(msg):
        client.handle_response(session.handle_request(msg))

    client = Client(handle_request)
    return client


class TestHostedTables(object):
    def test_hosted_table_index_shapes(self):
        client = make_client(HostedTablesHandler())
        assert client.open_table("plain").get_index() is None
        assert client.open_table("single").get_index() == "a"
        assert client.open_table("composite").get_index() == ["a", "b"]
