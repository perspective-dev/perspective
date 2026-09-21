# Perspective with Kafka and other message queues

<!-- description: Stream Kafka, Redpanda, NATS, RabbitMQ or any message queue into a live Perspective data grid, pivot table and charts: consume messages in Python or Node.js, call table.update(), and every connected browser updates in real time. -->

Perspective has no queue-specific connector because it does not need one: a
[`Table`](../explanation/table.md) is updated by calling `update()`, so any
consumer loop is an integration. The pattern is the same for Kafka, Redpanda,
NATS, RabbitMQ, Redis streams or a WebSocket feed.

1. Create a `Table` from a schema, on a `perspective.Server`.
2. Consume messages, batch them, and call `table.update(batch)`.
3. Host the server on a WebSocket so browsers can open the table.

## Python

```python
import json
import threading

import tornado.ioloop
import tornado.web
from confluent_kafka import Consumer
from perspective import Server
from perspective.handlers.tornado import PerspectiveTornadoHandler

server = Server()
client = server.new_local_client()
table = client.table(
    {"order_id": "string", "symbol": "string", "qty": "integer", "price": "float", "ts": "datetime"},
    index="order_id",
    name="orders",
)

def consume():
    consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": "perspective"})
    consumer.subscribe(["orders"])
    while True:
        messages = consumer.consume(num_messages=500, timeout=0.1)
        rows = [json.loads(m.value()) for m in messages if m.error() is None]
        if rows:
            table.update(rows)

threading.Thread(target=consume, daemon=True).start()

app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {"perspective_server": server}),
])

app.listen(8080)
tornado.ioloop.IOLoop.current().start()
```

`confluent_kafka` is used here for illustration; nothing in Perspective depends
on it.

## Design notes

- **Batch.** One `update()` of 500 rows is much cheaper than 500 updates of
  one row. Consume in small time windows, as above.
- **Pick `index` or `limit`.** A topic is unbounded; a browser is not. Use
  [`index`](../explanation/table/options.md) when messages are upserts to
  entities (orders, positions, devices), and `limit` when they are events and
  you want the most recent _n_.
- **Threads are fine.** Perspective's Python API is thread-safe and releases
  the GIL. See [Multithreading](../how_to/python/multithreading.md).
- **Arrow if you have it.** If your messages are already Arrow record batches,
  pass the bytes straight to `update()`.

The browser side is identical to any other server-hosted table; see
[Real-time dashboards over WebSocket](../use_cases/real_time_dashboard.md).
