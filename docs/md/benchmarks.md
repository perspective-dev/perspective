# Benchmarks

<!-- description: Perspective's published benchmark results for every release, explorable live in the browser, plus what the suite measures — table construction, streaming updates, pivots, expressions, joins and serialization in JavaScript/WebAssembly and Python — and how to reproduce it. -->

Perspective's performance is tracked by a benchmark suite which lives in the
repository. CI runs it on every tagged release and attaches the raw results to
that
[GitHub release](https://github.com/perspective-dev/perspective/releases/latest)
as Apache Arrow files — and the results are, naturally, explored in
Perspective.

## Results

Open the published results for the latest release, live in your browser:

| Build | Dashboard | By release | Raw data |
| --- | --- | --- | --- |
| JavaScript (WebAssembly engine under Node.js) | [Benchmarks — JavaScript](https://perspective-dev.github.io/gallery/benchmarks-js.html) | [History](https://perspective-dev.github.io/gallery/benchmarks-js-history.html) | [`benchmark-js.arrow`](https://github.com/perspective-dev/perspective/releases/latest/download/benchmark-js.arrow) |
| Python (native engine, driven over WebSocket) | [Benchmarks — Python](https://perspective-dev.github.io/gallery/benchmarks-python.html) | [History](https://perspective-dev.github.io/gallery/benchmarks-python-history.html) | [`benchmark-python.arrow`](https://github.com/perspective-dev/perspective/releases/latest/download/benchmark-python.arrow) |

Each file holds one row per timed iteration:

| Column | Meaning |
| --- | --- |
| `benchmark` | The case, e.g. `.view({group_by})` |
| `version` | The Perspective release the case ran against |
| `version_idx` | Release order; `0` is the build being released |
| `real_time`, `cpu_time`, `user_time`, `system_time` | Microseconds |
| `outlier` | `true` when the iteration falls outside 1.5 × the interquartile range of its case |

The dashboards are ordinary Perspective views over that file — mean
`real_time` in milliseconds, excluding outliers, grouped by `benchmark` and
`version` — so they can be re-pivoted, filtered to one case, or switched to
another chart type in place.

**Environment.** Results are produced by GitHub Actions on an `ubuntu-22.04`
x86_64 hosted runner with Node.js 22 and Python 3.11, over the Superstore
sample dataset. Hosted runners are shared, modest machines: read these numbers
as a release-over-release trend on constant hardware, not as the ceiling for
your own.

## What is measured

The cross-platform suite (`tools/bench/cross_platform_suite.mjs`) defines the
cases, which are written against the `Client` API and so can be pointed at any
build of the engine:

| Area | Cases |
| --- | --- |
| Table construction | `table(arrow)`, `table(csv)`, `table(json)`, `table(columns)`, and `table(arrow, {limit})` |
| Streaming | `table.update(arrow)`, and `table.update(arrow)` with window columns active |
| Queries | `view()`, `view({group_by})`, `view({group_by, aggregates: "median"})`, `view({expressions})`, `view({windows})` |
| Joins | `join()` |
| Serialization | `to_arrow()`, `to_csv()`, `to_columns()`, `to_json()` |

A separate suite (`charts_suite.mjs`) measures chart rendering in a real
browser.

Each case is run repeatedly against the current build _and_ against
previously published releases, so every number can be read relative to the
versions before it. Results are written as Apache Arrow files under
`tools/bench/dist/`.

## Running it

From a built checkout of the
[repository](https://github.com/perspective-dev/perspective):

```bash
cd tools/bench
pnpm run bench_js
pnpm run bench_python
pnpm run bench_charts
```

## Reading results sensibly

- **Arrow is the fast path.** Loading Arrow avoids parsing and type inference;
  CSV and JSON construction times measure the parser as much as the engine.
- **Column types matter more than row count.** Numeric and datetime columns
  are fixed-width; string columns are dictionary-encoded and cost more to
  build and to group.
- **Updates scale with the delta.** The cost of `update()` on a table with
  active views is driven by the size of the update and the number of groups it
  touches, not by the size of the table.
- **WebAssembly is single-threaded per worker; native is not.** The Python,
  Node.js and Rust builds use a thread pool (`perspective.set_num_cpus()`), so
  native numbers are typically better than in-browser numbers for the same
  case.
- **Rendering is separate from querying.** The data grid draws only the cells
  in view, so a grid over ten million rows renders in the same time as one over
  ten thousand; the query is what scales.

For guidance on sizing, see
[Visualizing millions of rows in the browser](./use_cases/large_datasets.md).
