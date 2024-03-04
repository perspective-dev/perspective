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
import time

from bench import PerspectiveTornadoBenchmark


async def bench_to_arrow(client):
    """Test how long it takes to create a view on the remote table and
    retrieve an arrow."""
    table = client.open_table("data_source_one")
    view = await table.view()
    start = time.time()
    arrow = await view.to_arrow()
    end = time.time() - start
    assert len(arrow) > 0
    return [end]


async def bench_stddev(client):
    """Benchmark the standard deviation aggregate calculation."""
    table = client.open_table("data_source_one")
    start = time.time()
    view = await table.view(
        group_by=["State"],
        aggregates={"Sales": "standard deviation"},
        columns=["Sales"],
    )
    num_rows = await view.num_rows()
    end = time.time() - start
    assert num_rows > 0
    return [end]


if __name__ == "__main__":
    """To allow your test script to run within the benchmark harness,
    import and create a `PerspectiveTornadoBenchmark`, and call its
    `run()` method. To run it against a local test server, start the
    `tornado_python` example: `yarn start tornado_python`, or provide the
    URL to an already-running perspective-python server.

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
    benchmarks = [bench_to_arrow, bench_stddev]

    for benchmark in benchmarks:
        logging.info("Running {}".format(benchmark.__name__))
        runner = PerspectiveTornadoBenchmark(benchmark)
        runner.run()
