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

import os
import time
import pytz
import numpy as np
import pandas as pd
from datetime import date, datetime, timedelta
from dateutil import tz
from pytest import mark
from perspective.table import Table

LOCAL_DATETIMES = [
    datetime(2019, 1, 11, 0, 10, 20),
    datetime(2019, 1, 11, 11, 10, 20),
    datetime(2019, 1, 11, 19, 10, 20),
]

# Test the DST transition for Continental US
LOCAL_DATETIMES_DST = [
    datetime(2019, 3, 9, 12, 10, 20),
    datetime(2019, 3, 19, 12, 10, 20),
    datetime(2019, 11, 2, 12, 10, 20),
    datetime(2019, 11, 3, 12, 10, 20),
]

LOCAL_TIMESTAMPS = [pd.Timestamp(d) for d in LOCAL_DATETIMES]
LOCAL_TIMESTAMPS_DST = [pd.Timestamp(d) for d in LOCAL_DATETIMES_DST]

# Set up testing data
UTC = pytz.UTC

UTC_DATETIMES = [UTC.localize(d) for d in LOCAL_DATETIMES]
UTC_TIMESTAMPS = [UTC.localize(d) for d in LOCAL_TIMESTAMPS]

UTC_DATETIMES_DST = [UTC.localize(d, is_dst=True) for d in LOCAL_DATETIMES_DST]
UTC_TIMESTAMPS_DST = [UTC.localize(d, is_dst=True) for d in LOCAL_TIMESTAMPS_DST]

PST = pytz.timezone("US/Pacific")
CST = pytz.timezone("US/Central")
EST = pytz.timezone("US/Eastern")
GMT = pytz.timezone("GMT")
HKT = pytz.timezone("Asia/Hong_Kong")
JPT = pytz.timezone("Asia/Tokyo")
ACT = pytz.timezone("Australia/ACT")

TIMEZONES = [PST, CST, EST, GMT, HKT, JPT, ACT]

TZ_DATETIMES = {}
TZ_TIMESTAMPS = {}

TZ_DATETIMES_DST = {}
TZ_TIMESTAMPS_DST = {}

for TZ in TIMEZONES:
    TZ_DATETIMES[TZ.zone] = [TZ.localize(d) for d in LOCAL_DATETIMES]
    TZ_TIMESTAMPS[TZ.zone] = [d.tz_localize(TZ) for d in LOCAL_TIMESTAMPS]
    TZ_DATETIMES_DST[TZ.zone] = [d.astimezone(TZ) for d in UTC_DATETIMES_DST]
    TZ_TIMESTAMPS_DST[TZ.zone] = [d.tz_convert(TZ) for d in UTC_TIMESTAMPS_DST]

