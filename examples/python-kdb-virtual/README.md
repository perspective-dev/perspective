# kdb+ Virtual Server example

Serves a `<perspective-viewer>` backed by a **kdb+** process, via the
[kdb+ virtual server](../../docs/md/how_to/python/virtual_server/kdb.md).

## Prerequisites

A running q process listening on a port. Nothing needs to be in it — this
example loads the superstore dataset over IPC on startup.

```bash
pip install pykx tornado
```

[PyKX](https://code.kx.com/pykx/) connects over IPC in its **unlicensed
mode**, so no kdb+ license is required by this process — only by the q you
connect to.

## Running

```bash
pnpm start
```

Then open <http://localhost:3000>.

Point elsewhere with `PSP_KDB_HOST` / `PSP_KDB_PORT`:

```bash
PSP_KDB_PORT=5010 pnpm start
```
