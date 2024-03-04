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

from starlette.websockets import WebSocketDisconnect
from .common import PerspectiveHandlerBase


class PerspectiveStarletteHandler(PerspectiveHandlerBase):
    """PerspectiveStarletteHandler is a drop-in implementation of Perspective.

    The Perspective client and server will automatically keep the Websocket
    alive without timing out.

    Examples:
        >>> MANAGER = PerspectiveManager()
        >>> MANAGER.host_table("data_source_one", Table(
        ...     pd.read_csv("superstore.csv")))
        >>> app = FastAPI()
        >>> async def endpoint(websocket: Websocket):
        ...     handler = PerspectiveStarletteHandler(manager, websocket)
        ...     await handler.run()
        ... app.add_api_websocket_route('/websocket', endpoint)
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._websocket = kwargs["websocket"]

    async def run(self) -> None:
        try:
            await self._websocket.accept()
            while True:
                message = await self._websocket.receive()
                self._websocket._raise_on_disconnect(message)
                if "text" in message:
                    await self.on_message(message["text"])
                if "bytes" in message:
                    await self.on_message(message["bytes"])
        finally:
            self.on_close()

    async def write_message(self, message: str, binary: bool = False) -> None:
        try:
            if binary:
                await self._websocket.send_bytes(message)
            else:
                await self._websocket.send_text(message)
        except WebSocketDisconnect:
            # ignore error
            ...

    # Use common docstring
    __init__.__doc__ = PerspectiveHandlerBase.__init__.__doc__