if os.name != "nt":
    # no tzset on windows, run these tests on linux/mac only

    class TestTableLocalDateTime(object):
        """Test datetimes across configurations such as local time, timezone-aware,
        timezone-naive, and UTC implementations.
        """

        def setup_method(self):
            # To make sure that local times are not changed, set timezone to EST
            os.environ["TZ"] = "US/Eastern"
            time.tzset()

        def teardown_method(self):
            # go back to UTC at end of each test method, for consistency
            os.environ["TZ"] = "UTC"
            time.tzset()

        def test_table_should_assume_local_time(self):
            """If a datetime object has no `tzinfo`, it should be assumed to be in
            local time and not be converted at all.
            """
            data = {"a": LOCAL_DATETIMES}
            table = Table(data)
            assert table.view().to_dict()["a"] == LOCAL_DATETIMES

        def test_table_should_assume_local_time_numpy_datetime64(self):
            data = {"a": [np.datetime64(d) for d in LOCAL_DATETIMES]}
            table = Table(data)
            assert table.view().to_dict()["a"] == LOCAL_DATETIMES

        def test_table_should_assume_local_time_pandas_timestamp(self):
            data = {"a": LOCAL_TIMESTAMPS}

            # Timestamps are assumed to be in UTC by pandas
            table = Table(data)

            # Timestamps are read out in local time
            assert table.view().to_dict()["a"] == LOCAL_DATETIMES

        def test_table_should_assume_local_time_pandas_timestamp_df(self):
            data = pd.DataFrame({"a": LOCAL_TIMESTAMPS})

            # Timestamps are assumed to be in UTC by pandas
            table = Table(data)

            # Timestamps are read out in local time
            assert table.view().to_dict()["a"] == [
                datetime(2019, 1, 10, 19, 10, 20),
                datetime(2019, 1, 11, 6, 10, 20),
                datetime(2019, 1, 11, 14, 10, 20),
            ]

        def test_table_should_assume_local_time_dst(self):
            """If a datetime object has no `tzinfo`, it should be assumed to be in
            local time and not be converted at all.
            """
            data = {"a": LOCAL_DATETIMES_DST}
            table = Table(data)
            assert table.view().to_dict()["a"] == LOCAL_DATETIMES_DST

        def test_table_should_assume_local_time_numpy_datetime64_dst(self):
            data = {"a": [np.datetime64(d) for d in LOCAL_DATETIMES_DST]}
            table = Table(data)
            assert table.view().to_dict()["a"] == LOCAL_DATETIMES_DST

        def test_table_should_assume_local_time_pandas_timestamp_dst(self):
            data = {"a": LOCAL_TIMESTAMPS_DST}
            table = Table(data)
            assert table.view().to_dict()["a"] == LOCAL_DATETIMES_DST

        def test_table_should_assume_local_time_pandas_timestamp_dst_df(self):
            data = pd.DataFrame({"a": LOCAL_TIMESTAMPS_DST})
            table = Table(data)
            assert table.view().to_dict()["a"] == [
                datetime(2019, 3, 9, 7, 10, 20),
                datetime(2019, 3, 19, 8, 10, 20),
                datetime(2019, 11, 2, 8, 10, 20),
                datetime(2019, 11, 3, 7, 10, 20),
            ]

        def test_table_datetime_min(self):
            data = {"a": [datetime.min]}
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(1969, 12, 31, 19, 0)]

        def test_table_datetime_min_df(self):
            data = pd.DataFrame({"a": [datetime.min]})
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(1969, 12, 31, 19, 0)]

        def test_table_datetime_1900(self):
            data = {"a": [datetime(1900, 1, 1)]}
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(1900, 1, 1)]

        def test_table_datetime_1900_df(self):
            data = pd.DataFrame({"a": [datetime(1900, 1, 1)]})
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(1899, 12, 31, 19)]

        def test_table_datetime_1899(self):
            data = {"a": [datetime(1899, 1, 1)]}
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(1898, 12, 31, 19)]

        def test_table_datetime_1899_df(self):
            data = pd.DataFrame({"a": [datetime(1899, 1, 1)]})
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(1898, 12, 31, 19)]

        def test_table_datetime_min_epoch(self):
            data = {"a": [0]}
            table = Table({"a": datetime})
            table.update(data)
            assert table.view().to_dict()["a"] == [datetime(1969, 12, 31, 19, 0)]

        def test_table_datetime_min_epoch_df(self):
            data = pd.DataFrame({"a": [0]})
            table = Table({"a": datetime})
            table.update(data)
            assert table.view().to_dict()["a"] == [datetime(1969, 12, 31, 19, 0)]

        @mark.skip
        def test_table_datetime_max(self):
            data = {"a": [datetime.max]}
            table = Table(data)

            # lol - result is converted from UTC to EST (local time)
            assert table.view().to_dict()["a"] == [datetime(9999, 12, 31, 18, 59, 59)]

        @mark.skip
        def test_table_datetime_max_df(self):
            data = pd.DataFrame({"a": [datetime.max]})
            table = Table(data)
            assert table.view().to_dict()["a"] == [datetime(9999, 12, 31, 18, 59, 59)]

    class TestTableDateTimeUTCToLocal(object):
        def teardown_method(self):
            # Set timezone to UTC, always
            os.environ["TZ"] = "UTC"
            time.tzset()

        def test_table_should_convert_UTC_to_local_time_pytz_pacific(self):
            """If the datetime has `tzinfo` set, use it to convert the datetime to
            UTC. Make sure this works with both `pytz` and `dateutil` for
            `datetime` and `pandas.Timestamp`.
            """
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            # Should be in PST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(PST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_central(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(CST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_eastern(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(EST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_GMT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict() == {
                "a": [d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_HKT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_JPT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_ACT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_pacific(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            # Should be in PST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(PST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_central(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(CST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_eastern(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(EST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_GMT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict() == {
                "a": [d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_pacific_DST(self):
            data = {"a": UTC_DATETIMES_DST}
            table = Table(data)

            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            # Should be in PST now
            assert table.view().to_dict() == {
                "a": [d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["US/Pacific"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_central_DST(self):
            data = {"a": UTC_DATETIMES_DST}
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict() == {
                "a": [d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["US/Central"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_eastern_DST(self):
            data = {"a": UTC_DATETIMES_DST}
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict() == {
                "a": [d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["US/Eastern"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_GMT_DST(self):
            data = {"a": UTC_DATETIMES_DST}
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict() == {
                "a": [d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["GMT"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_pacific_DST_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS_DST})
            table = Table(data)

            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            # Should be in PST now
            assert table.view().to_dict()["a"] == [
                d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["US/Pacific"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_central_DST_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS_DST})
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict()["a"] == [
                d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["US/Central"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_eastern_DST_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS_DST})
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict()["a"] == [
                d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["US/Eastern"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_GMT_DST_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS_DST})
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict()["a"] == [
                d.replace(tzinfo=None) for d in TZ_DATETIMES_DST["GMT"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_HKT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_JPT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_dateutil_ACT(self):
            data = {"a": UTC_DATETIMES}
            table = Table(data)

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            ACT = tz.gettz("Australia/Sydney")

            assert table.view().to_dict() == {
                "a": [d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_UTC_to_local_time_pytz_pacific_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            # Should be in PST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(PST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_pytz_central_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(CST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_pytz_eastern_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(EST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_pytz_GMT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict()["a"] == [
                d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_pytz_HKT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_pytz_JPT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_pytz_ACT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_pacific_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            # Should be in PST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(PST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_central_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            CST = tz.gettz("US/Central")

            # Should be in CST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(CST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_eastern_timestamp(
            self,
        ):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(EST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_GMT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            GMT = tz.gettz("GMT")

            # Should be in GMT now
            assert table.view().to_dict()["a"] == [
                d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_HKT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_JPT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_UTC_to_local_time_dateutil_ACT_timestamp(self):
            data = pd.DataFrame({"a": UTC_TIMESTAMPS})
            table = Table(data)

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]
            ]

    class TestTableDateTimeArbitaryToLocal(object):
        def teardown_method(self):
            # Set timezone to UTC, always
            os.environ["TZ"] = "UTC"
            time.tzset()

        def test_table_should_convert_PST_to_local_time_pytz_central(self):
            data = {"a": TZ_DATETIMES["US/Pacific"]}
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(CST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_CST_to_local_time_pytz_eastern(self):
            data = {"a": TZ_DATETIMES["US/Central"]}
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(EST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_EST_to_local_time_pytz_GMT(self):
            data = {"a": TZ_DATETIMES["US/Eastern"]}
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict() == {
                "a": [d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_GMT_to_local_time_pytz_HKT(self):
            data = {"a": TZ_DATETIMES["GMT"]}
            table = Table(data)

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_HKT_to_local_time_pytz_JPT(self):
            data = {"a": TZ_DATETIMES["Asia/Hong_Kong"]}
            table = Table(data)

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_JPT_to_local_time_pytz_ACT(self):
            data = {"a": TZ_DATETIMES["Asia/Tokyo"]}
            table = Table(data)

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_PST_to_local_time_dateutil_central(self):
            data = {"a": TZ_DATETIMES["US/Pacific"]}
            table = Table(data)

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(CST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_CST_to_local_time_dateutil_eastern(self):
            data = {"a": TZ_DATETIMES["US/Central"]}
            table = Table(data)

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict() == {
                "a": [d.astimezone(EST).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_EST_to_local_time_dateutil_GMT(self):
            data = {"a": TZ_DATETIMES["US/Eastern"]}
            table = Table(data)

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict() == {
                "a": [d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_GMT_to_local_time_dateutil_HKT(self):
            data = {"a": TZ_DATETIMES["GMT"]}
            table = Table(data)

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_HKT_to_local_time_dateutil_JPT(self):
            data = {"a": TZ_DATETIMES["Asia/Hong_Kong"]}
            table = Table(data)

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_JPT_to_local_time_dateutil_ACT(self):
            data = {"a": TZ_DATETIMES["Asia/Tokyo"]}
            table = Table(data)

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict() == {
                "a": [d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]]
            }

        def test_table_should_convert_PST_to_local_time_pytz_central_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["US/Pacific"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(CST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_CST_to_local_time_pytz_eastern_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["US/Central"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(EST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_EST_to_local_time_pytz_GMT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["US/Eastern"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict()["a"] == [
                d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_GMT_to_local_time_pytz_HKT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["GMT"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_HKT_to_local_time_pytz_JPT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["Asia/Hong_Kong"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_JPT_to_local_time_pytz_ACT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["Asia/Tokyo"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_PST_to_local_time_dateutil_central_timestamp(
            self,
        ):
            data = {"a": TZ_TIMESTAMPS["US/Pacific"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "US/Central"
            time.tzset()

            # Should be in CST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(CST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_CST_to_local_time_dateutil_eastern_timestamp(
            self,
        ):
            data = {"a": TZ_TIMESTAMPS["US/Central"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "US/Eastern"
            time.tzset()

            # Should be in EST now
            assert table.view().to_dict()["a"] == [
                d.astimezone(EST).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_EST_to_local_time_dateutil_GMT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["US/Eastern"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "GMT"
            time.tzset()

            # Should be in GMT now
            assert table.view().to_dict()["a"] == [
                d.astimezone(GMT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_GMT_to_local_time_dateutil_HKT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["GMT"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "Asia/Hong_Kong"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(HKT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_HKT_to_local_time_dateutil_JPT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["Asia/Hong_Kong"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "Asia/Tokyo"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(JPT).replace(tzinfo=None) for d in data["a"]
            ]

        def test_table_should_convert_JPT_to_local_time_dateutil_ACT_timestamp(self):
            data = {"a": TZ_TIMESTAMPS["Asia/Tokyo"]}
            table = Table(pd.DataFrame(data))

            os.environ["TZ"] = "Australia/Sydney"
            time.tzset()

            assert table.view().to_dict()["a"] == [
                d.astimezone(ACT).replace(tzinfo=None) for d in data["a"]
            ]

    class TestTableDateTimeRowColumnPaths(object):
        """Assert correctness of row and column paths in different timezones."""

        def setup_method(self):
            # To make sure that local times are not changed, set timezone to EST
            os.environ["TZ"] = "US/Eastern"
            time.tzset()

        def teardown_method(self):
            # Set timezone to UTC, always
            os.environ["TZ"] = "UTC"
            time.tzset()

        def test_table_group_by_datetime_row_path_local_time_EST(self):
            """Make sure that string datetimes generated in Python are in
            local time and not UTC."""
            data = {"a": LOCAL_DATETIMES, "b": [i for i in range(len(LOCAL_DATETIMES))]}

            table = Table(data)

            view = table.view(group_by=["a"])
            assert view.to_columns() == {
                "__ROW_PATH__": [
                    [],
                    [datetime(2019, 1, 11, 0, 10, 20)],
                    [datetime(2019, 1, 11, 11, 10, 20)],
                    [datetime(2019, 1, 11, 19, 10, 20)],
                ],
                "a": [3, 1, 1, 1],
                "b": [3, 0, 1, 2],
            }

        def test_table_group_by_datetime_row_path_UTC(self):
            """Make sure that string datetimes generated in Python are in
            UTC if the timezone is UTC.

            Set the timezone before creating the table so that the local
            datetime is in the intended timezone, as this test asserts that
            paths in the same timezone are not edited to UTC."""
            os.environ["TZ"] = "UTC"
            time.tzset()

            data = {"a": LOCAL_DATETIMES, "b": [i for i in range(len(LOCAL_DATETIMES))]}

            table = Table(data)

            view = table.view(group_by=["a"])
            assert view.to_columns() == {
                "__ROW_PATH__": [
                    [],
                    [datetime(2019, 1, 11, 0, 10, 20)],
                    [datetime(2019, 1, 11, 11, 10, 20)],
                    [datetime(2019, 1, 11, 19, 10, 20)],
                ],
                "a": [3, 1, 1, 1],
                "b": [3, 0, 1, 2],
            }

        def test_table_group_by_datetime_row_path_CST(self):
            """Make sure that string datetimes generated in Python are in
            CST if the timezone is CST."""
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": LOCAL_DATETIMES, "b": [i for i in range(len(LOCAL_DATETIMES))]}

            table = Table(data)

            view = table.view(group_by=["a"])
            assert view.to_columns() == {
                "__ROW_PATH__": [
                    [],
                    [datetime(2019, 1, 11, 0, 10, 20)],
                    [datetime(2019, 1, 11, 11, 10, 20)],
                    [datetime(2019, 1, 11, 19, 10, 20)],
                ],
                "a": [3, 1, 1, 1],
                "b": [3, 0, 1, 2],
            }

        def test_table_group_by_datetime_row_path_PST(self):
            """Make sure that string datetimes generated in Python are in
            CST if the timezone is CST."""
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": LOCAL_DATETIMES, "b": [i for i in range(len(LOCAL_DATETIMES))]}

            table = Table(data)

            view = table.view(group_by=["a"])
            assert view.to_columns() == {
                "__ROW_PATH__": [
                    [],
                    [datetime(2019, 1, 11, 0, 10, 20)],
                    [datetime(2019, 1, 11, 11, 10, 20)],
                    [datetime(2019, 1, 11, 19, 10, 20)],
                ],
                "a": [3, 1, 1, 1],
                "b": [3, 0, 1, 2],
            }

    class TestTableDateTimeExpressions(object):
        """Assert correctness of datetime-related expressions in
        different timezones."""

        def setup_method(self):
            # To make sure that local times are not changed, set timezone to EST
            os.environ["TZ"] = "US/Eastern"
            time.tzset()

        def teardown_method(self):
            # Set timezone to UTC, always
            os.environ["TZ"] = "UTC"
            time.tzset()

        def test_table_now_in_EST(self, util):
            data = {"a": LOCAL_DATETIMES}

            table = Table(data)
            now = datetime.now()
            view = table.view(expressions=["now()"])
            result = view.to_dict()

            for item in result["now()"]:
                in_range = (
                    now - timedelta(seconds=2) < item < now + timedelta(seconds=2)
                )
                assert in_range is True

        def test_table_now_in_CST(self, util):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": LOCAL_DATETIMES}

            table = Table(data)
            now = datetime.now()
            view = table.view(expressions=["now()"])
            result = view.to_dict()

            for item in result["now()"]:
                in_range = (
                    now - timedelta(seconds=2) < item < now + timedelta(seconds=2)
                )
                assert in_range is True

        def test_table_now_in_PST(self, util):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": LOCAL_DATETIMES}

            table = Table(data)
            now = datetime.now()
            view = table.view(expressions=["now()"])
            result = view.to_dict()

            for item in result["now()"]:
                in_range = (
                    now - timedelta(seconds=2) < item < now + timedelta(seconds=2)
                )
                assert in_range is True

        def test_table_hour_of_day_in_EST(self):
            data = {"a": LOCAL_DATETIMES}

            table = Table(data)
            view = table.view(expressions=['hour_of_day("a")'])
            result = view.to_dict()
            assert result['hour_of_day("a")'] == [0, 11, 19]

        def test_table_hour_of_day_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": LOCAL_DATETIMES}

            table = Table(data)
            view = table.view(expressions=['hour_of_day("a")'])
            result = view.to_dict()
            assert result['hour_of_day("a")'] == [0, 11, 19]

        def test_table_hour_of_day_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": LOCAL_DATETIMES}

            table = Table(data)
            view = table.view(expressions=['hour_of_day("a")'])
            result = view.to_dict()
            assert result['hour_of_day("a")'] == [0, 11, 19]

        def test_table_day_of_week_edge_in_EST(self):
            """Make sure edge cases are fixed for day of week - if a local
            time converted to UTC is in the next day, the day of week
            computation needs to be in local time."""
            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=['day_of_week("a")'])
            result = view.to_dict()
            assert result['day_of_week("a")'] == ["6 Friday"]

        def test_table_day_of_week_edge_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=['day_of_week("a")'])
            result = view.to_dict()
            assert result['day_of_week("a")'] == ["6 Friday"]

        def test_table_day_of_week_edge_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=['day_of_week("a")'])
            result = view.to_dict()
            assert result['day_of_week("a")'] == ["6 Friday"]

        def test_table_month_of_year_edge_in_EST(self):
            """Make sure edge cases are fixed for month of year - if a local
            time converted to UTC is in the next month, the month of year
            computation needs to be in local time."""
            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=['month_of_year("a")'])
            result = view.to_dict()
            assert result['month_of_year("a")'] == ["01 January"]

        def test_table_month_of_year_edge_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=['month_of_year("a")'])
            result = view.to_dict()
            assert result['month_of_year("a")'] == ["01 January"]

        def test_table_month_of_year_edge_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=['month_of_year("a")'])
            result = view.to_dict()
            assert result['month_of_year("a")'] == ["01 January"]

        def test_table_day_bucket_edge_in_EST(self):
            """Make sure edge cases are fixed for day_bucket - if a local
            time converted to UTC is in the next day, the day_bucket
            computation needs to be in local time."""
            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'D')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'D')"] == [datetime(2020, 1, 31)]

        def test_table_day_bucket_edge_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'D')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'D')"] == [datetime(2020, 1, 31)]

        def test_table_day_bucket_edge_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": [datetime(2020, 1, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'D')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'D')"] == [datetime(2020, 1, 31)]

        def test_table_week_bucket_edge_in_EST(self):
            """Make sure edge cases are fixed for week_bucket - if a local
            time converted to UTC is in the next day, the week_bucket
            computation needs to be in local time."""
            data = {"a": [datetime(2020, 2, 2, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'W')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'W')"] == [datetime(2020, 1, 27)]

        def test_table_week_bucket_edge_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": [datetime(2020, 2, 2, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'W')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'W')"] == [datetime(2020, 1, 27)]

        def test_table_week_bucket_edge_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": [datetime(2020, 2, 2, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'W')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'W')"] == [datetime(2020, 1, 27)]

        def test_table_week_bucket_edge_flip_in_EST(self):
            """Week bucket should flip backwards to last month."""
            data = {"a": [datetime(2020, 3, 1, 12, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'W')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'W')"] == [datetime(2020, 2, 24)]

        def test_table_week_bucket_edge_flip_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()
            data = {"a": [datetime(2020, 3, 1, 12, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'W')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'W')"] == [datetime(2020, 2, 24)]

        def test_table_week_bucket_edge_flip_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()
            data = {"a": [datetime(2020, 3, 1, 12, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'W')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'W')"] == [datetime(2020, 2, 24)]

        def test_table_month_bucket_edge_in_EST(self):
            """Make sure edge cases are fixed for month_bucket - if a local
            time converted to UTC is in the next day, the month_bucket
            computation needs to be in local time."""
            data = {"a": [datetime(2020, 6, 30, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'M')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'M')"] == [datetime(2020, 6, 1)]

        def test_table_month_bucket_edge_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()

            data = {"a": [datetime(2020, 6, 30, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'M')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'M')"] == [datetime(2020, 6, 1)]

        def test_table_month_bucket_edge_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()

            data = {"a": [datetime(2020, 6, 30, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'M')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'M')"] == [datetime(2020, 6, 1)]

        def test_table_year_bucket_edge_in_EST(self):
            """Make sure edge cases are fixed for year_bucket - if a local
            time converted to UTC is in the next day, the year_bucket
            computation needs to be in local time."""
            data = {"a": [datetime(2019, 12, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'Y')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'Y')"] == [datetime(2019, 1, 1)]

        def test_table_year_bucket_edge_in_CST(self):
            os.environ["TZ"] = "US/Central"
            time.tzset()
            data = {"a": [datetime(2019, 12, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'Y')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'Y')"] == [datetime(2019, 1, 1)]

        def test_table_year_bucket_edge_in_PST(self):
            os.environ["TZ"] = "US/Pacific"
            time.tzset()
            data = {"a": [datetime(2019, 12, 31, 23, 59)]}

            table = Table(data)
            view = table.view(expressions=["bucket(\"a\", 'Y')"])
            result = view.to_dict()
            assert result["bucket(\"a\", 'Y')"] == [datetime(2019, 1, 1)]


class TestTableDateTimePivots(object):
    def test_table_group_by_date_correct(self):
        data = {
            "a": [date(2020, i, 15) for i in range(1, 13)],
            "b": [i for i in range(1, 13)],
        }
        table = Table(data)
        view = table.view(group_by=["a"])
        assert view.to_columns() == {
            "__ROW_PATH__": [
                [],
                [datetime(2020, 1, 15, 0, 0)],
                [datetime(2020, 2, 15, 0, 0)],
                [datetime(2020, 3, 15, 0, 0)],
                [datetime(2020, 4, 15, 0, 0)],
                [datetime(2020, 5, 15, 0, 0)],
                [datetime(2020, 6, 15, 0, 0)],
                [datetime(2020, 7, 15, 0, 0)],
                [datetime(2020, 8, 15, 0, 0)],
                [datetime(2020, 9, 15, 0, 0)],
                [datetime(2020, 10, 15, 0, 0)],
                [datetime(2020, 11, 15, 0, 0)],
                [datetime(2020, 12, 15, 0, 0)],
            ],
            "a": [12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            "b": [78, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        }

    def test_table_group_by_pandas_date_correct(self):
        data = {
            "a": [date(2020, i, 15) for i in range(1, 13)],
            "b": [i for i in range(1, 13)],
        }
        table = Table(pd.DataFrame(data))
        view = table.view(group_by=["a"])
        assert view.to_columns() == {
            "__ROW_PATH__": [
                [],
                [datetime(2020, 1, 15, 0, 0)],
                [datetime(2020, 2, 15, 0, 0)],
                [datetime(2020, 3, 15, 0, 0)],
                [datetime(2020, 4, 15, 0, 0)],
                [datetime(2020, 5, 15, 0, 0)],
                [datetime(2020, 6, 15, 0, 0)],
                [datetime(2020, 7, 15, 0, 0)],
                [datetime(2020, 8, 15, 0, 0)],
                [datetime(2020, 9, 15, 0, 0)],
                [datetime(2020, 10, 15, 0, 0)],
                [datetime(2020, 11, 15, 0, 0)],
                [datetime(2020, 12, 15, 0, 0)],
            ],
            "index": [66, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            "a": [12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            "b": [78, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        }

    def test_table_split_by_date_correct(self):
        data = {
            "a": [date(2020, i, 15) for i in range(1, 13)],
            "b": [i for i in range(1, 13)],
        }
        table = Table(data)
        view = table.view(split_by=["a"])
        assert view.to_columns() == {
            "2020-01-15|a": [
                datetime(2020, 1, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-01-15|b": [
                1,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-02-15|a": [
                None,
                datetime(2020, 2, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-02-15|b": [
                None,
                2,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-03-15|a": [
                None,
                None,
                datetime(2020, 3, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-03-15|b": [
                None,
                None,
                3,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-04-15|a": [
                None,
                None,
                None,
                datetime(2020, 4, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-04-15|b": [
                None,
                None,
                None,
                4,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-05-15|a": [
                None,
                None,
                None,
                None,
                datetime(2020, 5, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-05-15|b": [
                None,
                None,
                None,
                None,
                5,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-06-15|a": [
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 6, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-06-15|b": [
                None,
                None,
                None,
                None,
                None,
                6,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-07-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 7, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-07-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                7,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-08-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 8, 15, 0, 0),
                None,
                None,
                None,
                None,
            ],
            "2020-08-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                8,
                None,
                None,
                None,
                None,
            ],
            "2020-09-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 9, 15, 0, 0),
                None,
                None,
                None,
            ],
            "2020-09-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                9,
                None,
                None,
                None,
            ],
            "2020-10-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 10, 15, 0, 0),
                None,
                None,
            ],
            "2020-10-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                10,
                None,
                None,
            ],
            "2020-11-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 11, 15, 0, 0),
                None,
            ],
            "2020-11-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                11,
                None,
            ],
            "2020-12-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 12, 15, 0, 0),
            ],
            "2020-12-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                12,
            ],
        }

    def test_table_split_by_pandas_date_correct(self):
        data = {
            "a": [date(2020, i, 15) for i in range(1, 13)],
            "b": [i for i in range(1, 13)],
        }
        table = Table(pd.DataFrame(data))
        view = table.view(columns=["a", "b"], split_by=["a"])
        assert view.to_columns() == {
            "2020-01-15|a": [
                datetime(2020, 1, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-01-15|b": [
                1,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-02-15|a": [
                None,
                datetime(2020, 2, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-02-15|b": [
                None,
                2,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-03-15|a": [
                None,
                None,
                datetime(2020, 3, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-03-15|b": [
                None,
                None,
                3,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-04-15|a": [
                None,
                None,
                None,
                datetime(2020, 4, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-04-15|b": [
                None,
                None,
                None,
                4,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-05-15|a": [
                None,
                None,
                None,
                None,
                datetime(2020, 5, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-05-15|b": [
                None,
                None,
                None,
                None,
                5,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-06-15|a": [
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 6, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-06-15|b": [
                None,
                None,
                None,
                None,
                None,
                6,
                None,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-07-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 7, 15, 0, 0),
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-07-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                7,
                None,
                None,
                None,
                None,
                None,
            ],
            "2020-08-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 8, 15, 0, 0),
                None,
                None,
                None,
                None,
            ],
            "2020-08-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                8,
                None,
                None,
                None,
                None,
            ],
            "2020-09-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 9, 15, 0, 0),
                None,
                None,
                None,
            ],
            "2020-09-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                9,
                None,
                None,
                None,
            ],
            "2020-10-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 10, 15, 0, 0),
                None,
                None,
            ],
            "2020-10-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                10,
                None,
                None,
            ],
            "2020-11-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 11, 15, 0, 0),
                None,
            ],
            "2020-11-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                11,
                None,
            ],
            "2020-12-15|a": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                datetime(2020, 12, 15, 0, 0),
            ],
            "2020-12-15|b": [
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                12,
            ],
        }
