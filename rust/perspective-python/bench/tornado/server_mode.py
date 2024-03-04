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

import time

from bench import PerspectiveTornadoBenchmark


async def server_mode_test(client):
    """Test concurrent performance in server mode using commonly queued
    operations on the Table and View."""
    table = client.open_table("data_source_one")
    start = time.time()
    view = table.view()
    schema = await table.schema()
    size = await table.size()
    assert len(schema) > 0
    assert size != 0
    paths = await view.column_paths()
    data = await view.to_columns(end_col=10, start_row=1000, end_row=1060)
    assert len(paths) > 0
    assert len(data) > 0
    return [time.time() - start]


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
    runner = PerspectiveTornadoBenchmark(server_mode_test)
    runner.run()
