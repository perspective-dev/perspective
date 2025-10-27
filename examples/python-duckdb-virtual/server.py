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

from pathlib import Path

import duckdb
import perspective
import perspective.handlers.tornado
import perspective.virtual_servers.duckdb
import tornado.ioloop
import tornado.web
import tornado.websocket

from loguru import logger
from tornado.web import StaticFileHandler


INPUT_FILE = (
    Path(__file__).parent.resolve()
    / "node_modules"
    / "superstore-arrow"
    / "superstore.parquet"
)


if __name__ == "__main__":
    db = duckdb.connect(":memory:perspective")
    db.sql(
        f"""
        SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;
        CREATE TABLE data_source_one AS
            SELECT * FROM '{INPUT_FILE}';
        """,
    )

    virtual_server = perspective.virtual_servers.duckdb.DuckDBVirtualServer(db)
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
