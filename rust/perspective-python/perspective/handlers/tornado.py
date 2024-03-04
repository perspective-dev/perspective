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

import asyncio
from tornado.websocket import WebSocketHandler, WebSocketClosedError

from .common import PerspectiveHandlerBase


class PerspectiveTornadoHandler(PerspectiveHandlerBase, WebSocketHandler):
    """PerspectiveTornadoHandler is a drop-in implementation of Perspective.

    Use it inside Tornado routing to create a server-side Perspective that is
    ready to receive websocket messages from the front-end `perspective-viewer`.
    Because Tornado implements an event loop, this handler links Perspective
    with `IOLoop.current()` in order to defer expensive operations until the
    next free iteration of the event loop.

    The Perspective client and server will automatically keep the Websocket
    alive without timing out.

    Examples:
        >>> MANAGER = PerspectiveManager()
        >>> MANAGER.host_table("data_source_one", Table(
        ...     pd.read_csv("superstore.csv")))
        >>> app = tornado.web.Application([
        ...     (r"/", MainHandler),
        ...     (r"/websocket", PerspectiveTornadoHandler, {
        ...         "manager": MANAGER,
        ...         "check_origin": True
        ...     })
        ... ])
    """

    def __init__(self, *args, **kwargs):
        PerspectiveHandlerBase.__init__(self, **kwargs)
        WebSocketHandler.__init__(self, *args)

    def on_message(self, *args, **kwargs):
        try:
            return asyncio.ensure_future(PerspectiveHandlerBase.on_message(self, *args, **kwargs))
        except (WebSocketClosedError, KeyboardInterrupt):
            # ignore error
            self.on_close()

    async def write_message(self, message: str, binary: bool = False) -> None:
        try:
            return await WebSocketHandler.write_message(self, message=message, binary=binary)
        except WebSocketClosedError:
            # ignore error
            self.on_close()

    # Use common docstring
    __init__.__doc__ = PerspectiveHandlerBase.__init__.__doc__
