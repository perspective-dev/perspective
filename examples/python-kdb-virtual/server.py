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
import os
from pathlib import Path

import perspective
import perspective.handlers.tornado
import perspective.virtual_servers.kdb
import pyarrow as pa
import pyarrow.parquet as pq
import pykx
import tornado.ioloop
import tornado.web

from tornado.web import StaticFileHandler

logging.basicConfig(
    level=logging.DEBUG,
)

logger = logging.getLogger(__name__)

INPUT_FILE = (
    Path(__file__).parent.resolve()
    / "node_modules"
    / "superstore-arrow"
    / "superstore.parquet"
)

KDB_HOST = os.environ.get("PSP_KDB_HOST", "localhost")
KDB_PORT = int(os.environ.get("PSP_KDB_PORT", "5001"))

# Load the table with q's own CSV reader, `0:`.
#
# Every argument is a plain string, so nothing but char vectors crosses IPC.
# Handing PyKX a column dictionary of ten thousand mixed Python values
# instead makes q signal `nyi` while decoding what PyKX encoded, and a
# delimited text blob sidesteps that conversion layer completely — it is also
# how kdb+ ingests bulk data normally.
#
# The type template does the typing, so text columns arrive as *symbols*,
# which is how kdb+ stores low-cardinality text and which exercises the
# handler's symbol paths (`in` filters, `like`, row-path padding).
LOAD_TABLE = """
{[name; types; names; csv]
    (`$name) set flip (`$"\\t" vs names)!(types; "\\t") 0: csv }
"""

# Arrow type -> q's `0:` type character.
Q_TYPE_CHARS = [
    (pa.types.is_boolean, "B"),
    (pa.types.is_date, "D"),
    (pa.types.is_timestamp, "P"),
    (pa.types.is_floating, "F"),
    (pa.types.is_int64, "J"),
    (pa.types.is_integer, "I"),
]


def q_type_char(arrow_type):
    """The `0:` template character for an Arrow type, defaulting to symbol."""
    for predicate, char in Q_TYPE_CHARS:
        if predicate(arrow_type):
            return char

    return "S"


def to_text(column):
    """One Arrow column as the text `0:` will parse.

    Built by hand rather than with `pyarrow.csv`, which refuses to write
    unquoted values containing a `"` — and superstore's product names are
    full of them, as inches. Quoting instead is not an option: `0:` splits on
    its delimiter and has no notion of RFC-4180, so it would read the quotes
    as part of the value. A tab delimiter over data that contains no tabs
    makes the split unambiguous, and a bare `"` passes through as what it is.

    A null becomes an empty field, which `0:` reads as that column's null.
    """
    values = column.to_pylist()
    if pa.types.is_boolean(column.type):
        return ["" if x is None else ("1" if x else "0") for x in values]

    if pa.types.is_timestamp(column.type):
        # `0:` wants `2016-11-08D00:00:00`, not the space `str()` gives.
        return ["" if x is None else str(x).replace(" ", "D") for x in values]

    return ["" if x is None else str(x) for x in values]


if __name__ == "__main__":
    try:
        conn = pykx.SyncQConnection(host=KDB_HOST, port=KDB_PORT)
    except BaseException:
        logger.exception(
            "Could not reach a q process at %s:%s - start one with `q -p %s`, or "
            "point PSP_KDB_HOST / PSP_KDB_PORT elsewhere",
            KDB_HOST,
            KDB_PORT,
            KDB_PORT,
        )
        raise

    arrow_table = pq.read_table(str(INPUT_FILE))

    columns = [to_text(arrow_table[name]) for name in arrow_table.column_names]
    rows = "\n".join("\t".join(row) for row in zip(*columns))

    conn(
        LOAD_TABLE,
        "data_source_one",
        "".join(q_type_char(field.type) for field in arrow_table.schema),
        "\t".join(arrow_table.column_names),
        rows,
    )

    logger.info("Loaded superstore data into kdb+ at %s:%s", KDB_HOST, KDB_PORT)

    virtual_server = perspective.virtual_servers.kdb.KdbVirtualServer(conn)
    app = tornado.web.Application(
        [
            (
                r"/websocket",
                perspective.handlers.tornado.PerspectiveTornadoHandler,
                {"perspective_server": virtual_server},
            ),
            (r"/node_modules/(.*)", StaticFileHandler, {"path": "../../node_modules/"}),
            (
                r"/(.*)",
                StaticFileHandler,
                {"path": "./", "default_filename": "index.html"},
            ),
        ],
        websocket_max_message_size=100 * 1024 * 1024,
    )

    app.listen(3000)
    logger.info("Listening on http://localhost:3000")
    loop = tornado.ioloop.IOLoop.current()
    loop.start()
