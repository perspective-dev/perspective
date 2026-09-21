# Summary

[What is Perspective](./perspective.md)

# Use cases

- [Real-time dashboards over WebSocket](./use_cases/real_time_dashboard.md)
- [Streaming pivot tables](./use_cases/streaming_pivot_table.md)
- [Visualizing millions of rows in the browser](./use_cases/large_datasets.md)
- [Trading blotters, order books and market data](./use_cases/market_data.md)
- [Interactive pivot tables and charts in Jupyter](./use_cases/jupyter.md)
- [A UI for DuckDB, ClickHouse and PostgreSQL](./use_cases/database_ui.md)
    - [Case study: a multi-billion row tick history in a browser tab with DuckLake and DuckDB-WASM](./use_cases/ducklake.md)
- [Embedded analytics in a web application](./use_cases/embedded_analytics.md)
- [LLM and agent-driven analytics](./use_cases/agent.md)

# Concepts

- [Data Architecture](./explanation/architecture.md)
    - [Client-only](./explanation/architecture/client_only.md)
    - [Client/Server replicated](./explanation/architecture/client_server.md)
    - [Server only](./explanation/architecture/server_only.md)
- [Virtual Servers](./explanation/virtual_servers.md)
- [`Table`](./explanation/table.md)
    - [Schema and column types](./explanation/table/schema.md)
    - [Loading data](./explanation/table/loading_data.md)
    - [Construct an empty `Table` from a schema](./explanation/table/constructing_schema.md)
    - [`index`, `limit` and `page_to_disk` options](./explanation/table/options.md)
    - [`update()` and `remove()` streaming methods](./explanation/table/update_and_remove.md)
    - [`clear()` and `replace()` start-over methods](./explanation/table/clear_and_replace.md)
- [`View`](./explanation/view.md)
    - [Querying data](./explanation/view/querying.md)
        - [Grouping and Pivots](./explanation/view/config/grouping_and_pivots.md)
        - [Selection and Ordering](./explanation/view/config/selection_and_ordering.md)
        - [`expressions`](./explanation/view/config/expressions.md)
        - [Window Columns](./explanation/view/config/windows.md)
    - [Advanced View Operations](./explanation/view/advanced.md)
- [`Join`](./explanation/join.md)
    - [Join Types](./explanation/join/join_types.md)
    - [Join Options](./explanation/join/options.md)
    - [Reactivity and Constraints](./explanation/join/reactivity.md)

# JavaScript

- [Installation and Module Structure](./how_to/javascript/installation.md)
- [Importing with or without a bundler](./how_to/javascript/importing.md)
- [`perspective` data engine library](./how_to/javascript/worker.md)
    - [Serializing data](./how_to/javascript/serializing.md)
    - [Cleaning up resources](./how_to/javascript/deleting.md)
    - [Hosting a `WebSocketServer` in Node.js](./how_to/javascript/nodejs_server.md)
    - [Customizing `perspective.worker()`](./how_to/javascript/custom_worker.md)
    - [Joining Tables](./how_to/javascript/join.md)
- [`perspective-viewer` Custom Element library](./how_to/javascript/viewer.md)
    - [Loading data](./how_to/javascript/loading_data.md)
    - [Theming](./how_to/javascript/theming.md)
    - [Saving and restoring UI state](./how_to/javascript/save_restore.md)
    - [Listening for events](./how_to/javascript/events.md)
    - [Plugin render limits](./how_to/javascript/plugin_settings.md)
    - [Map tile sources](./how_to/javascript/map_tile_sources.md)
    - [Configuring the LLM agent](./how_to/javascript/agent.md)
- [Virtual Servers](./how_to/javascript/virtual_server.md)
    - [DuckDB](./how_to/javascript/virtual_server/duckdb.md)
    - [ClickHouse](./how_to/javascript/virtual_server/clickhouse.md)
    - [Custom](./how_to/javascript/virtual_server/custom.md)
- [React Component](./how_to/javascript/react.md)

# Python

- [Overview](./explanation/python.md)
- [Installation](./how_to/python/installation.md)
- [Loading data into a `Table`](./how_to/python/table.md)
    - [`pandas`, `polars` and `pyarrow` integration](./how_to/python/table_data.md)
- [Callbacks and events](./how_to/python/callbacks.md)
- [Multithreading](./how_to/python/multithreading.md)
- [Hosting a WebSocket server](./how_to/python/websocket.md)
- [Joining Tables](./how_to/python/join.md)
- [`PerspectiveWidget` for JupyterLab](./how_to/python/jupyterlab.md)
- [Virtual Servers](./how_to/python/virtual_server.md)
    - [DuckDB](./how_to/python/virtual_server/duckdb.md)
    - [ClickHouse](./how_to/python/virtual_server/clickhouse.md)
    - [Polars](./how_to/python/virtual_server/polars.md)
    - [PostgreSQL](./how_to/python/virtual_server/postgres.md)
    - [Custom](./how_to/python/virtual_server/custom.md)

# Rust

- [Getting Started](./how_to/rust.md)

# Integrations

- [FastAPI and Starlette](./integrations/fastapi.md)
- [Next.js, Vue, Svelte and Angular](./integrations/frameworks.md)
- [Kafka and other message queues](./integrations/kafka.md)

# Tutorials

- [A `tornado` server in Python](./tutorials/python/tornado.md)

# API Reference

- [API Reference](./api_reference.md)

# Reference

- [Benchmarks](./benchmarks.md)
- [Glossary](./glossary.md)
- [FAQ](./FAQ.md)
