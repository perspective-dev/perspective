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

import multiprocessing
import asyncio
import os
import os.path
import perspective
import time
import tornado
import threading
import numpy

from bench import PerspectiveTornadoBenchmark

TABLE_SCALAR = 20
DOWNLOAD_ITERATIONS = 1
NUM_CLIENTS = 10

file_path = os.path.join(
    os.path.abspath(os.path.dirname(__file__)),
    "..",
    "..",
    "..",
    "..",
    "node_modules",
    "superstore-arrow",
    "superstore.lz4.arrow",
)


# Client


async def session(client):
    """Perform client test."""
    times = numpy.zeros(DOWNLOAD_ITERATIONS)
    table = client.open_table("data_source_one")
    view = await table.view()
    for i in range(DOWNLOAD_ITERATIONS):
        start = time.time()
        arrow = await view.to_arrow()
        times[i] = time.time() - start
        assert len(arrow) > 0
    return times


# Server


def perspective_thread(manager):
    """Start a new perspective loop in this thread."""
    loop = asyncio.new_event_loop()
    manager.set_loop_callback(loop.call_soon_threadsafe)
    loop.run_forever()


def get_table():
    """Get a test table, made from "superstore.lz4.arrow" repeated `TABLE_SCALAR`
    times."""
    with open(file_path, mode="rb") as file:
        arrow = file.read()
    table = perspective.Table(arrow)
    for _ in range(TABLE_SCALAR - 1):
        table.update(arrow)
    return table


def make_app(manager):
    """Make a tornado server for the thread local event loop."""
    app = tornado.web.Application(
        [
            (
                r"/",
                perspective.handlers.tornado.PerspectiveTornadoHandler,
                {"manager": manager},
            )
        ]
    )

    app.listen(8080)


def server(queue, is_async):
    """Start a server, within this process."""
    manager = perspective.PerspectiveManager()
    table = get_table()
    manager.host_table("data_source_one", table)

    if is_async:
        thread = threading.Thread(target=perspective_thread, args=(manager,))
        thread.daemon = True
        thread.start()

    loop = tornado.ioloop.IOLoop.current()
    loop.add_callback(queue.put, True)
    if not is_async:
        manager.set_loop_callback(loop.add_callback)

    make_app(manager)
    loop.start()


def start_server(queue, is_async):
    """Start a server process."""
    server_process = multiprocessing.Process(target=server, args=(queue, is_async))
    server_process.daemon = True
    server_process.start()


# Main


def run(is_async):
    """Runs an entire test scenario, server and client pool, then prints run
    statistics.  The server under test can be run in `sync` or `async` modes.

    This example uses PerspectiveTornadoBenchmark, which wraps a task function
    and runs it over multiple clients and multiple runs."""
    queue = multiprocessing.Queue()
    start_server(queue, is_async)

    # Wait for the queue to clear, indicating the server is ready.
    queue.get()
    runner = PerspectiveTornadoBenchmark(session)
    runner.run()


if __name__ == "__main__":
    """To allow your test script to run within the benchmark harness,
    import and create a `PerspectiveTornadoBenchmark`, and call its
    `run()` method.

    The `task` function you give to the benchmark must have `client` as
    an argument, and return a list of float times as the benchmark
    result.

    This will allow you to call the script from the command line with
    timing options:

    ```bash
    # 10 clients, 5 runs of task per client
    yarn bench test_benchmark.py -c10 -r5 ws://localhost:8080
    ```
    """
    print("Sync mode")
    proc = multiprocessing.Process(target=run, args=(False,))
    proc.start()
    proc.join()

    print("\nAsync mode")
    proc = multiprocessing.Process(target=run, args=(True,))
    proc.start()
    proc.join()
