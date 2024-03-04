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
import argparse
import numpy
import multiprocessing
import asyncio
import perspective

from functools import partial

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)


def least_sq(y):
    y = numpy.sort(y)
    n = len(y)
    x = numpy.arange(1, n + 1)
    x_mean = numpy.mean(x)
    y_mean = numpy.mean(y)
    numerator = 0
    denominator = 0
    for i in range(n):
        numerator += (x[i] - x_mean) * (y[i] - y_mean)
        denominator += (x[i] - x_mean) ** 2

    m = numerator / denominator
    b = y_mean - (m * x_mean)

    print("Mean {:.2f}, Range: {:.2f}, Bias Coef: {:.2f}, Intercept: {:.2f}".format(numpy.mean(y), y[n - 1] - y[0], m, b))


class PerspectiveTornadoBenchmark(object):
    def __init__(self, task):
        """A simple test runner for a perspective-python benchmark. See
        `scenarios/gil_test.py` for example usage."""
        self.task = task
        self.parser = argparse.ArgumentParser(description="Runs a task against a remote `perspective-python` server using multiple websocket clients.")

        self.parser.add_argument(
            "-c",
            "--clients",
            type=int,
            default=10,
            dest="num_clients",
            help="The number of clients that will be run against the remote server, each on a separate thread.",
        )
        self.parser.add_argument(
            "-r",
            "--runs",
            type=int,
            default=1,
            dest="num_runs",
            help="The number of times to run `task` on each client.",
        )
        self.parser.add_argument(
            "-s",
            "--sleep",
            type=float,
            default=0,
            dest="sleep_time",
            help="The number of seconds to sleep between each run of `task` on each client.",
        )
        self.parser.add_argument(
            "-d",
            "--delay",
            type=float,
            default=0,
            dest="delay_time",
            help="The number of seconds to delay between initializing each client.",
        )
        self.parser.add_argument(
            "--interpolate",
            dest="interpolate",
            type=str,
            choices=["clients", "runs", "sleep", "delay"],
            default=None,
            help="A single axis to interpolate - choose between `clients`, \
                  `runs`, `sleep`, or `delay`. \n Uses the values of \
                  `--range` and `--step` to interpolate, or defaults to 3 \
                   increments with steps of 5, i.e. interpolating 10 clients \
                   by --range=3 and --step=2 will run the suite 4 times, \
                   for [10, 12, 14, 16] clients respectively.",
        )
        self.parser.add_argument(
            "--range",
            dest="interpolate_range",
            type=int,
            default=3,
            help="How many times to interpolate the axis.",
        )
        self.parser.add_argument(
            "--step",
            dest="interpolate_step",
            type=int,
            default=3,
            help="A value to increment/decrement the axis by on every interpolation.",
        )

        self.parser.add_argument("url", type=str)
        self.parser.parse_args(namespace=self)

        logging.critical(
            "Running task %d times over %d clients against %s",
            self.num_runs,
            self.num_clients,
            self.url,
        )

        self.interpolate_options = {
            "clients": "num_clients",
            "runs": "num_runs",
            "sleep": "sleep_time",
            "delay": "delay_time",
        }

        # Only interpolate one axis at a time
        self.interpolate_attr = self.interpolate_options.get(self.interpolate)

        # num of interpolated runs + 1 un-interpolated run
        self.interpolate_range += 1

        # Deref parser as it cannot be pickled for multiprocessing, and we
        # don't need it once we have the args parsed.
        self.parser = None

    def run(self):
        """Run the suite with interpolation if specified."""
        client = partial(self.run_client, self)

        if self.interpolate and self.interpolate_attr:
            self._run_interpolate(client)
        else:
            self._run_single(client)

    def _run_interpolate(self, client_func):
        """Calculate interpolation bounds for the given axis and run the
        suite `range` times, stepping the interpolated axis by `step`."""
        start = int(getattr(self, self.interpolate_attr))
        end = int(getattr(self, self.interpolate_attr) + ((self.interpolate_range - 1) * self.interpolate_step))

        logging.info("Interpolating {} over {} runs, range: {} to {}".format(self.interpolate_attr, self.interpolate_range, start, end))

        for i in range(0, self.interpolate_range):
            value = start
            setattr(self, self.interpolate_attr, value)
            logging.info("Interpolating {}: {}".format(self.interpolate_attr, value))
            self._run_single(client_func)
            start = start + self.interpolate_step

    def _run_single(self, client_func):
        """Perform a single run of the suite."""
        with multiprocessing.Pool(processes=self.num_clients) as pool:
            samples = pool.map(client_func, range(self.num_clients))
            least_sq(numpy.array(samples).flatten())

    def run_client(self, *args):
        i = args[-1]
        return asyncio.run(self.client(i))

    async def client(self, client_id):
        """Create a Perspective websocket client and use it to run the task
        for `num_runs`, sleeping for `sleep_time` if needed.

        If a delay is specified, use the incrementing `client_id` to calculate
        the total delay time so that all clients run in the right order."""
        delay = self.delay_time * client_id

        if delay > 0:
            logging.info("Delaying client {} execution by {} seconds".format(client_id, delay))
            await asyncio.sleep(delay)

        psp_client = await perspective.client.tornado.websocket(self.url)
        results = []

        for i in range(self.num_runs):
            result = await self.task(psp_client)
            results.append(result)
            if self.sleep_time > 0:
                logging.info("Sleeping for {} seconds".format(self.sleep_time))
                await asyncio.sleep(self.sleep_time)
        return numpy.array(results).flatten()
