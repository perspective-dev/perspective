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

import pytest

import perspective as psp

client = psp.Server().new_local_client()
Table = client.table


class TestToArrowZstd(object):
    def test_to_arrow_zstd_roundtrip(self, superstore):
        original_tbl = Table(superstore.to_dict(orient="records"))
        arrow_uncompressed = original_tbl.view().to_arrow(compression=None)

        tbl = Table(arrow_uncompressed)
        arr = tbl.view().to_arrow(compression="zstd")
        assert len(arr) < len(arrow_uncompressed)
        assert arr != tbl.view().to_arrow(compression="lz4")
        tbl2 = Table(arr)
        assert tbl2.view().to_records() == original_tbl.view().to_records()
        arr2 = tbl2.view().to_arrow(compression=None)
        assert len(arr2) > len(arr)
        tbl3 = Table(arr)
        arr3 = tbl3.view().to_arrow(compression="zstd")
        assert len(arr3) == len(arr)

    def test_to_arrow_unknown_compression_raises(self, superstore):
        tbl = Table(superstore.to_dict(orient="records"))
        with pytest.raises(Exception, match="compression"):
            tbl.view().to_arrow(compression="gzip")
