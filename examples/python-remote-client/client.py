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

import asyncio
from datetime import datetime

import tornado.websocket

import perspective

URL = "ws://localhost:8080/websocket"
TABLE_NAME = "orders"


async def connect(url):
    """Connect an `AsyncClient` to the Perspective server at `url`."""
    websocket = await tornado.websocket.websocket_connect(url)

    async def send_request(msg):
        await websocket.write_message(msg, binary=True)

    client = perspective.AsyncClient(send_request)

    async def read_responses():
        while (msg := await websocket.read_message()) is not None:
            await client.handle_response(msg)

    return client, asyncio.create_task(read_responses())


async def main():
    client, responses = await connect(URL)
    print("Hosted tables:", await client.get_hosted_table_names())
    table = await client.open_table(TABLE_NAME)
    print("Schema:", await table.schema())
    view = await table.view(
        group_by=["symbol"],
        columns=["quantity", "price"],
        aggregates={"quantity": "sum", "price": "avg"},
    )

    updated = asyncio.Event()
    await view.on_update(lambda *args: updated.set())
    await table.update(
        [
            {
                "symbol": "AAPL",
                "source": "client",
                "price": 123.45,
                "quantity": 1,
                "timestamp": datetime.now().timestamp() * 1000,
            }
        ]
    )

    async def print_updates():
        while await updated.wait():
            updated.clear()
            print(f"\n{await table.size()} rows")
            for row in await view.to_records():
                symbol = row["__ROW_PATH__"][0] if row["__ROW_PATH__"] else "TOTAL"
                print(f"{symbol:>6} {row['quantity']:>8} {row['price']:>10.2f}")

    printer = asyncio.create_task(print_updates())
    await responses
    printer.cancel()
    print("Server closed the connection")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
