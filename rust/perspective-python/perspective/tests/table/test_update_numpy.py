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

import numpy as np
from datetime import date, datetime
from pytest import mark
from perspective.table import Table


class TestUpdateNumpy(object):
    def test_update_np(self):
        tbl = Table({"a": [1, 2, 3, 4]})
        tbl.update({"a": np.array([5, 6, 7, 8])})
        assert tbl.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6, 7, 8]}

    def test_update_np_one_col(self):
        tbl = Table({"a": np.array([1, 2, 3, 4]), "b": np.array([2, 3, 4, 5])})
        tbl.update({"a": np.array([5, 6, 7, 8])})
        assert tbl.view().to_dict() == {
            "a": [1, 2, 3, 4, 5, 6, 7, 8],
            "b": [2, 3, 4, 5, None, None, None, None],
        }

    def test_update_np_bool_str(self):
        tbl = Table({"a": [True]})

        assert tbl.schema() == {"a": bool}

        tbl.update({"a": np.array(["False"])})

        assert tbl.view().to_dict() == {"a": [True, False]}

    def test_update_np_date(self):
        tbl = Table({"a": [date(2019, 7, 11)]})

        assert tbl.schema() == {"a": date}

        tbl.update({"a": np.array([date(2019, 7, 12)])})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11), datetime(2019, 7, 12)]
        }

    def test_update_np_date_timestamp(self, util):
        tbl = Table({"a": [date(2019, 7, 11)]})

        assert tbl.schema() == {"a": date}

        ts = util.to_timestamp(datetime(2019, 7, 12))

        tbl.update({"a": np.array([ts])})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11), datetime(2019, 7, 12)]
        }

    def test_update_np_datetime(self):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        tbl.update({"a": np.array([datetime(2019, 7, 12, 11, 0)], dtype=datetime)})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_np_datetime_str(self):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        tbl.update({"a": np.array(["2019/7/12 11:00:00"])})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_np_datetime_timestamp_s(self, util):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        tbl.update({"a": np.array([util.to_timestamp(datetime(2019, 7, 12, 11, 0))])})

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_np_datetime_timestamp_ms(self, util):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        tbl.update(
            {"a": np.array([util.to_timestamp(datetime(2019, 7, 12, 11, 0)) * 1000])}
        )

        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_np_partial(self):
        tbl = Table({"a": [1, 2, 3, 4], "b": ["a", "b", "c", "d"]}, index="b")

        tbl.update(
            {
                "a": np.array([5, 6, 7, 8]),
                "b": np.array(["a", "b", "c", "d"], dtype=object),
            }
        )

        assert tbl.view().to_dict() == {"a": [5, 6, 7, 8], "b": ["a", "b", "c", "d"]}

    def test_update_np_partial_implicit(self):
        tbl = Table({"a": [1, 2, 3, 4]})

        tbl.update({"a": np.array([5, 6, 7, 8]), "__INDEX__": np.array([0, 1, 2, 3])})

        assert tbl.view().to_dict() == {"a": [5, 6, 7, 8]}

    def test_update_np_datetime_partial_implicit_timestamp_s(self, util):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        tbl.update(
            {
                "a": np.array([util.to_timestamp(datetime(2019, 7, 12, 11, 0))]),
                "__INDEX__": np.array([0]),
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_update_np_datetime_partial_implicit_timestamp_ms(self, util):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        tbl.update(
            {
                "a": np.array([util.to_timestamp(datetime(2019, 7, 12, 11, 0)) * 1000]),
                "__INDEX__": np.array([0]),
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)]}

    def test_update_np_datetime_partial(self):
        tbl = Table(
            {"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))], "b": [1]}, index="b"
        )

        tbl.update(
            {
                "a": np.array([datetime(2019, 7, 12, 11, 0)], dtype=datetime),
                "b": np.array([1]),
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)], "b": [1]}

    def test_update_np_datetime_partial_timestamp_s(self, util):
        tbl = Table(
            {"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))], "idx": [1]},
            index="idx",
        )

        tbl.update(
            {
                "a": np.array([util.to_timestamp(datetime(2019, 7, 12, 11, 0))]),
                "idx": np.array([1]),
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)], "idx": [1]}

    def test_update_np_datetime_partial_timestamp_ms(self, util):
        tbl = Table(
            {"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))], "idx": [1]},
            index="idx",
        )

        tbl.update(
            {
                "a": np.array([util.to_timestamp(datetime(2019, 7, 12, 11, 0)) * 1000]),
                "idx": np.array([1]),
            }
        )

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)], "idx": [1]}

    def test_update_np_nonseq_partial(self):
        tbl = Table({"a": [1, 2, 3, 4], "b": ["a", "b", "c", "d"]}, index="b")

        tbl.update(
            {"a": np.array([5, 6, 7]), "b": np.array(["a", "c", "d"], dtype=object)}
        )

        assert tbl.view().to_dict() == {"a": [5, 2, 6, 7], "b": ["a", "b", "c", "d"]}

    def test_update_np_with_none_partial(self):
        tbl = Table({"a": [1, np.nan, 3], "b": ["a", None, "d"]}, index="b")

        tbl.update({"a": np.array([4, 5]), "b": np.array(["a", "d"], dtype=object)})

        assert tbl.view().to_dict() == {
            "a": [None, 4, 5],
            "b": [None, "a", "d"],
        }  # pkeys are ordered

    def test_update_np_unset_partial(self):
        tbl = Table({"a": [1, 2, 3], "b": ["a", "b", "c"]}, index="b")

        tbl.update(
            {"a": np.array([None, None]), "b": np.array(["a", "c"], dtype=object)}
        )

        assert tbl.view().to_dict() == {"a": [None, 2, None], "b": ["a", "b", "c"]}

    def test_update_np_nan_partial(self):
        tbl = Table({"a": [1, 2, 3], "b": ["a", "b", "c"]}, index="b")

        tbl.update(
            {"a": np.array([None, None]), "b": np.array(["a", "c"], dtype=object)}
        )

        assert tbl.view().to_dict() == {"a": [None, 2, None], "b": ["a", "b", "c"]}

    def test_numpy_dict(self):
        x = {"index": [1], "a": np.empty((1,), str)}
        tbl = Table({"index": int, "a": str}, index="index")
        tbl.update({"index": np.arange(5)})
        assert tbl.view().to_dict() == {
            "index": list(range(5)),
            "a": [None for _ in range(5)],
        }
