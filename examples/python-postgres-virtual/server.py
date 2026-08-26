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
import perspective.virtual_servers.postgres
import psycopg
import pyarrow.parquet as pq
import tornado.ioloop
import tornado.web

from tornado.web import StaticFileHandler

logging.basicConfig(
    level=logging.DEBUG,
)

logger = logging.getLogger(__name__)

# Requires a running PostgreSQL >= 16 - e.g.
# `docker run --rm -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`
# with `PSP_POSTGRES_DSN="postgresql://postgres@localhost:5432/postgres"`.
DSN = os.environ.get("PSP_POSTGRES_DSN", "postgresql:///postgres")

INPUT_FILE = (
    Path(__file__).parent.resolve()
    / "node_modules"
    / "superstore-arrow"
    / "superstore.parquet"
)


def arrow_type_to_postgres(arrow_type):
    t = str(arrow_type)
    if t in ("int8", "int16", "int32", "uint8", "uint16"):
        return "INTEGER"

    if t.startswith("int") or t.startswith("uint"):
        return "BIGINT"

    if t in ("float", "double", "halffloat"):
        return "DOUBLE PRECISION"

    if t.startswith("timestamp"):
        return "TIMESTAMP"

    if t.startswith("date"):
        return "DATE"

    if t == "bool":
        return "BOOLEAN"

    return "TEXT"


if __name__ == "__main__":
    db = psycopg.connect(DSN, autocommit=True)

    # Load superstore parquet data into Postgres
    arrow_table = pq.read_table(str(INPUT_FILE))
    db.execute('DROP TABLE IF EXISTS "superstore"')
    names = arrow_table.schema.names
    cols = ", ".join(
        f'"{field.name}" {arrow_type_to_postgres(field.type)}'
        for field in arrow_table.schema
    )

    db.execute(f'CREATE TABLE "superstore" ({cols})')
    with db.cursor() as cur:
        with cur.copy('COPY "superstore" FROM STDIN') as copy:
            for row in arrow_table.to_pylist():
                copy.write_row(tuple(row[n] for n in names))

    logger.info("Loaded superstore data into Postgres")

    virtual_server = perspective.virtual_servers.postgres.PostgresVirtualServer(DSN)

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
