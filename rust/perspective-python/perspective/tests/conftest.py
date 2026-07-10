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

from datetime import datetime, date, timezone

import numpy as np
import pandas as pd
import pyarrow as pa
from pytest import fixture
from random import random, randint, choice
from faker import Faker


# Our tests construct naive datetimes everywhere
# so setting it here is an easy way to fix it globally.
import os

# Perspective used to support datetime.date and datetime.datetime
# as Table() constructor arguments, but now we forward the parameters
# directly to JSON.loads. So to make sure the tests dont need to be
# so utterly transmogrified, we have this little hack :)
import json


os.environ["TZ"] = "UTC"


def new_encoder(self, obj):
    if isinstance(obj, datetime):
        return str(obj)
    elif isinstance(obj, date):
        return str(obj)
    else:
        return old(self, obj)


old = json.JSONEncoder.default
json.JSONEncoder.default = new_encoder

fake = Faker()


def _make_date_time_index(size, time_unit):
    return pd.date_range("2000-01-01", periods=size, freq=time_unit)


def _make_period_index(size, time_unit):
    return pd.period_range(start="2000", periods=size, freq=time_unit)


def _make_dataframe(index, size=10):
    """Create a new random dataframe of `size` and with a DateTimeIndex of
    frequency `time_unit`.
    """
    return pd.DataFrame(
        index=index,
        data={
            "a": np.random.rand(size),
            "b": np.random.rand(size),
            "c": np.random.rand(size),
            "d": np.random.rand(size),
        },
    )


class Util:
    @staticmethod
    def make_arrow(names, data, types=None, legacy=False):
        """Create an arrow binary that can be loaded and manipulated from memory.

        Args:
            names (list): a list of str column names
            data (list): a list of lists containing data for each column
            types (list): an optional list of `pyarrow.type` function references.
                Types will be inferred if not provided.
            legacy (bool): if True, use legacy IPC format (pre-pyarrow 0.15). Defaults to False.

        Returns:
            bytes : a bytes object containing the arrow-serialized output.
        """
        stream = pa.BufferOutputStream()
        arrays = []

        for idx, column in enumerate(data):
            # only apply types if array is present
            kwargs = {}
            if types:
                kwargs["type"] = types[idx]
            arrays.append(pa.array(column, **kwargs))

        batch = pa.RecordBatch.from_arrays(arrays, names)
        table = pa.Table.from_batches([batch])
        writer = pa.RecordBatchStreamWriter(
            stream, table.schema
        )

        writer.write_table(table)
        writer.close()
        return stream.getvalue().to_pybytes()

    @staticmethod
    def make_arrow_from_pandas(df, schema=None, legacy=False):
        """Create a pyarrow Table from a Pandas dataframe.

        Args:
            df (:obj:`pandas.DataFrame`)
            schema (:obj:`pyarrow.Schema`)
            legacy (bool): unused; retained for backwards compatibility.

        Returns:
            pyarrow.Table
        """
        return pa.Table.from_pandas(df, schema=schema)

    @staticmethod
    def make_dictionary_arrow(names, data, types=None, legacy=False):
        """Create an arrow binary that can be loaded and manipulated from memory, with
        each column being a dictionary array of `str` values and `int` indices.

        Args:
            names (list): a list of str column names
            data (list:tuple): a list of tuples, the first value being a list of indices,
                and the second value being a list of values.
            types (list:list:pyarrow.func): a list of lists, containing the indices type and
                dictionary value type for each array.
            legacy (bool): if True, use legacy IPC format (pre-pyarrow 0.15). Defaults to False.

        Returns:
            bytes : a bytes object containing the arrow-serialized output.
        """
        stream = pa.BufferOutputStream()

        arrays = []
        for idx, column in enumerate(data):
            indice_type = pa.int64()
            value_type = pa.string()

            if types is not None:
                indice_type = types[idx][0]
                value_type = types[idx][1]

            indices = pa.array(column[0], type=indice_type)
            values = pa.array(column[1], type=value_type)
            parray = pa.DictionaryArray.from_arrays(indices, values)
            arrays.append(parray)

        batch = pa.RecordBatch.from_arrays(arrays, names)
        table = pa.Table.from_batches([batch])
        writer = pa.RecordBatchStreamWriter(
            stream, table.schema
        )

        writer.write_table(table)
        writer.close()
        return stream.getvalue().to_pybytes()

    @staticmethod
    def to_timestamp(obj):
        """Return an integer timestamp based on a date/datetime object.

        A `date` is a timezone-agnostic calendar day and serializes to epoch
        ms at *UTC* midnight regardless of the host process timezone, so it
        is converted here in UTC. A naive `datetime` is a wall-clock reading
        in the process-local timezone (callers express expected instants
        this way, e.g. `aware.astimezone(TZ).replace(tzinfo=None)`), so it is
        converted via local `timestamp()`.
        """
        classname = obj.__class__.__name__
        if classname == "date":
            return int(
                datetime(
                    obj.year, obj.month, obj.day, tzinfo=timezone.utc
                ).timestamp()
                * 1000
            )
        elif classname == "datetime":
            return int(obj.timestamp() * 1000)
        else:
            return -1

    @staticmethod
    def make_dataframe(size=10, freq="D"):
        index = _make_date_time_index(size, freq)
        return _make_dataframe(index, size)

    @staticmethod
    def make_period_dataframe(size=10):
        index = _make_period_index(size, "M")
        return _make_dataframe(index, size)

    @staticmethod
    def make_series(size=10, freq="D"):
        index = _make_date_time_index(size, freq)
        return pd.Series(data=np.random.rand(size), index=index)


