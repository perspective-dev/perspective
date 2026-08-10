# Virtual Servers

Perspective's Virtual Server feature lets you connect `<perspective-viewer>` to
external data sources without loading data into Perspective's built-in engine.
Instead, queries are translated and executed natively by the external database.

For a detailed explanation of how virtual servers work, see the
[Virtual Servers](../../explanation/virtual_servers.md) concepts page.

Perspective ships with built-in virtual server implementations for:

- [**DuckDB**](./virtual_server/duckdb.md) — query DuckDB databases using the
  `duckdb` Python package.
- [**ClickHouse**](./virtual_server/clickhouse.md) — query a ClickHouse server
  using the `clickhouse-connect` Python package.
- [**Polars**](./virtual_server/polars.md) — query in-memory Polars DataFrames
  using the `polars` Python package.
- [**PostgreSQL**](./virtual_server/postgres.md) — query a PostgreSQL server
  (16 or later) using the `psycopg` Python package.

You can also [**implement your own**](./virtual_server/custom.md) virtual server
to connect Perspective to any data source by subclassing `VirtualServerHandler`.
