# python-remote-client

This example connects a `perspective-python` client to a `perspective-python`
server running in a separate process, over a WebSocket.

- `server.py` hosts a `Table` named `orders` behind a Tornado
  `PerspectiveTornadoHandler`, and adds five rows to it every second.
- `client.py` connects a `perspective.AsyncClient` to that server, opens the
  hosted `Table`, adds a row of its own, and prints a grouped `View` every time
  the server reports an update.

Start the server and the client in two terminals, from the repository root:

```bash
pnpm run start python-remote-client
```

```bash
pnpm run -F python-remote-client client
```

The client exits when the server closes the connection.

<span class="warning">
This example will not work outside the Perspective source tree! You will need a working local Perspective build to run it.
</span>
