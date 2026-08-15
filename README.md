<br />

<a href="https://perspective-dev.github.io">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://github.com/perspective-dev/perspective/raw/master/docs/static/svg/perspective-logo-dark.svg?raw=true">
<img width="260" src="https://github.com/perspective-dev/perspective/raw/master/docs/static/svg/perspective-logo-light.svg?raw=true" />
</picture>
</a>
<br/><br/>

[![Build Status](https://img.shields.io/github/actions/workflow/status/perspective-dev/perspective/build.yaml?event=push&style=for-the-badge)](https://github.com/perspective-dev/perspective/actions/workflows/build.yaml)
[![npm](https://img.shields.io/npm/v/@perspective-dev/client.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/client)
[![PyPI](https://img.shields.io/pypi/v/perspective-python.svg?style=for-the-badge)](https://pypi.python.org/pypi/perspective-python)
[![crates.io](https://img.shields.io/crates/v/perspective?style=for-the-badge)](https://crates.io/crates/perspective)

Perspective is an interactive analytics and data visualization component for
large, real-time and streaming datasets. Build user-configurable reports,
dashboards, notebooks and applications, backed by a high-performance streaming
query engine that runs in-browser via WebAssembly or server-side in Python,
Node.js and Rust — or delegates to a database you already have.

<br/>
<a href="https://perspective-dev.github.io"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/collage.png" />
    <img src="https://perspective-dev.github.io/projects/light/collage.png" />
</picture></a>

## Features

- A data-reactive UI packaged as a
  [Custom Element](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements),
  with drag-and-drop query and layout configuration. Includes a virtual-scrolling,
  editable data grid, WebGL charting engine with 15+ chart types, tile-based
  geographic maps, full theme support, and [React](https://react.dev/) bindings.

- A fast, memory-efficient streaming query engine written in C++ and compiled
  for [WebAssembly](https://webassembly.org/) (including a 64-bit `memory64`
  build for in-browser datasets larger than 4GB),
  [Python](https://www.python.org/) and [Rust](https://www.rust-lang.org/).
  Tables update incrementally and views tick in real time, with reactive
  joins across tables, a columnar expression language based on
  [ExprTK](https://github.com/ArashPartow/exprtk), and read/write/streaming
  support for [Apache Arrow](https://arrow.apache.org/), CSV and JSON.

- A symmetric client/server architecture — the same Client API connects to an
  engine in-process, in a Web Worker, or remotely over WebSocket, with server
  bindings for Python (aiohttp, Starlette, Tornado), Node.js and Rust.
  Datasets can be mirrored to the browser for fluid interaction or virtualized
  server-side, streaming only what's visible.

- Virtual servers that run Perspective's UI directly on external engines like
  [DuckDB](https://duckdb.org/), [ClickHouse](https://clickhouse.com/) and
  [Polars](https://pola.rs/), translating view configurations into native
  queries — no ETL or data copy required.

- A [Jupyter](https://jupyter.org/) widget built on
  [anywidget](https://anywidget.dev/) and a Python client library for
  interactive data analysis in JupyterLab and other notebook environments.

## Documentation

- [Project Site](https://perspective-dev.github.io/)
- [User Guide](https://perspective-dev.github.io/guide/)
- JavaScript API
    - [`@perspective-dev/react` React Component](https://perspective-dev.github.io/react/index.html)
    - [`@perspective-dev/viewer` Web Component](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
    - [`@perspective-dev/client` Client (Browser)](https://perspective-dev.github.io/browser/modules/src_ts_perspective.browser.ts.html)
    - [`@perspective-dev/client` Client (Node.js)](https://perspective-dev.github.io/node/modules/src_ts_perspective.node.ts.html)
    - [`@perspective-dev/client` Clickhouse Virtual Server](https://perspective-dev.github.io/browser/modules/dist_esm_virtual_servers_clickhouse.js.html)
    - [`@perspective-dev/client` DuckDB Virtual Server](https://perspective-dev.github.io/browser/modules/dist_esm_virtual_servers_duckdb.js.html)
- Python API
    - [`perspective`](https://perspective-dev.github.io/python/index.html)
    - [`perspective.widget`](https://perspective-dev.github.io/python/perspective/widget.html)
    - [`perspective.handlers.aiohttp`](https://perspective-dev.github.io/python/perspective/handlers/aiohttp.html)
    - [`perspective.handlers.starlette`](https://perspective-dev.github.io/python/perspective/handlers/starlette.html)
    - [`perspective.handlers.tornado`](https://perspective-dev.github.io/python/perspective/handlers/tornado.html)
    - [`perspective.virtual_servers.clickhouse`](https://perspective-dev.github.io/python/perspective/virtual_servers/clickhouse.html)
    - [`perspective.virtual_servers.duckdb`](https://perspective-dev.github.io/python/perspective/virtual_servers/duckdb.html)
- Rust API
    - [`perspective`](https://docs.rs/perspective/latest/perspective/)


## Examples

<table>
<tbody>
<tr>
<td>Superstore</td><td>Workspace</td><td>Webcam</td>
</tr>
<tr>
<td><a href="https://perspective-dev.github.io/?project=superstore"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/superstore.png" /><img src="https://perspective-dev.github.io/projects/light/superstore.png" /></picture></a></td>
<td><a href="https://perspective-dev.github.io/?project=superstore-overview"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/superstore-overview.png" /><img src="https://perspective-dev.github.io/projects/light/superstore-overview.png" /></picture></a></td>
<td><a href="https://perspective-dev.github.io/?project=webcam-video-wall"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/webcam-video-wall.png" /><img src="https://perspective-dev.github.io/projects/light/webcam-video-wall.png" /></picture></a></td>
</tr>
<tr>
<td>Raycasting</td><td>Market</td><td>NYPD</td>
</tr>
<tr>
<td><a href="https://perspective-dev.github.io/?project=raycasting"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/raycasting.png" /><img src="https://perspective-dev.github.io/projects/light/raycasting.png" /></picture></a></td>
<td><a href="https://perspective-dev.github.io/?project=market-trading-desk"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/market-trading-desk.png" /><img src="https://perspective-dev.github.io/projects/light/market-trading-desk.png" /></picture></a></td>
<td><a href="https://perspective-dev.github.io/?project=nypd-4"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/nypd-4.png" /><img src="https://perspective-dev.github.io/projects/light/nypd-4.png" /></picture></a></td>
</tr>
<tr>
<td>Movies</td><td>Evictions</td><td>Fractal</td>
</tr>
<tr>
<td><a href="https://perspective-dev.github.io/?project=movies"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/movies.png" /><img src="https://perspective-dev.github.io/projects/light/movies.png" /></picture></a></td>
<td><a href="https://perspective-dev.github.io/?project=evictions-2"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/evictions-2.png" /><img src="https://perspective-dev.github.io/projects/light/evictions-2.png" /></picture></a></td>
<td><a href="https://perspective-dev.github.io/?project=fractal"><picture><source media="(prefers-color-scheme: dark)" srcset="https://perspective-dev.github.io/projects/dark/fractal.png" /><img src="https://perspective-dev.github.io/projects/light/fractal.png" /></picture></a></td>
</tr>
</tbody>
</table>

## Media

<table><tbody>
<tr>
<td><a href="https://github.com/timkpaine"><code>@timkpaine</code></a></td>
<td><a href="https://github.com/timbess"><code>@timbess</code></a></td>
<td><a href="https://github.com/sc1f"><code>@sc1f</code></a></td>
</tr>
<tr>
<td><a href="https://www.youtube.com/watch?v=v5Y5ftlGNhU"><img width="240" src="https://img.youtube.com/vi/v5Y5ftlGNhU/0.jpg" /></a></td>
<td><a href="https://www.youtube.com/watch?v=lDpIu4dnp78"><img width="240" src="https://img.youtube.com/vi/lDpIu4dnp78/0.jpg" /></a></td>
<td><a href="https://www.youtube.com/watch?v=IO-HJsGdleE"><img width="240"  src="https://img.youtube.com/vi/IO-HJsGdleE/0.jpg" /></a></td>
</tr>
<tr>
<td><a href="https://github.com/texodus"><code>@texodus</code></a></td>
<td><a href="https://github.com/texodus"><code>@texodus</code></a></td>
<td></td>
</tr>
<tr>
<td><a href="https://www.youtube.com/watch?v=no0qChjvdgQ"><img width="240" src="https://img.youtube.com/vi/no0qChjvdgQ/0.jpg" /></a></td>
<td><a href="https://www.youtube.com/watch?v=0ut-ynvBpGI"><img width="240" src="https://img.youtube.com/vi/0ut-ynvBpGI/0.jpg" /></a></td>
<td></td>
</tr>
</tbody></table><br/><br/>

---


<br/>
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://github.com/openjs-foundation/artwork/raw/master/openjs_foundation/openjs_foundation-logo-horizontal-white.svg?raw=true">
<img width="200" src="https://github.com/openjs-foundation/artwork/raw/master/openjs_foundation/openjs_foundation-logo-horizontal-black.svg?raw=true">
</picture>
<br/>
<br/>
<br/>

The Perspective project is a member of the
[The OpenJS Foundation](https://openjsf.org/).

Copyright [OpenJS Foundation](https://openjsf.org) and Perspective contributors.
All rights reserved. The [OpenJS Foundation](https://openjsf.org) has registered
trademarks and uses trademarks. For a list of trademarks of the
[OpenJS Foundation](https://openjsf.org), please see our
[Trademark Policy](https://trademark-policy.openjsf.org/) and
[Trademark List](https://trademark-list.openjsf.org/). Trademarks and logos not
indicated on the
[list of OpenJS Foundation trademarks](https://trademark-list.openjsf.org) are
trademarks™ or registered® trademarks of their respective holders. Use of them
does not imply any affiliation with or endorsement by them.

[The OpenJS Foundation](https://openjsf.org/) |
[Terms of Use](https://terms-of-use.openjsf.org/) |
[Privacy Policy](https://privacy-policy.openjsf.org/) |
[Bylaws](https://bylaws.openjsf.org/) |
[Code of Conduct](https://code-of-conduct.openjsf.org) |
[Trademark Policy](https://trademark-policy.openjsf.org/) |
[Trademark List](https://trademark-list.openjsf.org/) |
[Cookie Policy](https://www.linuxfoundation.org/cookies/)
