# Perspective with FastAPI and Starlette

<!-- description: Serve a real-time Perspective data grid, pivot table and charts from a FastAPI or Starlette application, using PerspectiveStarletteHandler to host streaming tables over a WebSocket route. -->

`perspective-python` includes a WebSocket handler for
[Starlette](https://www.starlette.io/), and therefore
[FastAPI](https://fastapi.tiangolo.com/). Add one WebSocket route and every
`Table` hosted by your `perspective.Server` is available to
`<perspective-viewer>` clients in the browser.

```bash
pip install "perspective-python[starlette]" fastapi uvicorn
```

```python
import uvicorn
from fastapi import FastAPI, WebSocket
from perspective import Server
from perspective.handlers.starlette import PerspectiveStarletteHandler

server = Server()
client = server.new_local_client()
table = client.table(
    {"symbol": "string", "price": "float", "time": "datetime"},
    index="symbol",
    name="prices",
)

app = FastAPI()

async def websocket_handler(websocket: WebSocket):
    handler = PerspectiveStarletteHandler(
        perspective_server=server,
        websocket=websocket,
    )

    await handler.run()

app.add_api_websocket_route("/websocket", websocket_handler)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

Anything in your application can now write to the table — a REST endpoint, a
background task, a queue consumer:

```python
@app.post("/ticks")
async def ticks(rows: list[dict]):
    table.update(rows)
```

In the browser:

```javascript
const websocket = await perspective.websocket("ws://localhost:8080/websocket");
const table = await websocket.open_table("prices");
await document.querySelector("perspective-viewer").load(table);
```

Every connected viewer updates as `table.update()` is called.

- [Hosting a WebSocket server](../how_to/python/websocket.md) — replicated vs
  server-only modes.
- [Multithreading](../how_to/python/multithreading.md) — the `executor`
  handler argument and `on_poll_request`.
- [Real-time dashboards over WebSocket](../use_cases/real_time_dashboard.md)
- [`python-starlette` example](https://github.com/perspective-dev/perspective/tree/master/examples/python-starlette)
