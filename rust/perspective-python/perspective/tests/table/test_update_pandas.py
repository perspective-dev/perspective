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
import pandas as pd
from datetime import date, datetime
from pytest import mark
from perspective.table import Table
import pytest


class TestUpdatePandas(object):
    def test_update_df(self):
        tbl = Table({"a": [1, 2, 3, 4]})

        update_data = pd.DataFrame({"a": [5, 6, 7, 8]})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {"a": [1, 2, 3, 4, 5, 6, 7, 8]}

    def test_update_df_i32_vs_i64(self):
        tbl = Table({"a": int})

        update_data = pd.DataFrame({"a": np.array([5, 6, 7, 8], dtype="int64")})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {"a": [5, 6, 7, 8]}

    def test_update_df_bool(self):
        tbl = Table({"a": [True, False, True, False]})

        update_data = pd.DataFrame({"a": [True, False, True, False]})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {
            "a": [True, False, True, False, True, False, True, False]
        }

    def test_update_df_str(self):
        tbl = Table({"a": ["a", "b", "c", "d"]})

        update_data = pd.DataFrame({"a": ["a", "b", "c", "d"]})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {"a": ["a", "b", "c", "d", "a", "b", "c", "d"]}

    def test_update_df_date(self):
        tbl = Table({"a": [date(2019, 7, 11)]})

        update_data = pd.DataFrame({"a": [date(2019, 7, 12)]})

        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11), datetime(2019, 7, 12)]
        }

    def test_update_df_date_timestamp(self, util):
        tbl = Table({"a": [date(2019, 7, 11)]})

        assert tbl.schema() == {"a": date}

        update_data = pd.DataFrame(
            {"a": [util.to_timestamp(datetime(2019, 7, 12, 0, 0, 0))]}
        )

        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11), datetime(2019, 7, 12)]
        }

    def test_update_df_datetime(self):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        update_data = pd.DataFrame({"a": [datetime(2019, 7, 12, 11, 0)]})

        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_df_datetime_timestamp_seconds(self, util):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        update_data = pd.DataFrame(
            {"a": [util.to_timestamp(datetime(2019, 7, 12, 11, 0))]}
        )

        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_df_datetime_timestamp_ms(self, util):
        tbl = Table({"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))]})

        update_data = pd.DataFrame(
            {"a": [util.to_timestamp(datetime(2019, 7, 12, 11, 0)) * 1000]}
        )

        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [datetime(2019, 7, 11, 11, 0), datetime(2019, 7, 12, 11, 0)]
        }

    def test_update_df_partial(self):
        tbl = Table({"a": [1, 2, 3, 4], "b": ["a", "b", "c", "d"]}, index="b")

        update_data = pd.DataFrame({"a": [5, 6, 7, 8], "b": ["a", "b", "c", "d"]})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {"a": [5, 6, 7, 8], "b": ["a", "b", "c", "d"]}

    def test_update_df_partial_implicit(self):
        tbl = Table({"a": [1, 2, 3, 4]})

        update_data = pd.DataFrame({"a": [5, 6, 7, 8], "__INDEX__": [0, 1, 2, 3]})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {"a": [5, 6, 7, 8]}

    def test_update_df_datetime_partial(self):
        tbl = Table(
            {"a": [np.datetime64(datetime(2019, 7, 11, 11, 0))], "b": [1]}, index="b"
        )

        update_data = pd.DataFrame({"a": [datetime(2019, 7, 12, 11, 0)], "b": [1]})

        tbl.update(update_data)

        assert tbl.view().to_dict() == {"a": [datetime(2019, 7, 12, 11, 0)], "b": [1]}

    def test_update_df_one_col(self):
        tbl = Table({"a": [1, 2, 3, 4], "b": ["a", "b", "c", "d"]})
        update_data = pd.DataFrame({"a": [5, 6, 7]})
        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [1, 2, 3, 4, 5, 6, 7],
            "b": ["a", "b", "c", "d", None, None, None],
        }

    def test_update_df_nonseq_partial(self):
        tbl = Table({"a": [1, 2, 3, 4], "b": ["a", "b", "c", "d"]}, index="b")
        update_data = pd.DataFrame({"a": [5, 6, 7], "b": ["a", "c", "d"]})
        tbl.update(update_data)
        assert tbl.view().to_dict() == {"a": [5, 2, 6, 7], "b": ["a", "b", "c", "d"]}

    @pytest.mark.skip
    def test_update_df_with_none_partial(self):
        tbl = Table({"a": [1, np.nan, 3], "b": ["a", None, "d"]}, index="b")
        update_data = pd.DataFrame({"a": [4, 5], "b": ["a", "d"]})
        tbl.update(update_data)
        assert tbl.view().to_dict() == {
            "a": [None, 4, 5],
            "b": [None, "a", "d"],
        }  # pkeys are ordered

    def test_update_df_unset_partial(self):
        tbl = Table({"a": [1, 2, 3], "b": ["a", "b", "c"]}, index="b")
        update_data = pd.DataFrame({"a": [None, None], "b": ["a", "c"]})
        tbl.update(update_data)
        assert tbl.view().to_dict() == {"a": [None, 2, None], "b": ["a", "b", "c"]}

    def test_update_df_nan_partial(self):
        tbl = Table({"a": [1, 2, 3], "b": ["a", "b", "c"]}, index="b")
        update_data = pd.DataFrame({"a": [None, None], "b": ["a", "c"]})
        tbl.update(update_data)
        assert tbl.view().to_dict() == {"a": [None, 2, None], "b": ["a", "b", "c"]}