class Sentinel(object):
    """Generic sentinel class for testing side-effectful code in Python 2 and
    3.
    """

    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value

    def set(self, new_value):
        self.value = new_value


@fixture()
def sentinel():
    """Pass `sentinel` into a test and call it with `value` to create a new
    instance of the Sentinel class.

    Example:
        >>> def test_with_sentinel(self, sentinel):
        >>>    s = sentinel(True)
        >>>    s.set(False)
        >>>    s.get()  # returns False
    """

    def _sentinel(value):
        return Sentinel(value)

    return _sentinel


@fixture
def util():
    """Pass the `Util` class in to a test."""
    return Util


@fixture
def superstore(count=100):
    data = []
    for id in range(count):
        dat = {}
        dat["Row ID"] = id
        dat["Order ID"] = "{}-{}".format(fake.ein(), fake.zipcode())
        dat["Order Date"] = fake.date_this_year()
        dat["Ship Date"] = fake.date_between_dates(dat["Order Date"]).strftime(
            "%Y-%m-%d"
        )
        dat["Order Date"] = dat["Order Date"].strftime("%Y-%m-%d")
        dat["Ship Mode"] = choice(["First Class", "Standard Class", "Second Class"])
        dat["Ship Mode"] = choice(["First Class", "Standard Class", "Second Class"])
        dat["Customer ID"] = fake.zipcode()
        dat["Segment"] = choice(["A", "B", "C", "D"])
        dat["Country"] = "US"
        dat["City"] = fake.city()
        dat["State"] = fake.state()
        dat["Postal Code"] = fake.zipcode()
        dat["Region"] = choice(["Region %d" % i for i in range(5)])
        dat["Product ID"] = fake.bban()
        sector = choice(["Industrials", "Technology", "Financials"])
        industry = choice(["A", "B", "C"])
        dat["Category"] = sector
        dat["Sub-Category"] = industry
        dat["Sales"] = randint(1, 100) * 100
        dat["Quantity"] = randint(1, 100) * 10
        dat["Discount"] = round(random() * 100, 2)
        dat["Profit"] = round(random() * 1000, 2)
        data.append(dat)
    return pd.DataFrame(data)
