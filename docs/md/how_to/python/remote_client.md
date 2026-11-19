# Connecting to a remote server

A `Client` does not need to live in the same process as its `Server`. A Python
process can connect to a Perspective server hosted elsewhere, such as one of the
[WebSocket server handlers](./websocket.md), and call the same `Table` and
`View` methods a browser would.

Python has no equivalent of JavaScript's `perspective.websocket()`. Instead,
`perspective.AsyncClient` is built from two halves of a transport that you
provide:

- A `handle_request` callback, passed to the constructor, which Perspective
  calls with the bytes of each message to send to the server.
- `AsyncClient.handle_response()`, which you call with the bytes of each message
  received from the server.

Any WebSocket library can supply these. This example uses Tornado's client,
which runs on the same `asyncio` event loop as the `AsyncClient`:

```python
import asyncio
import tornado.websocket
import perspective

async def connect(url):
    websocket = await tornado.websocket.websocket_connect(url)

    async def send_request(msg):
        await websocket.write_message(msg, binary=True)

    client = perspective.AsyncClient(send_request)

    async def read_responses():
        while (msg := await websocket.read_message()) is not None:
            await client.handle_response(msg)

    return client, asyncio.create_task(read_responses())
```

Messages must be sent as _binary_ WebSocket frames. `read_message()` returns
`None` when the server closes the connection, which ends the `read_responses`
task.

## Using the remote `Table`

Once connected, `open_table()` returns a handle to a `Table` the server hosts by
name. Every method on an `AsyncClient`, and on the `Table` and `View` objects it
creates, is a coroutine:

```python
async def main():
    client, responses = await connect("ws://localhost:8080/websocket")
    table = await client.open_table("orders")
    view = await table.view(group_by=["symbol"], columns=["quantity"])

    updated = asyncio.Event()
    await view.on_update(lambda *args: updated.set())

    async def print_updates():
        while await updated.wait():
            updated.clear()
            print(await view.to_records())

    printer = asyncio.create_task(print_updates())
    await responses
    printer.cancel()

asyncio.run(main())
```

The `View` is created on the server, so `to_records()` transfers only the
aggregated rows. `on_update` callbacks are called on the client whenever the
server's `Table` changes, whichever client made the change, and
`table.update()` called here writes to the server's `Table`.

## Example

The
[`python-remote-client` Example Project](https://github.com/perspective-dev/perspective/tree/master/examples/python-remote-client)
has a complete `server.py` and `client.py` which run as two processes.
