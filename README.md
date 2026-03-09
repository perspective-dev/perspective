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

<br/>

Perspective is an interactive analytics and data visualization component for
large and streaming datasets. Build user-configurable reports, dashboards,
notebooks, and applications with a high-performance query engine compiled to
WebAssembly, Python, and Rust.

## Features

- A framework-agnostic user interface packaged as a
  [Custom Element](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements),
  which connects to a Data Model in-browser (via WebAssembly) or remotely (via
  WebSocket, with integration in Python, Node.js and Rust). Includes a data
  grid, 10+ chart types line, bar, area, scatter, heatmap, treemap, sunburst,
  candlestick, and more.

- A Data Model API for pluggable engines, enabling Perspective's UI to query
  external data sources like [DuckDB](https://duckdb.org/) while translating
  view configurations into native queries.

- A fast, memory-efficient streaming Data Model built-in, written in C++ and
  compiled for [WebAssembly](https://webassembly.org/),
  [Python](https://www.python.org/), and [Rust](https://www.rust-lang.org/).
  Supports read/write/streaming for [Apache Arrow](https://arrow.apache.org/),
  with a columnar expression language based on
  [ExprTK](https://github.com/ArashPartow/exprtk).

- A [JupyterLab](https://jupyter.org/) widget and Python client library for
  interactive data analysis in notebooks.

## Documentation

- [Project Site](https://perspective-dev.github.io/)
- [User Guide](https://perspective-dev.github.io/guide/)
- JavaScript API
    - [`@perspective-dev/client` Browser](https://perspective-dev.github.io/browser/modules/src_ts_perspective.browser.ts.html)
    - [`@perspective-dev/client` Node.js](https://perspective-dev.github.io/node/modules/src_ts_perspective.node.ts.html)
    - [`@perspective-dev/client` Clickhouse Virtual Server](https://perspective-dev.github.io/browser/modules/dist_esm_virtual_servers_clickhouse.js.html)
    - [`@perspective-dev/client` DuckDB Virtual Server](https://perspective-dev.github.io/browser/modules/dist_esm_virtual_servers_duckdb.js.html)
    - [`@perspective-dev/viewer` Web Component](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
- Python API
    - [`perspective`](https://perspective-dev.github.io/python/index.html)
    - [`perspective.widget`](https://perspective-dev.github.io/python/perspective/widget.html)
    - [`perspective.handlers.aiohttp`](https://perspective-dev.github.io/python/perspective/handlers/aiohttp.html)
    - [`perspective.handlers.starlette`](https://perspective-dev.github.io/python/perspective/handlers/starlett.html)
    - [`perspective.handlers.tornado`](https://perspective-dev.github.io/python/perspective/handlers/tornado.html)
    - [`perspective.virtual_servers.clickhouse`](https://perspective-dev.github.io/python/perspective/virtual_servers/clickhouse.html)
    - [`perspective.virtual_servers.duckdb`](https://perspective-dev.github.io/python/perspective/virtual_servers/duckdb.html)
- Rust API
    - [`perspective`](https://docs.rs/perspective/latest/perspective/)
    - [`perspective-client`](https://docs.rs/perspective-client/latest/perspective_client/)
    - [`perspective-server`](https://docs.rs/perspective-server/latest/perspective_server/)
    - [`perspective-python`](https://docs.rs/perspective-python/latest/perspective_python/)
    - [`perspective-js`](https://docs.rs/perspective-js/latest/perspective_js/)
    - [`perspective-viewer`](https://docs.rs/perspective-viewer/latest/perspective_viewer/)

## Examples

<!-- Examples -->
<table><tbody><tr><td>editable</td><td>file</td><td>duckdb</td></tr><tr><td><a href="https://perspective-dev.github.io/block?example=editable"><img height="125" src="https://perspective-dev.github.io/blocks/editable/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=file"><img height="125" src="https://perspective-dev.github.io/blocks/file/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=duckdb"><img height="125" src="https://perspective-dev.github.io/blocks/duckdb/preview.png?" /></a></td></tr><tr><td>fractal</td><td>market</td><td>raycasting</td></tr><tr><td><a href="https://perspective-dev.github.io/block?example=fractal"><img height="125" src="https://perspective-dev.github.io/blocks/fractal/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=market"><img height="125" src="https://perspective-dev.github.io/blocks/market/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=raycasting"><img height="125" src="https://perspective-dev.github.io/blocks/raycasting/preview.png?" /></a></td></tr><tr><td>evictions</td><td>nypd</td><td>streaming</td></tr><tr><td><a href="https://perspective-dev.github.io/block?example=evictions"><img height="125" src="https://perspective-dev.github.io/blocks/evictions/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=nypd"><img height="125" src="https://perspective-dev.github.io/blocks/nypd/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=streaming"><img height="125" src="https://perspective-dev.github.io/blocks/streaming/preview.png?" /></a></td></tr><tr><td>covid</td><td>webcam</td><td>movies</td></tr><tr><td><a href="https://perspective-dev.github.io/block?example=covid"><img height="125" src="https://perspective-dev.github.io/blocks/covid/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=webcam"><img height="125" src="https://perspective-dev.github.io/blocks/webcam/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=movies"><img height="125" src="https://perspective-dev.github.io/blocks/movies/preview.png?" /></a></td></tr><tr><td>superstore</td><td>olympics</td><td>dataset</td></tr><tr><td><a href="https://perspective-dev.github.io/block?example=superstore"><img height="125" src="https://perspective-dev.github.io/blocks/superstore/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=olympics"><img height="125" src="https://perspective-dev.github.io/blocks/olympics/preview.png?" /></a></td><td><a href="https://perspective-dev.github.io/block?example=dataset"><img height="125" src="https://perspective-dev.github.io/blocks/dataset/preview.png?" /></a></td></tr></tbody></table>
<!-- Examples -->

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
