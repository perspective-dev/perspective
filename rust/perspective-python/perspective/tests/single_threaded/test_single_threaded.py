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

import pandas as pd
from perspective import Table, set_threadpool_size

set_threadpool_size(1)


class TestThreadPoolOne:
    def test_threadpool_one_does_not_block_view(self):
        t = Table(
            {"id": int, "symbol": str, "valid": bool, "value": int, "value2": int},
            index="id",
        )
        t.update(
            [
                {"id": 1, "symbol": "A", "valid": False, "value": 5, "value2": 15},
                {"id": 2, "symbol": "A", "valid": True, "value": 10, "value2": 20},
            ]
        )

        v = t.view(
            columns=["symbol", "value", "value3"],
            expressions={"value3": """"value" + "value2\""""},
        )

        v_agg = t.view(
            columns=["symbol", "value", "value3"],
            expressions={"value3": """"value" + "value2\""""},
            group_by=["symbol"],
            aggregates={"symbol": "first", "value": "sum", "value2": "sum"},
        )

        assert v.to_df().to_dict("records") == [
            {"symbol": "A", "value": 5, "value3": 20.0},
            {"symbol": "A", "value": 10, "value3": 30.0},
        ]

        assert v_agg.to_df().to_dict("records") == [
            {"__ROW_PATH__": [], "symbol": "A", "value": 15, "value3": 50.0},
            {"__ROW_PATH__": ["A"], "symbol": "A", "value": 15, "value3": 50.0},
        ]
