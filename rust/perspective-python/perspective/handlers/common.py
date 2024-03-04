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
from abc import ABC, abstractmethod
import functools

from ..core.exception import PerspectiveError


class PerspectiveHandlerBase(ABC):
    def __init__(self, **kwargs):
        """Create a new instance of the PerspectiveHandlerBase with the
        given Manager instance.

        Keyword Args:
            manager (:obj:`PerspectiveManager`): A `PerspectiveManager` instance.
                Must be provided on initialization.
            check_origin (:obj`bool`): If True, all requests will be accepted
                regardless of origin. Defaults to False.
            chunk_size (:obj:`int`): Binary messages will not exceed this length
                (in bytes);  payloads above this limit will be chunked
                across multiple messages. Defaults to `16_777_216` (16MB), and
                be disabled entirely with `None`.
        """
        self._manager = kwargs.pop("manager", None)
        if self._manager is None:
            raise PerspectiveError("A `PerspectiveManager` instance must be provided to the handler!")

        self._check_origin = kwargs.pop("check_origin", False)

        # uvicorn (used by aiohttp / starlette) defaults to 16MB max payload
        # https://github.com/encode/uvicorn/pull/995/files
        # https://github.com/euri10/uvicorn/blob/8a9369439c15a657a7726eb291858f72d3199c60/tests/protocols/test_websocket.py#L463
        self._chunk_size = kwargs.pop("chunk_size", 16_777_216)

        # https://www.tornadoweb.org/en/stable/gen.html#tornado.gen.moment
        self._chunk_sleep = kwargs.pop("_chunk_sleep", 0)

        self._session = self._manager.new_session()
        self._stream_lock = asyncio.Lock()

    def check_origin(self, origin):
        """Returns whether the handler allows requests from origins outside
        of the host URL.

        Args:
            origin (:obj"`bool`): a boolean that indicates whether requests
                outside of the host URL should be accepted. If :obj:`True`, request
                URLs will not be validated and all requests will be allowed.
                Defaults to :obj:`False`.
        """
        return self._check_origin

    def _session_callback(self, loop, *args, **kwargs):
        return asyncio.run_coroutine_threadsafe(self.post(*args, **kwargs), loop)

    async def on_message(self, message):
        """When the websocket receives a message, send it to the :obj:`process`
        method of the `PerspectiveManager` with a reference to the :obj:`post`
        callback.
        """
        if message == "ping":
            # Respond to ping heartbeats from the Websocket client.
            await self.post("pong")
            return

        loop = asyncio.get_event_loop()
        self._session.process(message, functools.partial(self._session_callback, loop))

    async def post(self, message, binary=False):
        """When `post` is called by `PerspectiveManager`, serialize the data to
        JSON and send it to the client.

        Args:
            message (:obj:`str`): a JSON-serialized string containing a message to the
                front-end `perspective-viewer`.
        """
        # Only send message in chunks if it passes the threshold set by the
        # `PerspectiveManager`.
        chunked = len(message) > self._chunk_size

        async with self._stream_lock:
            if binary and chunked:
                start = 0

                while start < len(message):
                    end = start + self._chunk_size
                    if end >= len(message):
                        end = len(message)

                    await asyncio.ensure_future(self.write_message(message[start:end], binary=True))

                    start = end

                    # Allow the loop to process heartbeats so that client sockets don't
                    # get closed in the middle of sending a chunk.
                    await asyncio.sleep(self._chunk_sleep)
            else:
                await self.write_message(message, binary)

    def on_close(self):
        """Remove the views associated with the client when the websocket
        closes.
        """
        self._session.close()

    @abstractmethod
    async def write_message(self, message: str, binary: bool = False) -> None:
        """Websocket-specific implementation of writing a message to the websocket client.
        Must support writing either text or binary messages. Should only be called by this
        class's `post` function, which handles all the perspective-specific logic

        Args:
            message (str): the message to write
            binary (bool, optional): whether or not to write as binary buffer
        """
