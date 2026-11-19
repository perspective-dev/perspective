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

import logging
import random
from datetime import datetime

import tornado.ioloop
import tornado.web

import perspective
import perspective.handlers.tornado

PORT = 8080
TABLE_NAME = "orders"
SYMBOLS = ["AAPL", "AMZN", "GOOGL", "MSFT", "NVDA", "TSLA"]
SCHEMA = {
    "symbol": "string",
    "source": "string",
    "price": "float",
    "quantity": "integer",
    "timestamp": "datetime",
}


def new_rows(count):
    """Generate `count` random orders."""
    return [
        {
            "symbol": random.choice(SYMBOLS),
            "source": "server",
            "price": round(random.uniform(50, 500), 2),
            "quantity": random.randint(1, 100),
            "timestamp": datetime.now().timestamp() * 1000,
        }
        for _ in range(count)
    ]


def make_app(perspective_server):
    """A Tornado application which serves `perspective_server` over a WebSocket."""
    return tornado.web.Application(
        [
            (
                r"/websocket",
                perspective.handlers.tornado.PerspectiveTornadoHandler,
                {"perspective_server": perspective_server},
            ),
        ]
    )


if __name__ == "__main__":
    perspective_server = perspective.Server()
    client = perspective_server.new_local_client()
    table = client.table(SCHEMA, limit=10_000, name=TABLE_NAME)
    app = make_app(perspective_server)
    app.listen(PORT)
    logging.critical("Listening on ws://localhost:%d/websocket", PORT)
    tornado.ioloop.PeriodicCallback(lambda: table.update(new_rows(5)), 1000).start()
    tornado.ioloop.IOLoop.current().start()
