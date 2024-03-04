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

from aiohttp import web, WSMsgType, WebSocketError

from .common import PerspectiveHandlerBase


class PerspectiveAIOHTTPHandler(PerspectiveHandlerBase):
    """PerspectiveAIOHTTPHandler is a drop-in implementation of Perspective.

    Use it inside AIOHTTP routing to create a server-side Perspective that is
    ready to receive websocket messages from the front-end `perspective-viewer`.

    The Perspective client and server will automatically keep the Websocket
    alive without timing out.

    Examples:
        >>> manager = PerspectiveManager()
        >>> async def websocket_handler(request):
        ...    handler = PerspectiveAIOHTTPHandler(manager=manager, request=request)
        ...    await handler.run()

        >>> app = web.Application()
        >>> app.router.add_get("/websocket", websocket_handler)
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._request = kwargs.get("request")

    async def run(self) -> None:
        try:
            self._ws = web.WebSocketResponse()
            await self._ws.prepare(self._request)

            async for msg in self._ws:
                if msg.type == WSMsgType.TEXT:
                    await self.on_message(msg.data)
                if msg.type == WSMsgType.BINARY:
                    await self.on_message(msg.data)
        finally:
            self.on_close()

    async def write_message(self, message: str, binary: bool = False) -> None:
        try:
            if binary:
                await self._ws.send_bytes(message)
            else:
                await self._ws.send_str(message)
        except WebSocketError:
            # Ignore error
            ...

    # Use common docstring
    __init__.__doc__ = PerspectiveHandlerBase.__init__.__doc__
