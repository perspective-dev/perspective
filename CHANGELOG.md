# [v4.3.0](https://github.com/perspective-dev/perspective/releases/tag/v4.3.0)

_3 March 2026_ ([Full changelog](https://github.com/finos/perspective/compare/v4.2.0...v4.3.0))

Features

- `polars` Virtual Server [#3125](https://github.com/finos/perspective/pull/3125)
- Fix `split_by` support for rollups in generic SQL [#3127](https://github.com/finos/perspective/pull/3127)

Fixes

- Fix view conflation test timeout [#3126](https://github.com/finos/perspective/pull/3126)

Misc

- Add virtual server docs [#3124](https://github.com/finos/perspective/pull/3124)
- Relax React version [#3131](https://github.com/finos/perspective/pull/3131)
- ci: Revert to mainline actions-setup-cmake [#3130](https://github.com/finos/perspective/pull/3130)
- Move to Windows 2025 CI [#3123](https://github.com/finos/perspective/pull/3123)

# [v4.2.0](https://github.com/perspective-dev/perspective/releases/tag/v4.2.0)

_14 February 2026_ ([Full changelog](https://github.com/finos/perspective/compare/v4.1.1...v4.2.0))

**Breaking**

- Upgrade toolchain [#3118](https://github.com/finos/perspective/pull/3118)

Features

- Clickhouse Virtual Server [#3119](https://github.com/finos/perspective/pull/3119)

Fixes

- Fix `null` equality bug [#3115](https://github.com/finos/perspective/pull/3115)

Misc

- Fix compatibility with recent crates [#3122](https://github.com/finos/perspective/pull/3122)
- Better TypeScript types for `viewer-datagrid` [#3116](https://github.com/finos/perspective/pull/3116)

# [v4.1.1](https://github.com/perspective-dev/perspective/releases/tag/v4.1.1)

_2 February 2026_ ([Full changelog](https://github.com/finos/perspective/compare/v4.1.0...v4.1.1))

Fixes

- Fix virtual server error handling [#3114](https://github.com/finos/perspective/pull/3114)
- Fix `perspective-workspace` context submenu for tables [#3113](https://github.com/finos/perspective/pull/3113)

# [v4.1.0](https://github.com/perspective-dev/perspective/releases/tag/v4.1.0)

_27 January 2026_ ([Full changelog](https://github.com/finos/perspective/compare/v4.0.1...v4.1.0))

**Breaking**

- Add `table` to `ViewerConfig` [#3107](https://github.com/finos/perspective/pull/3107)

Features

- DuckDB Virtual Server [#3062](https://github.com/finos/perspective/pull/3062)

Fixes

- Support `client.table(view)` in Python [#3112](https://github.com/finos/perspective/pull/3112)
- Fix Arrow decimal type conversion to float instead of integer [#3099](https://github.com/finos/perspective/pull/3099)
- Fix viewport scroll regression in datagrid [#3098](https://github.com/finos/perspective/pull/3098)

Misc

- `&lt;PerspectiveWorkspace&gt;` React component [#3109](https://github.com/finos/perspective/pull/3109)
- Fix windows Python builds [#3110](https://github.com/finos/perspective/pull/3110)
- Convert `viewer-datagrid` to TypeScript [#3108](https://github.com/finos/perspective/pull/3108)

# [v4.0.1](https://github.com/perspective-dev/perspective/releases/tag/v4.0.1)

_15 December 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v4.0.0...v4.0.1))

Features

- Build arm64/aarch64 Linux wheels [#3092](https://github.com/finos/perspective/pull/3092)

Fixes

- Fix "Export to HTML" feature in `@perspective-dev/viewer` component [#3095](https://github.com/finos/perspective/pull/3095)
- Support a wider array of integers [#3084](https://github.com/finos/perspective/pull/3084)
- Prevent homebrew resolution [#3083](https://github.com/finos/perspective/pull/3083)
- Fix `datetime` filters against numeric parameters [#3081](https://github.com/finos/perspective/pull/3081)
- Fix workspace special casing issue [#3066](https://github.com/finos/perspective/pull/3066)

Misc

- OpenJS onboarding pt.2 [#3087](https://github.com/finos/perspective/pull/3087)
- Publish `@perspective-dev/server` package in CI [#3078](https://github.com/finos/perspective/pull/3078)

# [v4.0.0](https://github.com/perspective-dev/perspective/releases/tag/v4.0.0)

_28 October 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.8.0...v4.0.0))

**Breaking**

- Move to OpenJS Foundation [#3073](https://github.com/finos/perspective/pull/3073)

Fixes

- Fix `View::expand`, `View::collapse` unlocked server section [#3074](https://github.com/finos/perspective/pull/3074)
- Fix concurrent update/view creation segfault [#3068](https://github.com/finos/perspective/pull/3068)
- Fix plugins which inherit from `perspective-viewer-datagrid` [#3064](https://github.com/finos/perspective/pull/3064)
- Fix jupyterlab renderers [#3059](https://github.com/finos/perspective/pull/3059)
- Fix `aggregates` field in `View::get_config` [#3053](https://github.com/finos/perspective/pull/3053)

Misc

- Correct images to correspond to architecture explanations [#3067](https://github.com/finos/perspective/pull/3067)
- Disable `pnpm` post install scripts and fix `pnpm audit` dependencies [#3054](https://github.com/finos/perspective/pull/3054)

# [v3.8.0](https://github.com/perspective-dev/perspective/releases/tag/v3.8.0)

_2 September 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.7.4...v3.8.0))

**Breaking**

- Better `features` support [#3049](https://github.com/finos/perspective/pull/3049)
- Update column paths when the colun set changes in `perspective-viewer-datagrid` [#3047](https://github.com/finos/perspective/pull/3047)

Fixes

- Fix concurrent `HTMLPerspectiveViewerElement::load` error [#3045](https://github.com/finos/perspective/pull/3045)
- Fix `null` handling for cast ExprTK functions [#3040](https://github.com/finos/perspective/pull/3040)

Misc

- Fix Workspace.removeTable() [#3048](https://github.com/finos/perspective/pull/3048)
- Move C++ source to `perspective-server` crate [#3038](https://github.com/finos/perspective/pull/3038)
- Remove blog links [#3043](https://github.com/finos/perspective/pull/3043)
- Add API docs for `perspective-react` [#3037](https://github.com/finos/perspective/pull/3037)

# [v3.7.4](https://github.com/perspective-dev/perspective/releases/tag/v3.7.4)

_20 July 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.7.3...v3.7.4))

Features

- Upgrade `Client::system_info` [#3036](https://github.com/finos/perspective/pull/3036)

# [v3.7.3](https://github.com/perspective-dev/perspective/releases/tag/v3.7.3)

_13 July 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.7.2...v3.7.3))

Features

- Expose `null` cell style for `perspective-viewer-datagrid` [#3032](https://github.com/finos/perspective/pull/3032)

Fixes

- Fix thread safety of multiple `Server` instances in the same process [#3034](https://github.com/finos/perspective/pull/3034)

# [v3.7.2](https://github.com/perspective-dev/perspective/releases/tag/v3.7.2)

_8 July 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.7.1...v3.7.2))

Fixes

- Fix datagrid editing and add tests [#3030](https://github.com/finos/perspective/pull/3030)

Misc

- Refactor docs [#3029](https://github.com/finos/perspective/pull/3029)

# [v3.7.1](https://github.com/perspective-dev/perspective/releases/tag/v3.7.1)

_2 July 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.7.0...v3.7.1))

Fixes

- Fix global filter regression [#3025](https://github.com/finos/perspective/pull/3025)

Misc

- Fix dep version conflict with `rand` [#3024](https://github.com/finos/perspective/pull/3024)

# [v3.7.0](https://github.com/perspective-dev/perspective/releases/tag/v3.7.0)

_30 June 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.6.1...v3.7.0))

**Breaking**

- New error UX [#3003](https://github.com/finos/perspective/pull/3003)
- New conflation model [#2991](https://github.com/finos/perspective/pull/2991)
- `@finos/perspective-react` [#2893](https://github.com/finos/perspective/pull/2893)

Features

- Fix datagrid `abs` sorting on header click [#3014](https://github.com/finos/perspective/pull/3014)
- Add some native HTML attributes to `perspective-react` [#3010](https://github.com/finos/perspective/pull/3010)
- Add `max by` and `min by` aggregates [#2998](https://github.com/finos/perspective/pull/2998)

Fixes

- Fix UI bugs from large dataset example [#3022](https://github.com/finos/perspective/pull/3022)
- Fix `max_by`, `min_by`, `max`, `min` aggregates with empty filter sets [#3016](https://github.com/finos/perspective/pull/3016)
- Fix `to_arrow` thread safety [#3006](https://github.com/finos/perspective/pull/3006)
- Fix `perspective_viewer::restore` calls blurring [#3005](https://github.com/finos/perspective/pull/3005)
- Fix `ProxySession` message routing bug with Jupyter widget [#2989](https://github.com/finos/perspective/pull/2989)

Misc

- Fix typo in docs for replace_all [#3021](https://github.com/finos/perspective/pull/3021)
- Fix perspective-viewer-datagrid draw error when group_by+split_by+filter are empty [#3015](https://github.com/finos/perspective/pull/3015)
- Fix examples, docs and imports [#3013](https://github.com/finos/perspective/pull/3013)
- Fix Windows CI [#3004](https://github.com/finos/perspective/pull/3004)
- Add `aggregate_depth` datagrid style config [#3002](https://github.com/finos/perspective/pull/3002)
- `&lt;perspective-workspace&gt;` toolbar fix [#3000](https://github.com/finos/perspective/pull/3000)
- Nightly versions [#2990](https://github.com/finos/perspective/pull/2990)
- Nightly artifacts [#2987](https://github.com/finos/perspective/pull/2987)

# [v3.6.1](https://github.com/perspective-dev/perspective/releases/tag/v3.6.1)

_30 April 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.6.0...v3.6.1))

Fixes

- Fix line chart alt Y axis on zoom [#2986](https://github.com/finos/perspective/pull/2986)

# [v3.6.0](https://github.com/perspective-dev/perspective/releases/tag/v3.6.0)

_24 April 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.5.1...v3.6.0))

**Breaking**

- Fix `limit` overflow bug [#2983](https://github.com/finos/perspective/pull/2983)

# [v3.5.1](https://github.com/perspective-dev/perspective/releases/tag/v3.5.1)

_11 April 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.5.0...v3.5.1))

Features

- AsyncTable support in widget [#2974](https://github.com/finos/perspective/pull/2974)

Misc

- Add vscode settings to enable prettier [#2959](https://github.com/finos/perspective/pull/2959)

# [v3.5.0](https://github.com/perspective-dev/perspective/releases/tag/v3.5.0)

_10 April 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.4.3...v3.5.0))

Features

- Add API for keyboard copy from `perspective-viewer-datagrid` [#2975](https://github.com/finos/perspective/pull/2975)
- Update `limit` behavior to use incrementing `index` (fix `last_by_index` aggregate) [#2964](https://github.com/finos/perspective/pull/2964)

Fixes

- Fix support for browsers lacking the `SharedWorker` API [#2978](https://github.com/finos/perspective/pull/2978)
- Fix chart bug which rounds subsecond ticks [#2971](https://github.com/finos/perspective/pull/2971)
- Fix export-to-html in `perspective-viewer` [#2960](https://github.com/finos/perspective/pull/2960)

Misc

- Fix parallel_for and cleanup commented out code. [#2972](https://github.com/finos/perspective/pull/2972)

# [v3.4.3](https://github.com/perspective-dev/perspective/releases/tag/v3.4.3)

_20 March 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.4.2...v3.4.3))

Fixes

- Fix date filters in perspective-{select,click} events [#2957](https://github.com/finos/perspective/pull/2957)
- Invalidate viewer session before loading table [#2958](https://github.com/finos/perspective/pull/2958)

# [v3.4.2](https://github.com/perspective-dev/perspective/releases/tag/v3.4.2)

_14 March 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.4.1...v3.4.2))

Fixes

- Add timeouts to pytest, fix jupyterlab error [#2952](https://github.com/finos/perspective/pull/2952)

# [v3.4.1](https://github.com/perspective-dev/perspective/releases/tag/v3.4.1)

_12 March 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.4.0...v3.4.1))

Features

- Add `Client::on_hosted_tables_update` [#2948](https://github.com/finos/perspective/pull/2948)

Fixes

- Fix segfault in Python webservers [#2943](https://github.com/finos/perspective/pull/2943)

# [v3.4.0](https://github.com/perspective-dev/perspective/releases/tag/v3.4.0)

_6 March 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.3.4...v3.4.0))

Features

- Add connection error/retry API and UI support [#2902](https://github.com/finos/perspective/pull/2902)
- Add dedicated `Worker`, `SharedWorker` and `ServiceWorker` support [#2936](https://github.com/finos/perspective/pull/2936)
- Python AsyncClient and JS ProxySession [#2929](https://github.com/finos/perspective/pull/2929)
- Quartiles [#2930](https://github.com/finos/perspective/pull/2930)
- Fix `View::to_polars` and add `LargeUTF8` Arrow dictionary support [#2924](https://github.com/finos/perspective/pull/2924)

Fixes

- Show appropriate date when date is part of grouped data on chart. [#2857](https://github.com/finos/perspective/pull/2857)

Misc

- Shrink `d3fc` bundle [#2934](https://github.com/finos/perspective/pull/2934)

# [v3.3.4](https://github.com/perspective-dev/perspective/releases/tag/v3.3.4)

_9 February 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.3.3...v3.3.4))

Fixes

- Fix datagrid scroll drift on resize [#2919](https://github.com/finos/perspective/pull/2919)

# [v3.3.3](https://github.com/perspective-dev/perspective/releases/tag/v3.3.3)

_4 February 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.3.2...v3.3.3))

Misc

- Heap Profiling Tooling [#2913](https://github.com/finos/perspective/pull/2913)
- Fix API docs [#2910](https://github.com/finos/perspective/pull/2910)
- Support for pyodide 0.27.1, including pyarrow + pandas [#2901](https://github.com/finos/perspective/pull/2901)

# [v3.3.2](https://github.com/perspective-dev/perspective/releases/tag/v3.3.2)

_1 February 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.3.1...v3.3.2))

Features

- Fix overallocations [#2909](https://github.com/finos/perspective/pull/2909)

# [v3.3.1](https://github.com/perspective-dev/perspective/releases/tag/v3.3.1)

_26 January 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.3.0...v3.3.1))

Fixes

- Fix `date` formatting for `perspective-viewer-datagrid` plugin [#2904](https://github.com/finos/perspective/pull/2904)

# [v3.3.0](https://github.com/perspective-dev/perspective/releases/tag/v3.3.0)

_14 January 2025_ ([Full changelog](https://github.com/finos/perspective/compare/v3.2.1...v3.3.0))

**Breaking**

- Unbundled JavaScript builds [#2890](https://github.com/finos/perspective/pull/2890)

Misc

- Add build support for `Memory64` [#2888](https://github.com/finos/perspective/pull/2888)

# [v3.2.1](https://github.com/perspective-dev/perspective/releases/tag/v3.2.1)

_23 December 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.2.0...v3.2.1))

Features

- Better `datetime`/`date` string parsing performance [#2885](https://github.com/finos/perspective/pull/2885)
- Add `min` and `max` aggregates for `date` and `datetime` columns [#2884](https://github.com/finos/perspective/pull/2884)

Fixes

- Fix `ViewConfig` serialization for internal arrow types [#2883](https://github.com/finos/perspective/pull/2883)
- Fix memory corruption on filter text overflow [#2882](https://github.com/finos/perspective/pull/2882)

Misc

- Fix examples and cleanup CSS [#2886](https://github.com/finos/perspective/pull/2886)

# [v3.2.0](https://github.com/perspective-dev/perspective/releases/tag/v3.2.0)

_9 December 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.8...v3.2.0))

Features

- Support ndjson [#2873](https://github.com/finos/perspective/pull/2873)

Fixes

- Fix duplicate columns [#2872](https://github.com/finos/perspective/pull/2872)

# [v3.1.8](https://github.com/perspective-dev/perspective/releases/tag/v3.1.8)

_2 December 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.7...v3.1.8))

Fixes

- fix treemap rendering issue in firefox [#2813](https://github.com/finos/perspective/pull/2813)
- Allow for passthrough of event loop in psp webserver handlers [#2829](https://github.com/finos/perspective/pull/2829)
- Fix workspace dark theme, theme render bug [#2864](https://github.com/finos/perspective/pull/2864)

# [v3.1.7](https://github.com/perspective-dev/perspective/releases/tag/v3.1.7)

_30 November 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.6...v3.1.7))

Fixes

- Remove `workspace-layout-update` event debounce [#2862](https://github.com/finos/perspective/pull/2862)

Misc

- Add some information on JSON input formats [#2856](https://github.com/finos/perspective/pull/2856)

# [v3.1.6](https://github.com/perspective-dev/perspective/releases/tag/v3.1.6)

_18 November 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.5...v3.1.6))

Features

- Support input/output to/from polars via python (not native rust) [#2849](https://github.com/finos/perspective/pull/2849)

Fixes

- Fix empty Arrow `Table` constructor [#2854](https://github.com/finos/perspective/pull/2854)

Misc

- Check pyarrow import and make clear(er) error message [#2848](https://github.com/finos/perspective/pull/2848)

# [v3.1.5](https://github.com/perspective-dev/perspective/releases/tag/v3.1.5)

_15 November 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.4...v3.1.5))

Features

- Relax `Table` schema constructor [#2850](https://github.com/finos/perspective/pull/2850)

Fixes

- Fix `perspective-workspace` restore call on errored table [#2851](https://github.com/finos/perspective/pull/2851)
- Fix `integer` cast expression function [#2842](https://github.com/finos/perspective/pull/2842)
- Import importlib metadata submodule [#2841](https://github.com/finos/perspective/pull/2841)

Misc

- Update ExprTk [#2825](https://github.com/finos/perspective/pull/2825)
- sdist licensing follow ups [#2843](https://github.com/finos/perspective/pull/2843)

# [v3.1.4](https://github.com/perspective-dev/perspective/releases/tag/v3.1.4)

_7 November 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.3...v3.1.4))

Features

- Add back Table and View exports, make constructors throw like pyarrow.Table [#2831](https://github.com/finos/perspective/pull/2831)

Fixes

- Fixed workspace persistence structure symmetry [#2833](https://github.com/finos/perspective/pull/2833)
- Fix concurrent update segfault [#2835](https://github.com/finos/perspective/pull/2835)
- Fix `plugin` switch  [#2828](https://github.com/finos/perspective/pull/2828)

Misc

- Fix failed color range update [#2823](https://github.com/finos/perspective/pull/2823)
- CI sdist fixes, port conda patch, fix ODR violation [#2826](https://github.com/finos/perspective/pull/2826)

# [v3.1.3](https://github.com/perspective-dev/perspective/releases/tag/v3.1.3)

_31 October 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.2...v3.1.3))

Fixes

- Fix `perspective-python` sdist and add sdist tests to CI [#2817](https://github.com/finos/perspective/pull/2817)
- Fix workspace resize and related bugs [#2808](https://github.com/finos/perspective/pull/2808)
- fix aiohttp disconnect error on websockets [#2806](https://github.com/finos/perspective/pull/2806)
- Missing tooltip data [#2753](https://github.com/finos/perspective/pull/2753)
- Escape esbuild plugin's symbol replacement. [#2807](https://github.com/finos/perspective/pull/2807)
- Add aarch64 Mac runners to test_python, restore PSP_ARCH dev behavior [#2802](https://github.com/finos/perspective/pull/2802)

# [v3.1.2](https://github.com/perspective-dev/perspective/releases/tag/v3.1.2)

_22 October 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.1...v3.1.2))

Fixes

- Fix docs, inline builds, export, and workspace CSS [#2800](https://github.com/finos/perspective/pull/2800)
- arrow: Fix cross-compiling errors on macos [#2798](https://github.com/finos/perspective/pull/2798)

# [v3.1.1](https://github.com/perspective-dev/perspective/releases/tag/v3.1.1)

_18 October 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.1.0...v3.1.1))

Fixes

- &lt;TAB&gt; key press inserts '\t' character in code editor as indentation. [#2779](https://github.com/finos/perspective/pull/2779)
- Column type icon matches the datatype type of the field in column selectors (where, group by, sortby, filter) [#2780](https://github.com/finos/perspective/pull/2780)
- Fix filter values for non-interned strings [#2784](https://github.com/finos/perspective/pull/2784)

Misc

- Port Conda patches, use vendored boost [#2793](https://github.com/finos/perspective/pull/2793)
- Update documentation for `3.x` [#2778](https://github.com/finos/perspective/pull/2778)

# [v3.1.0](https://github.com/perspective-dev/perspective/releases/tag/v3.1.0)

_23 September 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.0.3...v3.1.0))

**Breaking**

- Python API changes from community [#2754](https://github.com/finos/perspective/pull/2754)

Features

- Allow `bytes` and `string` for JSON/CSV input data with `format` option [#2763](https://github.com/finos/perspective/pull/2763)

Fixes

- Fix cancellable methods in `perspective-viewer` [#2755](https://github.com/finos/perspective/pull/2755)

Misc

- Update `README.md`, examples and build dependencies [#2762](https://github.com/finos/perspective/pull/2762)
- Add Windows build for `perspective-rs` to CI [#2759](https://github.com/finos/perspective/pull/2759)
- Add Python benchmark suite for `3.x` [#2761](https://github.com/finos/perspective/pull/2761)
- Upgrade Apache Arrow C++ to 17.0.0 [#2749](https://github.com/finos/perspective/pull/2749)
- Emscripten wheel fixes [#2739](https://github.com/finos/perspective/pull/2739)

# [v3.0.3](https://github.com/perspective-dev/perspective/releases/tag/v3.0.3)

_3 September 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.0.2...v3.0.3))

Fixes

- Fix `perspective` crate, link `perspective-server` as static lib [#2734](https://github.com/finos/perspective/pull/2734)

Misc

- Support packaging in CI [#2735](https://github.com/finos/perspective/pull/2735)

# [v3.0.2](https://github.com/perspective-dev/perspective/releases/tag/v3.0.2)

_30 August 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.0.1...v3.0.2))

Fixes

- Fix link error in emscripten wheel [#2726](https://github.com/finos/perspective/pull/2726)
- Fix `PerspectiveTornadoHandler` misnamed `close()` [#2720](https://github.com/finos/perspective/pull/2720)
- fix: Doctype in html export [#2690](https://github.com/finos/perspective/pull/2690)

# [v3.0.1](https://github.com/perspective-dev/perspective/releases/tag/v3.0.1)

_25 August 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v3.0.0...v3.0.1))

Features

- Stringify Arrow lists [#2700](https://github.com/finos/perspective/pull/2700)
- Zstd decompression for arrows [#2717](https://github.com/finos/perspective/pull/2717)
- Better Timestamp Parsing [#2713](https://github.com/finos/perspective/pull/2713)

Misc

- Fix docs site serialized loading, docs.rs gen [#2718](https://github.com/finos/perspective/pull/2718)

# [v3.0.0](https://github.com/perspective-dev/perspective/releases/tag/v3.0.0)

_23 August 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v2.10.1...v3.0.0))

**Breaking**

- Perspective Virtual API (Python) [#2625](https://github.com/finos/perspective/pull/2625)
- Perspective Virtual API (JavaScript) [#2615](https://github.com/finos/perspective/pull/2615)

Features

- Add Pyodide support and split Rust/C++ builds for Python wheel [#2707](https://github.com/finos/perspective/pull/2707)
- Draw 0 axis prominently [#2698](https://github.com/finos/perspective/pull/2698)
- Calculate `group_by` in parallel [#2701](https://github.com/finos/perspective/pull/2701)
- `PerspectiveWidget` support for new Python API [#2658](https://github.com/finos/perspective/pull/2658)
- Use ABI3 for `perspective-python` shared library [#2661](https://github.com/finos/perspective/pull/2661)
- Add region, column and row selection modes to Perspective Datagrid [#2618](https://github.com/finos/perspective/pull/2618)

Fixes

- Fix missing icons [#2712](https://github.com/finos/perspective/pull/2712)
- Fix Windows JupyterLab packaging [#2705](https://github.com/finos/perspective/pull/2705)
- Fix Python `sdist`, update docs, add `lint` to CI [#2702](https://github.com/finos/perspective/pull/2702)

Misc

- Update `docusaurus` website and examples [#2708](https://github.com/finos/perspective/pull/2708)
- Update docs [#2706](https://github.com/finos/perspective/pull/2706)
- New status indicator [#2692](https://github.com/finos/perspective/pull/2692)
- Docs and examples update for new API [#2659](https://github.com/finos/perspective/pull/2659)

# [v2.10.1](https://github.com/perspective-dev/perspective/releases/tag/v2.10.1)

_23 May 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v2.10.0...v2.10.1))

Fixes

- Fix `delete()` Python async call not resolving [#2610](https://github.com/finos/perspective/pull/2610)
- Fix intermittent `to_arrow()` error in Python [#2608](https://github.com/finos/perspective/pull/2608)
- Fix compatibility with other MSVC versions by explicitly converting to string [#2570](https://github.com/finos/perspective/pull/2570)

Misc

- Signed-off-by: Andrew Stein &lt;steinlink@gmail.com&gt; [#2623](https://github.com/finos/perspective/pull/2623)
- Update contributing documentation for DCO [#2595](https://github.com/finos/perspective/pull/2595)
- Update to pyodide 0.25.1 for pyodide/pyodide#4655 [#2596](https://github.com/finos/perspective/pull/2596)

# [v2.10.0](https://github.com/perspective-dev/perspective/releases/tag/v2.10.0)

_25 March 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v2.9.0...v2.10.0))

Features

- Debug component [#2574](https://github.com/finos/perspective/pull/2574)
- Expression editor & filter UX updates [#2572](https://github.com/finos/perspective/pull/2572)

# [v2.9.0](https://github.com/perspective-dev/perspective/releases/tag/v2.9.0)

_12 March 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v2.8.1...v2.9.0))

**Breaking**

- Formatting for `float` and `integer` columns via `Intl.NumberFormat` [#2563](https://github.com/finos/perspective/pull/2563)

Features

- Localization Support [#2565](https://github.com/finos/perspective/pull/2565)

Fixes

- Fix get_hosted_table_names in Python client [#2551](https://github.com/finos/perspective/pull/2551)
- Fix Candlestick & OHLC charts [#2562](https://github.com/finos/perspective/pull/2562)

Misc

- Update Pyodide to version 0.25.0 [#2547](https://github.com/finos/perspective/pull/2547)

# [v2.8.1](https://github.com/perspective-dev/perspective/releases/tag/v2.8.1)

_26 February 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v2.8.0...v2.8.1))

Fixes

- Fix `split_by` with `date`/`datetime` columns [#2545](https://github.com/finos/perspective/pull/2545)

Misc

- Update to LLVM 17 & fix Python/Windows build [#2546](https://github.com/finos/perspective/pull/2546)
- Add `clang-format`, `clang-tidy` and `clangd` support for C++ development [#2541](https://github.com/finos/perspective/pull/2541)
- Add Docs Tests [#2502](https://github.com/finos/perspective/pull/2502)
- Add workspaceFolder to cargo_target_dir [#2537](https://github.com/finos/perspective/pull/2537)

# [v2.8.0](https://github.com/perspective-dev/perspective/releases/tag/v2.8.0)

_16 February 2024_ ([Full changelog](https://github.com/finos/perspective/compare/v2.7.1...v2.8.0))

Features

- New color selector component [#2536](https://github.com/finos/perspective/pull/2536)
- Render table in the shadow DOM for `@finos/perspective-viewer-datagrid` [#2482](https://github.com/finos/perspective/pull/2482)
- Add column edit highlight to `perspective-viewer-datagrid` [#2486](https://github.com/finos/perspective/pull/2486)

Fixes

- Bugfix - De-aggregating doesn't change column style type [#2535](https://github.com/finos/perspective/pull/2535)
- A few CSS fixes for regular-table in shadow DOM [#2526](https://github.com/finos/perspective/pull/2526)
- Settings panel width is inconsistent for columns moved to `Config` [#2527](https://github.com/finos/perspective/pull/2527)
- Fix datagrid scroll performance regression via `regular-table` upgrade [#2498](https://github.com/finos/perspective/pull/2498)
- Fix output scrolling in Jupyter when `perspective-python` is installed [#2495](https://github.com/finos/perspective/pull/2495)
- Fix datagrid cell pulse styling [#2489](https://github.com/finos/perspective/pull/2489)
- Update ipynb examples with new expression syntax [#2463](https://github.com/finos/perspective/pull/2463)
- Fix Jupyterlab Widget Save/Restore Symmetry [#2465](https://github.com/finos/perspective/pull/2465)

Misc

- Add `yew-fmt` [#2533](https://github.com/finos/perspective/pull/2533)
- Expression Names in Column Settings Header + Refactors [#2459](https://github.com/finos/perspective/pull/2459)
- Update `http-server` examples dependency [#2505](https://github.com/finos/perspective/pull/2505)
- Use a boost mirror [#2484](https://github.com/finos/perspective/pull/2484)
- Refactor How Column Style Components Are Selected [#2443](https://github.com/finos/perspective/pull/2443)
- Remove docs build from CI [#2483](https://github.com/finos/perspective/pull/2483)
- Add starting support for Typescript in perspective-viewer-d3fc package [#2432](https://github.com/finos/perspective/pull/2432)
- Fix cargo features [#2481](https://github.com/finos/perspective/pull/2481)
- Fix docs site [#2462](https://github.com/finos/perspective/pull/2462)

# [v2.7.1](https://github.com/perspective-dev/perspective/releases/tag/v2.7.1)

_29 November 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.7.0...v2.7.1))

Features

- Drag/drop UX for invalid positions [#2456](https://github.com/finos/perspective/pull/2456)

Fixes

- Fix `perspective-click` event for `"Treemap"` plugin [#2452](https://github.com/finos/perspective/pull/2452)
- Fix 2.7.0 Migration [#2444](https://github.com/finos/perspective/pull/2444)
- Better CSS build [#2451](https://github.com/finos/perspective/pull/2451)

Misc

- Fix Blocks build script execution [#2454](https://github.com/finos/perspective/pull/2454)

# [v2.7.0](https://github.com/perspective-dev/perspective/releases/tag/v2.7.0)

_20 November 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.6.1...v2.7.0))

**Breaking**

- X/Y Scatter Symbol Serialization as Dictionary [#2429](https://github.com/finos/perspective/pull/2429)
- Expressions API Updates [#2399](https://github.com/finos/perspective/pull/2399)

Features

- API Versioning + Migration [#2430](https://github.com/finos/perspective/pull/2430)
- `PerspectiveWidget` HTML export support in Jupyter [#2418](https://github.com/finos/perspective/pull/2418)
- Self-extracting WebAssembly binaries [#2428](https://github.com/finos/perspective/pull/2428)

Fixes

- Update `expressions` format default [#2438](https://github.com/finos/perspective/pull/2438)
- Serialize Expressions to Objects [#2436](https://github.com/finos/perspective/pull/2436)
- Column Settings Panel UI Tweaks [#2421](https://github.com/finos/perspective/pull/2421)
- Add support for StringDtype (fixes #1237) [#2319](https://github.com/finos/perspective/pull/2319)

Misc

- Update examples [#2433](https://github.com/finos/perspective/pull/2433)
- Fix expression alias UX/API [#2431](https://github.com/finos/perspective/pull/2431)
- Add CI requirements update script [#2422](https://github.com/finos/perspective/pull/2422)
- Upgrade `pyodide` compatibility to v0.24.1 [#2402](https://github.com/finos/perspective/pull/2402)

# [v2.6.1](https://github.com/perspective-dev/perspective/releases/tag/v2.6.1)

_1 November 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.6.0...v2.6.1))

Features

- Add `setAutoPause()` method [#2411](https://github.com/finos/perspective/pull/2411)

Fixes

- Fix scroll panel height calculation bug [#2404](https://github.com/finos/perspective/pull/2404)
- Fix `in` and `not in` filter UI bug [#2403](https://github.com/finos/perspective/pull/2403)

# [v2.6.0](https://github.com/perspective-dev/perspective/releases/tag/v2.6.0)

_20 October 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.5.2...v2.6.0))

Features

- X/Y scatter multi-chart [#2395](https://github.com/finos/perspective/pull/2395)
- Symbols column in `X/Y Scatter` plot [#2394](https://github.com/finos/perspective/pull/2394)
- New themes `Gruvbox` and `Dracula` + UI performance improvements [#2393](https://github.com/finos/perspective/pull/2393)
- Add `index()`, `col()`, and `vlookup()` to ExprTk [#2374](https://github.com/finos/perspective/pull/2374)
- Datagrid rows restyle [#2383](https://github.com/finos/perspective/pull/2383)

Fixes

- Column selector style updates [#2385](https://github.com/finos/perspective/pull/2385)
- fix gradient values [#2384](https://github.com/finos/perspective/pull/2384)

# [v2.5.2](https://github.com/perspective-dev/perspective/releases/tag/v2.5.2)

_8 October 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.5.1...v2.5.2))

Features

- Move styles to sidebar [#2366](https://github.com/finos/perspective/pull/2366)

Fixes

- fix some viewer bugs [#2371](https://github.com/finos/perspective/pull/2371)

Misc

- Fix tests [#2380](https://github.com/finos/perspective/pull/2380)
- Localize NYPD, Magic and Olympics examples [#2375](https://github.com/finos/perspective/pull/2375)

# [v2.5.1](https://github.com/perspective-dev/perspective/releases/tag/v2.5.1)

_31 August 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.5.0...v2.5.1))

Features

- Datagrid column header configuration UX update [#2351](https://github.com/finos/perspective/pull/2351)

Fixes

- Fix filter number validation with trailing zeroes [#2353](https://github.com/finos/perspective/pull/2353)
- Fix Jupyter plugin resize behavior [#2352](https://github.com/finos/perspective/pull/2352)

Misc

- Update webpack dev server configuration options, fixes for perspective 2.0+ [#2350](https://github.com/finos/perspective/pull/2350)
- Fix binder installation to not manage dependencies seperately [#2342](https://github.com/finos/perspective/pull/2342)

# [v2.5.0](https://github.com/perspective-dev/perspective/releases/tag/v2.5.0)

_14 August 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.4.0...v2.5.0))

**Breaking**

- LZ4 compression for Apache Arrow  [#2339](https://github.com/finos/perspective/pull/2339)

Misc

- prune win 2019 from ci, switch over to windows-2022 only [#2333](https://github.com/finos/perspective/pull/2333)

# [v2.4.0](https://github.com/perspective-dev/perspective/releases/tag/v2.4.0)

_9 August 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.3.2...v2.4.0))

**Breaking**

- Add `to_columns_string()` C++ JSON API [#2315](https://github.com/finos/perspective/pull/2315)

Fixes

- Fix TypeScript 5 `moduleResolution: "bundler"` support [#2289](https://github.com/finos/perspective/pull/2289)
- Fix `update()` with `expressions` overcalc [#2328](https://github.com/finos/perspective/pull/2328)
- Fix over-calculation in when loading data in `perspective-viewer` [#2323](https://github.com/finos/perspective/pull/2323)

Misc

- Pin Python dependency versions [#2327](https://github.com/finos/perspective/pull/2327)
- Fix build.rs escaping OUT_DIR [#2313](https://github.com/finos/perspective/pull/2313)

# [v2.3.2](https://github.com/perspective-dev/perspective/releases/tag/v2.3.2)

_20 July 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.3.1...v2.3.2))

Fixes

- Fix expression column aggregate calculation with `group_by` after `remove()` [#2311](https://github.com/finos/perspective/pull/2311)
- Fix empty column name validation in ExprTk editor [#2302](https://github.com/finos/perspective/pull/2302)
- Fix XY-Scatter Plots Colors - Rebased [#2303](https://github.com/finos/perspective/pull/2303)

Misc

- Publish benchmarks [#2310](https://github.com/finos/perspective/pull/2310)
- Add GitHub Releases [#2294](https://github.com/finos/perspective/pull/2294)

# [v2.3.1](https://github.com/perspective-dev/perspective/releases/tag/v2.3.1)

_4 July 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.3.0...v2.3.1))

Features

- Add `custom` format mode to `datetime` columns in Datagrid [#2286](https://github.com/finos/perspective/pull/2286)
- Add `get_hosted_table_names` to js and python server apis. [#2281](https://github.com/finos/perspective/pull/2281)

Fixes

- Fix racing tests. [#2290](https://github.com/finos/perspective/pull/2290)
- Fix python segfault in multi-threaded execution [#2283](https://github.com/finos/perspective/pull/2283)
- Fix OSX arm64 wheels [#2272](https://github.com/finos/perspective/pull/2272)
- Write custom parser for us locale time string format [#2262](https://github.com/finos/perspective/pull/2262)

Misc

- Fix build regression in python dependency [#2285](https://github.com/finos/perspective/pull/2285)
- Fix bug preventing blocks example server from starting. [#2282](https://github.com/finos/perspective/pull/2282)
- Fix bad CSS headers and update formatted CSS test snapshots [#2280](https://github.com/finos/perspective/pull/2280)
- Remove accidental test.only, ensure it never happens again [#2276](https://github.com/finos/perspective/pull/2276)
- Add API to give number of views into table [#2267](https://github.com/finos/perspective/pull/2267)

# [v2.3.0](https://github.com/perspective-dev/perspective/releases/tag/v2.3.0)

_20 June 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.2.1...v2.3.0))

**Breaking**

- Thread-safe python readers [#2261](https://github.com/finos/perspective/pull/2261)

Fixes

- Fix workspace `save()` w/settings [#2257](https://github.com/finos/perspective/pull/2257)

Misc

- Validate installed emsdk version [#2256](https://github.com/finos/perspective/pull/2256)
- Allow `pandas~=2.0.0` to be installed [#2244](https://github.com/finos/perspective/pull/2244)

# [v2.2.1](https://github.com/perspective-dev/perspective/releases/tag/v2.2.1)

_4 June 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.2.0...v2.2.1))

Features

- Pyodide wheel [#2241](https://github.com/finos/perspective/pull/2241)

Fixes

- Fix CSS positioning of expression panel in workspace [#2243](https://github.com/finos/perspective/pull/2243)

# [v2.2.0](https://github.com/perspective-dev/perspective/releases/tag/v2.2.0)

_31 May 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.1.4...v2.2.0))

Features

- Moving Expression Editor modal to a sidebar. [#2239](https://github.com/finos/perspective/pull/2239)

Fixes

- Disallow non-1 multiplicity for bucketing weeks and days [#2238](https://github.com/finos/perspective/pull/2238)

Misc

- Developer QoL fixes [#2240](https://github.com/finos/perspective/pull/2240)
- Add Python 3.11 support [#2234](https://github.com/finos/perspective/pull/2234)
- Add skip test: _update_with_missing_or_null_values [#2230](https://github.com/finos/perspective/pull/2230)

# [v2.1.4](https://github.com/perspective-dev/perspective/releases/tag/v2.1.4)

_26 May 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.1.3...v2.1.4))

Fixes

- Fix median miscalculation for even-sized item list [#2224](https://github.com/finos/perspective/pull/2224)
- Fix a bug when calling `load()` with a rejected promise [#2236](https://github.com/finos/perspective/pull/2236)

# [v2.1.3](https://github.com/perspective-dev/perspective/releases/tag/v2.1.3)

_17 May 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.1.2...v2.1.3))

Misc

- Add 3.7 wheel [#2223](https://github.com/finos/perspective/pull/2223)

# [v2.1.2](https://github.com/perspective-dev/perspective/releases/tag/v2.1.2)

_16 May 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.1.1...v2.1.2))

Misc

- Public `perspective-viewer` components [#2222](https://github.com/finos/perspective/pull/2222)

# [v2.1.1](https://github.com/perspective-dev/perspective/releases/tag/v2.1.1)

_7 May 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.1.0...v2.1.1))

Fixes

- Workspace bug fixes [#2218](https://github.com/finos/perspective/pull/2218)
- Fix windows python builds [#2217](https://github.com/finos/perspective/pull/2217)
- Fix sum aggregate for integer type expression columns [#2216](https://github.com/finos/perspective/pull/2216)

# [v2.1.0](https://github.com/perspective-dev/perspective/releases/tag/v2.1.0)

_6 May 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.0.1...v2.1.0))

**Breaking**

- Remove `umd` builds from all packages [#2211](https://github.com/finos/perspective/pull/2211)

Features

- Update `perspective-workspace` design [#2214](https://github.com/finos/perspective/pull/2214)
- Add scalar factors to Exprtk `bucket()` [#2210](https://github.com/finos/perspective/pull/2210)

Fixes

- Coerce to float64 when user tries to pass in float32 as float64 - fixes #1717 [#2189](https://github.com/finos/perspective/pull/2189)
- Handle zero values in line plots [#2191](https://github.com/finos/perspective/pull/2191)
- pass through websocket connection arguments in python websocket clients, normalize max message size and ensure set for aiohttp [#2187](https://github.com/finos/perspective/pull/2187)

Misc

- rename context menu names for perspective renderers in jupyterlab [#2209](https://github.com/finos/perspective/pull/2209)
- New `playwright` test suite [#2201](https://github.com/finos/perspective/pull/2201)

# [v2.0.1](https://github.com/perspective-dev/perspective/releases/tag/v2.0.1)

_10 April 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v2.0.0...v2.0.1))

Fixes

- Fix drag/drop behavior for duplicate group/split columns [#2177](https://github.com/finos/perspective/pull/2177)
- Fix expression editor bug with escaped characters in strings [#2178](https://github.com/finos/perspective/pull/2178)

Misc

- Better logging and build for rust/wasm [#2179](https://github.com/finos/perspective/pull/2179)
- Reorder examples on `README.md` [#2176](https://github.com/finos/perspective/pull/2176)
- link for dark mode logo in readme [#2166](https://github.com/finos/perspective/pull/2166)

# [v2.0.0](https://github.com/perspective-dev/perspective/releases/tag/v2.0.0)

_4 April 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v1.9.4...v2.0.0))

**Breaking**

- Distribute prebuilt JupyterLab extension / Notebook Classic extension (2023 edition) [#2136](https://github.com/finos/perspective/pull/2136)
- UI Redesign [#2110](https://github.com/finos/perspective/pull/2110)

Features

- Auto-complete text field column selectors [#2156](https://github.com/finos/perspective/pull/2156)

Fixes

- Gracefully handle websocket errors on python side [#2157](https://github.com/finos/perspective/pull/2157)
- Fix ping loop state, make node server `close` method async [#2151](https://github.com/finos/perspective/pull/2151)
- Fix autocomplete behavior for `in` and `not in` filter ops [#2142](https://github.com/finos/perspective/pull/2142)
- fixed filter keyword [#2124](https://github.com/finos/perspective/pull/2124)

Misc

- Run yarn cache path commands in bash shell [#2163](https://github.com/finos/perspective/pull/2163)
- Fixes for docs site [#2162](https://github.com/finos/perspective/pull/2162)
- A11y front page labels [#2161](https://github.com/finos/perspective/pull/2161)
- Fixed deprecated features in GitHub actions [#2141](https://github.com/finos/perspective/pull/2141)
- Specify that Yarn v1 must be used in development docs. [#2143](https://github.com/finos/perspective/pull/2143)
- Miscellaneous cleanup from big Jupyter prebuilt overhaul, python 3.7 deprecation, and various other accumulated but unfixed issues [#2144](https://github.com/finos/perspective/pull/2144)
- Implement `title` field in `PerspectiveWidget` [#2123](https://github.com/finos/perspective/pull/2123)
- New demo `market` [#2128](https://github.com/finos/perspective/pull/2128)
- Fix readme logo link [#2129](https://github.com/finos/perspective/pull/2129)
- Update docs/branding [#2122](https://github.com/finos/perspective/pull/2122)
- vendor all C++ dependencies at build time, fixes #2075, closes #2076, [#2116](https://github.com/finos/perspective/pull/2116)
- fix icon filenames for windows [#2118](https://github.com/finos/perspective/pull/2118)
- New icons [#2111](https://github.com/finos/perspective/pull/2111)

# [v1.9.4](https://github.com/perspective-dev/perspective/releases/tag/v1.9.4)

_22 February 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v1.9.3...v1.9.4))

Features

- Update ExprTk package to 0.0.2 tag [#2103](https://github.com/finos/perspective/pull/2103)

Fixes

- Invert heatmap y-axis [#2113](https://github.com/finos/perspective/pull/2113)
- Fix legend on X/Y line chart [#2107](https://github.com/finos/perspective/pull/2107)
- Update dependencies to be compatible with jupyterlab 3.6.1 [#2101](https://github.com/finos/perspective/pull/2101)

Misc

- Update contributing guidelines [#2077](https://github.com/finos/perspective/pull/2077)
- Updated README.md [#2098](https://github.com/finos/perspective/pull/2098)
- Update charting tests to cover more HTML [#2092](https://github.com/finos/perspective/pull/2092)

# [v1.9.3](https://github.com/perspective-dev/perspective/releases/tag/v1.9.3)

_19 January 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v1.9.2...v1.9.3))

Features

- Add `@finos/perspective-viewer-openlayers` plugin to CLI package [#2087](https://github.com/finos/perspective/pull/2087)

Misc

- Fix script errors in publish and build commands [#2088](https://github.com/finos/perspective/pull/2088)

# [v1.9.2](https://github.com/perspective-dev/perspective/releases/tag/v1.9.2)

_18 January 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v1.9.1...v1.9.2))

Fixes

- Fix regression in `perspective-cli` [#2086](https://github.com/finos/perspective/pull/2086)

Misc

- Build cleanup [#2078](https://github.com/finos/perspective/pull/2078)

# [v1.9.1](https://github.com/perspective-dev/perspective/releases/tag/v1.9.1)

_10 January 2023_ ([Full changelog](https://github.com/finos/perspective/compare/v1.9.0...v1.9.1))

Features

- Add macOS arm wheels to build matrix [#2072](https://github.com/finos/perspective/pull/2072)

Fixes

- Fix `perspective-cli` and add test [#2079](https://github.com/finos/perspective/pull/2079)

Misc

- Add default .vscode project [#2074](https://github.com/finos/perspective/pull/2074)
- Actually copy readme this time, fixes incomplete #1991 [#2071](https://github.com/finos/perspective/pull/2071)
- Fix test regression in chrome [#2070](https://github.com/finos/perspective/pull/2070)

# [v1.9.0](https://github.com/perspective-dev/perspective/releases/tag/v1.9.0)

_29 December 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.8.1...v1.9.0))

**Breaking**

- Add Python 3.10 support, deprecate 3.7 [#2065](https://github.com/finos/perspective/pull/2065)

Fixes

- Improved point label position [#2067](https://github.com/finos/perspective/pull/2067)

Misc

- Fix CSS compilation for `@finos/perspective-jupyterlab` [#2069](https://github.com/finos/perspective/pull/2069)
- Fix CSS compilation to not inline http resources [#2068](https://github.com/finos/perspective/pull/2068)
- Cleanup examples [#2057](https://github.com/finos/perspective/pull/2057)
- Move examples to `gh-pages` site [#2054](https://github.com/finos/perspective/pull/2054)
- Fix copypasta in code of conduct, fix capitalization in readme [#2053](https://github.com/finos/perspective/pull/2053)
- Update README gallery [#2044](https://github.com/finos/perspective/pull/2044)

# [v1.8.1](https://github.com/perspective-dev/perspective/releases/tag/v1.8.1)

_10 December 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.8.0...v1.8.1))

Features

- Vec3 functions for ExprTK and new example "Ray Casting" [#2042](https://github.com/finos/perspective/pull/2042)

Fixes

- Fix parsing of bug related to d3fc splitting selection data (redux of #2039) [#2043](https://github.com/finos/perspective/pull/2043)
- Fix CSS and Scatter Chart positioning bugs [#2035](https://github.com/finos/perspective/pull/2035)

# [v1.8.0](https://github.com/perspective-dev/perspective/releases/tag/v1.8.0)

_5 December 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.7.2...v1.8.0))

Features

- Add labels to Scatter plot points. [#2033](https://github.com/finos/perspective/pull/2033)

Fixes

- Resize labels to avoid overlap [#2034](https://github.com/finos/perspective/pull/2034)
- Fix Default Plugin Order [#2028](https://github.com/finos/perspective/pull/2028)

Misc

- Update docusaurus footer with correct link [#2015](https://github.com/finos/perspective/pull/2015)
- remove reference to gitter from contributing docs [#2025](https://github.com/finos/perspective/pull/2025)
- Fix cargo src rules, publish to crates.io [#2019](https://github.com/finos/perspective/pull/2019)

# [v1.7.2](https://github.com/perspective-dev/perspective/releases/tag/v1.7.2)

_25 November 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.7.1...v1.7.2))

Misc

- Upgrade to Yew 0.20.0 [#2018](https://github.com/finos/perspective/pull/2018)
- Cleanup items [#2012](https://github.com/finos/perspective/pull/2012)
- Re-add secondary dependency as primary dependency to fix python tests [#2013](https://github.com/finos/perspective/pull/2013)
- accidentally copying license as readme when disting python [#1991](https://github.com/finos/perspective/pull/1991)

# [v1.7.1](https://github.com/perspective-dev/perspective/releases/tag/v1.7.1)

_7 October 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.7.0...v1.7.1))

Misc

- Move default plugin to WASM [#1986](https://github.com/finos/perspective/pull/1986)
- Bump dependencies when installing and building python, drop support for `manylinux2010`  [#1984](https://github.com/finos/perspective/pull/1984)

# [v1.7.0](https://github.com/perspective-dev/perspective/releases/tag/v1.7.0)

_1 October 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.6.5...v1.7.0))

Features

- Replace `monaco-editor` [#1971](https://github.com/finos/perspective/pull/1971)

Fixes

- Expression Editor autocomplete bug fixes [#1982](https://github.com/finos/perspective/pull/1982)
- Attempt to instance worker before giving up [#1980](https://github.com/finos/perspective/pull/1980)

Misc

- increment black to latest version [#1977](https://github.com/finos/perspective/pull/1977)
- Better rust api [#1960](https://github.com/finos/perspective/pull/1960)

# [v1.6.5](https://github.com/perspective-dev/perspective/releases/tag/v1.6.5)

_26 August 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.6.4...v1.6.5))

Fixes

- Fix column style menus for string & date(time) [#1950](https://github.com/finos/perspective/pull/1950)

# [v1.6.4](https://github.com/perspective-dev/perspective/releases/tag/v1.6.4)

_22 August 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.6.3...v1.6.4))

Fixes

- Add `not in` filter to valid string type filters in `&lt;perspective-viewer&gt;` [#1945](https://github.com/finos/perspective/pull/1945)
- Upper bound for `ipywidgets` [#1944](https://github.com/finos/perspective/pull/1944)
- Fix Sunburst chart infinite loop bug [#1939](https://github.com/finos/perspective/pull/1939)

Misc

- Per-component CSS model [#1943](https://github.com/finos/perspective/pull/1943)

# [v1.6.3](https://github.com/perspective-dev/perspective/releases/tag/v1.6.3)

_10 August 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.6.2...v1.6.3))

Features

- Add `date` and `datetime` column config [#1932](https://github.com/finos/perspective/pull/1932)

Fixes

- Don't calculate unused `expressions` [#1933](https://github.com/finos/perspective/pull/1933)

Misc

- Refactor `@finos/perspective-viewer-datagrid` [#1927](https://github.com/finos/perspective/pull/1927)
- Fix python `_requires_python` publish script on windows [#1929](https://github.com/finos/perspective/pull/1929)

# [v1.6.2](https://github.com/perspective-dev/perspective/releases/tag/v1.6.2)

_2 August 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.6.1...v1.6.2))

Fixes

- Fix Python bug in `async` mode [#1926](https://github.com/finos/perspective/pull/1926)
- Fix app export [#1921](https://github.com/finos/perspective/pull/1921)

Misc

- Cleanup up python requirements installation in CI, remove some dangling azure references, refresh python README [#1917](https://github.com/finos/perspective/pull/1917)

# [v1.6.1](https://github.com/perspective-dev/perspective/releases/tag/v1.6.1)

_27 July 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.6.0...v1.6.1))

Features

- Add zoom persistence to OpenLayers plugin [#1920](https://github.com/finos/perspective/pull/1920)
- Publish `@finos/perspective-esbuild-plugin` [#1918](https://github.com/finos/perspective/pull/1918)

Fixes

- Fix "inline mode" build [#1919](https://github.com/finos/perspective/pull/1919)

Misc

- Make `perspective-viewer` crate importable for external wasm projects [#1916](https://github.com/finos/perspective/pull/1916)
- Fix publish issues [#1915](https://github.com/finos/perspective/pull/1915)

# [v1.6.0](https://github.com/perspective-dev/perspective/releases/tag/v1.6.0)

_19 July 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.5.1...v1.6.0))

Features

- Add `@finos/perspective-viewer-openlayers` plugin [#1882](https://github.com/finos/perspective/pull/1882)
- Add categories to plugin selector [#1908](https://github.com/finos/perspective/pull/1908)

Fixes

- Add migrate support for datagrid `plugin_config` API [#1914](https://github.com/finos/perspective/pull/1914)
- Fix webpack plugin compat with emsdk single-link build [#1904](https://github.com/finos/perspective/pull/1904)

Misc

- New GitHub Pages site [#1912](https://github.com/finos/perspective/pull/1912)
- Fix Python sdist CI build  [#1907](https://github.com/finos/perspective/pull/1907)
- Fix python CI builds for all linux variants [#1905](https://github.com/finos/perspective/pull/1905)
- Expression Docs [#1903](https://github.com/finos/perspective/pull/1903)

# [v1.5.1](https://github.com/perspective-dev/perspective/releases/tag/v1.5.1)

_8 July 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.5.0...v1.5.1))

Features

- Add `pulse` numeric column background mode [#1895](https://github.com/finos/perspective/pull/1895)
- Split foreground and background numeric column color modes [#1889](https://github.com/finos/perspective/pull/1889)

Fixes

- Fix expand/collapse on first row of ctx2 [#1887](https://github.com/finos/perspective/pull/1887)
- Fix gradient bounds calc [#1890](https://github.com/finos/perspective/pull/1890)
- Expand/collapse on entire group cell, rather than just button [#1888](https://github.com/finos/perspective/pull/1888)

Misc

- Remove custom docker images [#1893](https://github.com/finos/perspective/pull/1893)
- Fix jlab tests to use local packages [#1891](https://github.com/finos/perspective/pull/1891)
- GHA default (remove azure) [#1854](https://github.com/finos/perspective/pull/1854)

# [v1.5.0](https://github.com/perspective-dev/perspective/releases/tag/v1.5.0)

_4 July 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.4.1...v1.5.0))

**Breaking**

- Remove Python 3.6 support [#1867](https://github.com/finos/perspective/pull/1867)

Fixes

- Fix small memory leak and validate package.json with CI cache [#1881](https://github.com/finos/perspective/pull/1881)

Misc

- Pin `tornado` to 6.1 in CI [#1886](https://github.com/finos/perspective/pull/1886)
- Changed default color label style for charts with multiple secondary axii [#1883](https://github.com/finos/perspective/pull/1883)
- Update `emsdk` to `3.1.14` [#1866](https://github.com/finos/perspective/pull/1866)

# [v1.4.1](https://github.com/perspective-dev/perspective/releases/tag/v1.4.1)

_22 June 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.4.0...v1.4.1))

Features

- Add python webserver handlers and clients for starlette (fastapi) and aiohttp [#1828](https://github.com/finos/perspective/pull/1828)

Fixes

- Fix `set_threadpool_size(n)` for `n == 1` [#1852](https://github.com/finos/perspective/pull/1852)
- Reimplement `editable` for PerspectiveWidget in JupyterLab to take into account the latest changes [#1850](https://github.com/finos/perspective/pull/1850)
- Fix `@finos/perspective-viewer-d3fc` chart-specific exports [#1847](https://github.com/finos/perspective/pull/1847)

Misc

- Remove unused watch commands from viewer-d3fc and viewer-datagrid, remove dependabot, dont trigger full build on merge to master [#1859](https://github.com/finos/perspective/pull/1859)
- Simplify and uplift binder to latest supported python, perspective wheel, and dependency set [#1855](https://github.com/finos/perspective/pull/1855)
- Move CI/CD from Azure Pipelines to GitHub Actions [#1808](https://github.com/finos/perspective/pull/1808)
- Make `PerspectiveViewerElement` rust type usable from non-wasm-abi [#1846](https://github.com/finos/perspective/pull/1846)
- Include column name in error log for arrow filling [#1841](https://github.com/finos/perspective/pull/1841)
- ExprTK/Perspective Documentation  [#1845](https://github.com/finos/perspective/pull/1845)

# [v1.4.0](https://github.com/perspective-dev/perspective/releases/tag/v1.4.0)

_6 June 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.13...v1.4.0))

**Breaking**

- Fix `exports` field for Node.js 16 compatibility [#1838](https://github.com/finos/perspective/pull/1838)

Fixes

- Fix scrolling in Chrome 102 [#1837](https://github.com/finos/perspective/pull/1837)

Misc

- fix bug in setup.js where extra set of quotes prevents initial build [#1829](https://github.com/finos/perspective/pull/1829)
- fix cmake build error when install under virtualenv [#1779](https://github.com/finos/perspective/pull/1779)
- Fix jupyterlab test timeouts [#1823](https://github.com/finos/perspective/pull/1823)
- prune 2 more python2 references [#1811](https://github.com/finos/perspective/pull/1811)
- remove duplicate steps [#1815](https://github.com/finos/perspective/pull/1815)
- bump arrow version to 8.0.0 [#1816](https://github.com/finos/perspective/pull/1816)

# [v1.3.13](https://github.com/perspective-dev/perspective/releases/tag/v1.3.13)

_13 May 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.12...v1.3.13))

Fixes

- Fix export-to-html [#1806](https://github.com/finos/perspective/pull/1806)
- Make toggle-menu more responsive under load [#1804](https://github.com/finos/perspective/pull/1804)

Misc

- Fix jest timeouts for jupyterlab [#1805](https://github.com/finos/perspective/pull/1805)

# [v1.3.12](https://github.com/perspective-dev/perspective/releases/tag/v1.3.12)

_9 May 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.11...v1.3.12))

Features

- Support autocomplete for IN filter type [#1798](https://github.com/finos/perspective/pull/1798)

Fixes

- Fix `restore()` error [#1803](https://github.com/finos/perspective/pull/1803)

# [v1.3.11](https://github.com/perspective-dev/perspective/releases/tag/v1.3.11)

_1 May 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.10...v1.3.11))

Features

- Add support for LargeUtf8 arrow column type [#1796](https://github.com/finos/perspective/pull/1796)

Fixes

- Fix datagrid error when `resetThemes()` is called while hidden [#1795](https://github.com/finos/perspective/pull/1795)
- Allow attempt to create workers from file protocol for e.g. electron [#1794](https://github.com/finos/perspective/pull/1794)
- Fix `sum` aggregate to force re-agg for expression columns [#1793](https://github.com/finos/perspective/pull/1793)

# [v1.3.10](https://github.com/perspective-dev/perspective/releases/tag/v1.3.10)

_26 April 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.9...v1.3.10))

Fixes

- Remove 'treemaps' persistent token for d3fc plugin [#1789](https://github.com/finos/perspective/pull/1789)

# [v1.3.9](https://github.com/perspective-dev/perspective/releases/tag/v1.3.9)

_25 April 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.8...v1.3.9))

Fixes

- Fix `perspective-workspace` detach error [#1788](https://github.com/finos/perspective/pull/1788)
- Fix spurious logging [#1785](https://github.com/finos/perspective/pull/1785)

# [v1.3.8](https://github.com/perspective-dev/perspective/releases/tag/v1.3.8)

_18 April 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.7...v1.3.8))

Fixes

- Fix `perspective-workspace` webpack compat [#1784](https://github.com/finos/perspective/pull/1784)

# [v1.3.7](https://github.com/perspective-dev/perspective/releases/tag/v1.3.7)

_18 April 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.6...v1.3.7))

Features

- `perspective-workspace` Context Menu Update [#1783](https://github.com/finos/perspective/pull/1783)

Misc

- Upgrade `yew` [#1776](https://github.com/finos/perspective/pull/1776)
- Add Github dark mode logo to `README.md`  [#1782](https://github.com/finos/perspective/pull/1782)
- Make toolbar icons configurable [#1767](https://github.com/finos/perspective/pull/1767)

# [v1.3.6](https://github.com/perspective-dev/perspective/releases/tag/v1.3.6)

_17 March 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.5...v1.3.6))

Features

- Add extra empty column indicator when columns can be appended [#1770](https://github.com/finos/perspective/pull/1770)

Fixes

- Fix tree column override width persistence in `perspective-viewer-datagrid` [#1772](https://github.com/finos/perspective/pull/1772)

Misc

- Fix `--debug` flag for real this time [#1769](https://github.com/finos/perspective/pull/1769)
- Fix `debug` build script [#1766](https://github.com/finos/perspective/pull/1766)

# [v1.3.5](https://github.com/perspective-dev/perspective/releases/tag/v1.3.5)

_14 March 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.4...v1.3.5))

Fixes

- Fix JLab `settings` flicker [#1762](https://github.com/finos/perspective/pull/1762)
- Export `perspective-viewer-datagrid` types [#1759](https://github.com/finos/perspective/pull/1759)

Misc

- Allow more icons to be overridden [#1763](https://github.com/finos/perspective/pull/1763)
- Rust lint+nightly [#1760](https://github.com/finos/perspective/pull/1760)
- Fix flatbuffers [#1757](https://github.com/finos/perspective/pull/1757)

# [v1.3.4](https://github.com/perspective-dev/perspective/releases/tag/v1.3.4)

_10 March 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.3...v1.3.4))

Features

- Copy menu [#1744](https://github.com/finos/perspective/pull/1744)
- New aggregates `last minus first` and `high minus low` [#1742](https://github.com/finos/perspective/pull/1742)
- Export `.png`, `.html`, `.arrow` [#1740](https://github.com/finos/perspective/pull/1740)

Fixes

- D3FC Chart style and bug fixes [#1752](https://github.com/finos/perspective/pull/1752)
- export `perspective-viewer-datagrid`  plugin customElement and it's typings [#1746](https://github.com/finos/perspective/pull/1746)
- Fire `perspective-config-update` event on D3FC legend and axis events [#1748](https://github.com/finos/perspective/pull/1748)
- Add `main` field to package json [#1745](https://github.com/finos/perspective/pull/1745)

Misc

- Disable OSX Python CI [#1754](https://github.com/finos/perspective/pull/1754)
- Disable Windows builds [#1741](https://github.com/finos/perspective/pull/1741)

# [v1.3.3](https://github.com/perspective-dev/perspective/releases/tag/v1.3.3)

_4 March 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.2...v1.3.3))

Features

- Allow `@finos/perspective` to run in single-threaded mode [#1737](https://github.com/finos/perspective/pull/1737)

Fixes

- Fix bugs reported from docs site [#1733](https://github.com/finos/perspective/pull/1733)

Misc

- Update dev docs [#1736](https://github.com/finos/perspective/pull/1736)

# [v1.3.2](https://github.com/perspective-dev/perspective/releases/tag/v1.3.2)

_2 March 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.1...v1.3.2))

Features

- Vertical resize for expression editor [#1725](https://github.com/finos/perspective/pull/1725)

Fixes

- UI small fixes [#1731](https://github.com/finos/perspective/pull/1731)
- fix: fire config-update evnt on perspective-viewer [#1728](https://github.com/finos/perspective/pull/1728)
- Fix filtering on string columns containing `null` [#1726](https://github.com/finos/perspective/pull/1726)

Misc

- Add tests [#1730](https://github.com/finos/perspective/pull/1730)

# [v1.3.1](https://github.com/perspective-dev/perspective/releases/tag/v1.3.1)

_25 February 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.3.0...v1.3.1))

Fixes

- Fix python memory leak in `table()` [#1724](https://github.com/finos/perspective/pull/1724)

# [v1.3.0](https://github.com/perspective-dev/perspective/releases/tag/v1.3.0)

_22 February 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.2.0...v1.3.0))

**Breaking**

- Add scroll_lock optional free scroll mode for `@finos/perspective-viewer-datagrid` [#1721](https://github.com/finos/perspective/pull/1721)

Fixes

- Virtual column selector [#1722](https://github.com/finos/perspective/pull/1722)

Misc

- remove defunct IEX Cloud example - replace with Polygon.io stock example [#1714](https://github.com/finos/perspective/pull/1714)
- Add column-style-checkbox css variables [#1715](https://github.com/finos/perspective/pull/1715)
- Drag/drop tests [#1716](https://github.com/finos/perspective/pull/1716)

# [v1.2.0](https://github.com/perspective-dev/perspective/releases/tag/v1.2.0)

_1 February 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.1.1...v1.2.0))

**Breaking**

- Replace `row_pivots` with `group_by`, `column_pivots` with `split_by`, add `convert()` migration utility [#1709](https://github.com/finos/perspective/pull/1709)
- Add `settings` and `theme` to `perspective-config-update` DOM event and `PerspectiveWidget` python class [#1712](https://github.com/finos/perspective/pull/1712)

Features

- User-selectable Theme API [#1711](https://github.com/finos/perspective/pull/1711)

Misc

- Update docs for new theme API [#1713](https://github.com/finos/perspective/pull/1713)

# [v1.1.1](https://github.com/perspective-dev/perspective/releases/tag/v1.1.1)

_18 January 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.1.0...v1.1.1))

Fixes

- Fix bad filter when `.update()` contains missing string column value [#1708](https://github.com/finos/perspective/pull/1708)
- Fix async mode segfault on `.load()` with indexed Arrow [#1707](https://github.com/finos/perspective/pull/1707)
- Fix `perspective-viewer` filter dropdown for values with double quotes [#1696](https://github.com/finos/perspective/pull/1696)

Misc

- Pin `flatc` to 1.12.1 [#1705](https://github.com/finos/perspective/pull/1705)

# [v1.1.0](https://github.com/perspective-dev/perspective/releases/tag/v1.1.0)

_5 January 2022_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.8...v1.1.0))

**Breaking**

- CSV output rewrite (Arrow/C++) [#1692](https://github.com/finos/perspective/pull/1692)

Features

- Column style menu for `string` type columns [#1691](https://github.com/finos/perspective/pull/1691)

Fixes

- Fix auto-reset when `HTMLPerspectiveViewerElement.load()` called twice [#1695](https://github.com/finos/perspective/pull/1695)

Misc

- purge six dependency [#1689](https://github.com/finos/perspective/pull/1689)
- Reduce CI: Turn off branch builds, only build on PRs to master [#1688](https://github.com/finos/perspective/pull/1688)

# [v1.0.8](https://github.com/perspective-dev/perspective/releases/tag/v1.0.8)

_23 December 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.7...v1.0.8))

Features

- 80% reduction in `.wasm` asset size [#1683](https://github.com/finos/perspective/pull/1683)
- Use `puppeteer` for app from CLI [#1674](https://github.com/finos/perspective/pull/1674)

Fixes

- `date` and `datetime` filter bug fixes and support for non-Chrome browsers [#1685](https://github.com/finos/perspective/pull/1685)
- Fix Treemap zoom when a group level is `null` [#1676](https://github.com/finos/perspective/pull/1676)

Misc

- fix wheel build, make extension first to ensure binaries are inlined, then assemble wheel [#1679](https://github.com/finos/perspective/pull/1679)
- Upgrade Arrow to `6.0.2` [#1680](https://github.com/finos/perspective/pull/1680)
- Benchmarks update [#1681](https://github.com/finos/perspective/pull/1681)

# [v1.0.7](https://github.com/perspective-dev/perspective/releases/tag/v1.0.7)

_13 December 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.6...v1.0.7))

Features

- Preserve `expressions` on reset (shift+ to force) [#1673](https://github.com/finos/perspective/pull/1673)

Fixes

- Fix `perspective-workspace` errors [#1675](https://github.com/finos/perspective/pull/1675)

Misc

- Build windows wheel every time so its tested [#1672](https://github.com/finos/perspective/pull/1672)

# [v1.0.6](https://github.com/perspective-dev/perspective/releases/tag/v1.0.6)

_11 December 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.5...v1.0.6))

Features

- Fix `perspective-workspace` and add `monaco-editor-webpack-plugin` compatibility to `perspective-webpack-plugin` [#1662](https://github.com/finos/perspective/pull/1662)
- D3FC fast `Treemap`, fix for non-POSIX time axis, better resize [#1660](https://github.com/finos/perspective/pull/1660)
- Resizable expression editor [#1643](https://github.com/finos/perspective/pull/1643)

Fixes

- Fix `position: sticky` Chrome render bug in `perspective-viewer-datagrid` [#1661](https://github.com/finos/perspective/pull/1661)
- Implement `getView()` [#1657](https://github.com/finos/perspective/pull/1657)

Misc

- add missing definition for re2 on os x to reenable conda builds [#1654](https://github.com/finos/perspective/pull/1654)

# [v1.0.5](https://github.com/perspective-dev/perspective/releases/tag/v1.0.5)

_6 December 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.4...v1.0.5))

Fixes

- D3FC Treemap bug fixes [#1652](https://github.com/finos/perspective/pull/1652)
- Fix `datetime`/`date`/`integer`/`float` filter occasionally resetting while typing [#1653](https://github.com/finos/perspective/pull/1653)

# [v1.0.4](https://github.com/perspective-dev/perspective/releases/tag/v1.0.4)

_5 December 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.3...v1.0.4))

Features

- Parallelized `.wasm` download and deferred font loading [#1647](https://github.com/finos/perspective/pull/1647)
- Add auto-resizing to `&lt;perspective-viewer&gt;` [#1633](https://github.com/finos/perspective/pull/1633)

Fixes

- Remove wasm-pack artifacts which interfere with perspective packaging [#1651](https://github.com/finos/perspective/pull/1651)
- Fix column-selector collapse (inverted) [#1650](https://github.com/finos/perspective/pull/1650)
- Emit `.d.ts` declaration files for `@finos/perspective-viewer` [#1649](https://github.com/finos/perspective/pull/1649)

Misc

- Overload re2 cmakelists to fix cmake/threads detection issue on conda-forge mac builds, and pin C++ dependency versions [#1634](https://github.com/finos/perspective/pull/1634)
- [Formatting] Fix mixed tabs/spaces in C++ CMakeLists.txt  [#1630](https://github.com/finos/perspective/pull/1630)
- [Formatting] force line-feed line endings for all text files for easier windows development [#1635](https://github.com/finos/perspective/pull/1635)
- Update CMakeLists.txt for more thread help on mac for conda [#1631](https://github.com/finos/perspective/pull/1631)
- Fix Azure windows wheel step [#1629](https://github.com/finos/perspective/pull/1629)

# [v1.0.3](https://github.com/perspective-dev/perspective/releases/tag/v1.0.3)

_23 November 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.2...v1.0.3))

Fixes

- Fix partial-updates on tables with `limit` set for javascript [#1624](https://github.com/finos/perspective/pull/1624)
- Fix partial-updates on tables with `limit` set for python [#1623](https://github.com/finos/perspective/pull/1623)
- `PerspectiveWidget()` dialog theme fix [#1621](https://github.com/finos/perspective/pull/1621)
- Add `wait_for_table` flag to `getTable()` [#1619](https://github.com/finos/perspective/pull/1619)
- Fix `worker.js` cross-origin workaround for CDN [#1618](https://github.com/finos/perspective/pull/1618)

Misc

- bump windows build for vc 14.2 / vs 16 2019, add macos 11 build for py3.9 [#1626](https://github.com/finos/perspective/pull/1626)
- add threads explicit on mac [#1625](https://github.com/finos/perspective/pull/1625)
- Fix publish through practice [#1620](https://github.com/finos/perspective/pull/1620)

# [v1.0.2](https://github.com/perspective-dev/perspective/releases/tag/v1.0.2)

_20 November 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.1...v1.0.2))

Features

- More regex functions - find, substring, replace [#1598](https://github.com/finos/perspective/pull/1598)
- Add Regex functions using Exprtk and RE2 [#1596](https://github.com/finos/perspective/pull/1596)
- Persist edited expressions and add 'Reset' button [#1594](https://github.com/finos/perspective/pull/1594)

Fixes

- Fix D3 alt-axis regression [#1617](https://github.com/finos/perspective/pull/1617)

Misc

- New example [#1615](https://github.com/finos/perspective/pull/1615)
- Publish script for Python [#1613](https://github.com/finos/perspective/pull/1613)
- Port to `esbuild` [#1611](https://github.com/finos/perspective/pull/1611)
- Upgrade `d3fc` to `15.2.4` and switch "Heatmap" to use canvas renderer [#1599](https://github.com/finos/perspective/pull/1599)
- Add ExprTK example fractal [#1595](https://github.com/finos/perspective/pull/1595)

# [v1.0.1](https://github.com/perspective-dev/perspective/releases/tag/v1.0.1)

_30 October 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.0...v1.0.1))

Features

- Universal binaries for OSX [#1590](https://github.com/finos/perspective/pull/1590)
- Drag/drop highlight and in-place column updates [#1586](https://github.com/finos/perspective/pull/1586)

Fixes

- Fix JupyterLab widget `filter` traitlet [#1593](https://github.com/finos/perspective/pull/1593)
- Fix corrupt string results in `expressions` [#1589](https://github.com/finos/perspective/pull/1589)

Misc

- Remove TBB [#1591](https://github.com/finos/perspective/pull/1591)
- swap out JS style versioning in python script [#1563](https://github.com/finos/perspective/pull/1563)
- Align `@lumino` versions [#1576](https://github.com/finos/perspective/pull/1576)
- Bar Rendering bug null sends fix [#1569](https://github.com/finos/perspective/pull/1569)
- remove deprecated webpack-specific tilde prefix convention [#1582](https://github.com/finos/perspective/pull/1582)
- Remove python 2 from build and CI scripts [#1583](https://github.com/finos/perspective/pull/1583)
- fixes #1506 [#1581](https://github.com/finos/perspective/pull/1581)
- Upgrade Apache Arrow to 5.0.0 [#1545](https://github.com/finos/perspective/pull/1545)
- Update python classifiers [#1579](https://github.com/finos/perspective/pull/1579)

# [v1.0.0](https://github.com/perspective-dev/perspective/releases/tag/v1.0.0)

_12 October 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.0-rc.2...v1.0.0))

Fixes

- Fix #1566, remove deprecated flags from WASM debug build [#1567](https://github.com/finos/perspective/pull/1567)
- Fix #1562, fix regressions in PerspectiveWidget [#1565](https://github.com/finos/perspective/pull/1565)

Misc

- `docs` for updated `perspective-viewer` [#1574](https://github.com/finos/perspective/pull/1574)

# [v1.0.0-rc.2](https://github.com/perspective-dev/perspective/releases/tag/v1.0.0-rc.2)

_29 September 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.0-rc.1...v1.0.0-rc.2))


# [v1.0.0-rc.1](https://github.com/perspective-dev/perspective/releases/tag/v1.0.0-rc.1)

_29 September 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v1.0.0-rc.0...v1.0.0-rc.1))

Fixes

- Fix python wheel CI [#1552](https://github.com/finos/perspective/pull/1552)

Misc

- Make `/node_modules` external to TS [#1557](https://github.com/finos/perspective/pull/1557)

# [v1.0.0-rc.0](https://github.com/perspective-dev/perspective/releases/tag/v1.0.0-rc.0)

_28 September 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.10.3...v1.0.0-rc.0))

**Breaking**

- New `&lt;perspective-viewer&gt;` [#1488](https://github.com/finos/perspective/pull/1488)

Features

- Boolean datagrid columns [#1553](https://github.com/finos/perspective/pull/1553)
- Return booleans from expression comparisons, allow for vectors to be defined in expressions [#1548](https://github.com/finos/perspective/pull/1548)
- Persistent column widths [#1549](https://github.com/finos/perspective/pull/1549)
- Boolean column filter controls for `&lt;perspective-viewer&gt;` [#1547](https://github.com/finos/perspective/pull/1547)
- Fix M1 (Apple Silicon) build for `perspective-python` and improve developer docs [#1525](https://github.com/finos/perspective/pull/1525)

Fixes

- Fix examples [#1556](https://github.com/finos/perspective/pull/1556)
- Fix expression column button toolbar styling [#1555](https://github.com/finos/perspective/pull/1555)
- Fix hidden sort aggregate as `unique` only when sorted on the same axis [#1554](https://github.com/finos/perspective/pull/1554)
- Fixes `bucket()` computed function validation [#1551](https://github.com/finos/perspective/pull/1551)
- Fix 'weighted mean' aggregate support in &lt;perspective-viewer&gt; [#1543](https://github.com/finos/perspective/pull/1543)
- Fix column section collapse with expressions [#1542](https://github.com/finos/perspective/pull/1542)
- Fix `is (not) null`, `date`, `datetime` filters [#1541](https://github.com/finos/perspective/pull/1541)
- Fix workspace filter events [#1540](https://github.com/finos/perspective/pull/1540)
- Fix `docs` site and NPM artifact for `&lt;perspective-viewer&gt;` update [#1533](https://github.com/finos/perspective/pull/1533)
- Fix drag/drop exclusive cases [#1532](https://github.com/finos/perspective/pull/1532)
- Re-add `getEditPort()` and `restyleElement()` methods [#1531](https://github.com/finos/perspective/pull/1531)
- Use TypeScript for `@finos/perspective-viewer` [#1530](https://github.com/finos/perspective/pull/1530)
- Fix `settings` key to trigger redraw + container redraw [#1529](https://github.com/finos/perspective/pull/1529)
- Fix #1505, #998, #1225 - results after remove are correct [#1528](https://github.com/finos/perspective/pull/1528)
- Fix D3FC chart resize via `preserveAspectRatio` [#1526](https://github.com/finos/perspective/pull/1526)

Misc

- add some light sdist tests and upload sdist in CI [#1433](https://github.com/finos/perspective/pull/1433)
- Upgrade emscripten to 2.0.29 [#1539](https://github.com/finos/perspective/pull/1539)
- Add docs for `&lt;perspective-viewer-plugin&gt;` [#1538](https://github.com/finos/perspective/pull/1538)
- Lint upgrade and remove TypeScript for `@finos/perspective-jupyterlab` [#1537](https://github.com/finos/perspective/pull/1537)

# [v0.10.3](https://github.com/perspective-dev/perspective/releases/tag/v0.10.3)

_31 August 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.10.2...v0.10.3))

Fixes

- Refactor `to_arrow`, fix row deltas for pivoted views [#1519](https://github.com/finos/perspective/pull/1519)
- Fix count aggregate when last aggregate and partial updates are applied [#1518](https://github.com/finos/perspective/pull/1518)

# [v0.10.2](https://github.com/perspective-dev/perspective/releases/tag/v0.10.2)

_30 August 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.10.1...v0.10.2))

Fixes

- Fix support for array-like filter terms [#1524](https://github.com/finos/perspective/pull/1524)
- Add new aggregates to ViewConfig enum [#1516](https://github.com/finos/perspective/pull/1516)

# [v0.10.1](https://github.com/perspective-dev/perspective/releases/tag/v0.10.1)

_12 August 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.10.0...v0.10.1))

Features

- Upgrade `regular-table` [#1475](https://github.com/finos/perspective/pull/1475)
- Add standard deviation and variance aggregates [#1476](https://github.com/finos/perspective/pull/1476)

Fixes

- Remove filter limit [#1514](https://github.com/finos/perspective/pull/1514)
- Add required dependencies for webpack plugin [#1480](https://github.com/finos/perspective/pull/1480)
- Fix throttle attribute [#1479](https://github.com/finos/perspective/pull/1479)

Misc

- Preload fonts [#1481](https://github.com/finos/perspective/pull/1481)
- Refactoring [#1471](https://github.com/finos/perspective/pull/1471)

# [v0.10.0](https://github.com/perspective-dev/perspective/releases/tag/v0.10.0)

_8 July 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.9.0...v0.10.0))

Features

- Inlined build for perspective-jupyterlab, improve PerspectiveWidget [#1466](https://github.com/finos/perspective/pull/1466)
- Spark bar [#1459](https://github.com/finos/perspective/pull/1459)
- New plugin api [#1457](https://github.com/finos/perspective/pull/1457)
- Read CSV strings in perspective-python [#1447](https://github.com/finos/perspective/pull/1447)

Fixes

- Fix Binder by updating Jupyterlab to 3.0.14 from 3.0.9 [#1469](https://github.com/finos/perspective/pull/1469)
- Misc. plugin bug fixes [#1465](https://github.com/finos/perspective/pull/1465)
- Fix memory errors when streaming updates with expression columns [#1464](https://github.com/finos/perspective/pull/1464)
- Fixes #1340 - removes dependency on removed ipywidgets API [#1455](https://github.com/finos/perspective/pull/1455)

Misc

- New website [#1470](https://github.com/finos/perspective/pull/1470)
- Add Jupyterlab tests to CI [#1460](https://github.com/finos/perspective/pull/1460)
- Build Windows wheel, limit wheel builds to scheduled and tagged builds [#1453](https://github.com/finos/perspective/pull/1453)

# [v0.9.0](https://github.com/perspective-dev/perspective/releases/tag/v0.9.0)

_16 June 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.8.3...v0.9.0))

**Breaking**

- Add Expressions Engine using ExprTk [#1354](https://github.com/finos/perspective/pull/1354)

Features

- Error reporting for `monaco` [#1444](https://github.com/finos/perspective/pull/1444)
- Column name completion for `monaco` [#1443](https://github.com/finos/perspective/pull/1443)
- Output more metadata on expression errors, fix #1440 [#1441](https://github.com/finos/perspective/pull/1441)
- Add integer, float, string, date, and datetime conversion functions [#1437](https://github.com/finos/perspective/pull/1437)
- Add theme support to monaco [#1439](https://github.com/finos/perspective/pull/1439)
- Isolate expressions per-context and ensure memory stability [#1431](https://github.com/finos/perspective/pull/1431)
-  Expression Editor UI via `monaco-editor` [#1426](https://github.com/finos/perspective/pull/1426)

Fixes

- Expression editor bug fixes [#1450](https://github.com/finos/perspective/pull/1450)
- Parse aggregates in column order [#1432](https://github.com/finos/perspective/pull/1432)

Misc

- Update Jupyter Notebook Examples [#1446](https://github.com/finos/perspective/pull/1446)
- Optional lazy-load `monaco-editor` [#1435](https://github.com/finos/perspective/pull/1435)
- Fix benchmarks and remove versions pre 0.5.0 from benchmarking [#1436](https://github.com/finos/perspective/pull/1436)
- Expose `join` aggregate [#1434](https://github.com/finos/perspective/pull/1434)
- organize azure pipelines file [#1381](https://github.com/finos/perspective/pull/1381)

# [v0.8.3](https://github.com/perspective-dev/perspective/releases/tag/v0.8.3)

_12 May 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.8.2...v0.8.3))

Misc

- Double-render fix [#1420](https://github.com/finos/perspective/pull/1420)

# [v0.8.2](https://github.com/perspective-dev/perspective/releases/tag/v0.8.2)

_11 May 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.8.1...v0.8.2))

Fixes

- Fix CLI `async` regression [#1419](https://github.com/finos/perspective/pull/1419)
- Fix color gradient charts containing 0 [#1418](https://github.com/finos/perspective/pull/1418)
- Fix styling bugs from CSS minification [#1417](https://github.com/finos/perspective/pull/1417)

# [v0.8.1](https://github.com/perspective-dev/perspective/releases/tag/v0.8.1)

_10 May 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.8.0...v0.8.1))

Features

- More Material style updates [#1416](https://github.com/finos/perspective/pull/1416)
- Color-by-string for Treemap/Sunburst [#1415](https://github.com/finos/perspective/pull/1415)

Fixes

- Responsive column style menu [#1414](https://github.com/finos/perspective/pull/1414)
- Fix memory leak(s), leak tests, `memory_usage()` wasm heap API [#1412](https://github.com/finos/perspective/pull/1412)

Misc

- Fix `react` and `remote-workspace` examples [#1411](https://github.com/finos/perspective/pull/1411)
- Getting pybind version number always fails [#1413](https://github.com/finos/perspective/pull/1413)
- Install Boost from JFrog, fix outdated docs from #1409 [#1410](https://github.com/finos/perspective/pull/1410)
- Upgrade `puppeteer` to `9.0.0` [#1408](https://github.com/finos/perspective/pull/1408)

# [v0.8.0](https://github.com/perspective-dev/perspective/releases/tag/v0.8.0)

_27 April 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.7.0...v0.8.0))

**Breaking**

- Add `get_min_max()` to Perspective API [#1395](https://github.com/finos/perspective/pull/1395)

Features

- Enable editing to mime renderer in JupyterLab [#1353](https://github.com/finos/perspective/pull/1353)
- Datagrid Styleable Column [#1386](https://github.com/finos/perspective/pull/1386)

Fixes

- Fix `last` aggregate to preserve status [#1390](https://github.com/finos/perspective/pull/1390)

Misc

- Updated `gh-pages` site and `README.md` [#1399](https://github.com/finos/perspective/pull/1399)
- Disable column style menu for non-numeric columns [#1391](https://github.com/finos/perspective/pull/1391)

# [v0.7.0](https://github.com/perspective-dev/perspective/releases/tag/v0.7.0)

_20 April 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.6.2...v0.7.0))

**Breaking**

- Remove webcomponentsjs [#1388](https://github.com/finos/perspective/pull/1388)
- Async Table and View Constructor [#1289](https://github.com/finos/perspective/pull/1289)

Features

- Material Theme 2.0 [#1380](https://github.com/finos/perspective/pull/1380)
- Add `call_loop` and `get_table_names` [#1375](https://github.com/finos/perspective/pull/1375)
- Deprecate py27 (linux), add py39 (osx) [#1336](https://github.com/finos/perspective/pull/1336)
- Status Bar Component [#1314](https://github.com/finos/perspective/pull/1314)

Misc

- Fix cross-origin webpack defaults [#1387](https://github.com/finos/perspective/pull/1387)
- Backwards compatibility for table() and view() [#1384](https://github.com/finos/perspective/pull/1384)
- Adds `yarn repl` to launch a shell inside our docker images [#1382](https://github.com/finos/perspective/pull/1382)
- Update regular-table to 0.3.1 [#1379](https://github.com/finos/perspective/pull/1379)
- Fix `@finos/perspective-jupyterlab` to work with WebAssembly/Webpack5 [#1377](https://github.com/finos/perspective/pull/1377)
- install boost via choco [#1351](https://github.com/finos/perspective/pull/1351)
- Fix timezone tests to take DST into account [#1349](https://github.com/finos/perspective/pull/1349)
- Fix D3FC label font bug [#1343](https://github.com/finos/perspective/pull/1343)
- Add nightly complete builds [#1338](https://github.com/finos/perspective/pull/1338)
- fix binder [#1341](https://github.com/finos/perspective/pull/1341)
- Replace `emsdk-npm` with simple script [#1342](https://github.com/finos/perspective/pull/1342)
- Fix #1324: use ~major.minor.patch in PerspectiveWidget versioning [#1331](https://github.com/finos/perspective/pull/1331)
- Add `SplitPanel` and port to Yew [#1326](https://github.com/finos/perspective/pull/1326)

# [v0.6.2](https://github.com/perspective-dev/perspective/releases/tag/v0.6.2)

_11 February 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.6.1...v0.6.2))

Fixes

- Fix `@finos/perspective-jupyterlab` compat with webpack5 [#1323](https://github.com/finos/perspective/pull/1323)

# [v0.6.1](https://github.com/perspective-dev/perspective/releases/tag/v0.6.1)

_11 February 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.6.0...v0.6.1))

Features

- Date/datetime filter autocompletion, new timezone test suite for JS [#1282](https://github.com/finos/perspective/pull/1282)

Fixes

- Fix missing return in ctx0::notify [#1320](https://github.com/finos/perspective/pull/1320)
- Fix for layout jitter in the Column Selector [#1318](https://github.com/finos/perspective/pull/1318)
- Remove webpack as a peerDependency for the webpack plugin [#1311](https://github.com/finos/perspective/pull/1311)
- Fix partial updates in Python using dicts [#1298](https://github.com/finos/perspective/pull/1298)
- Fix for sorting via `avg` aggregated column. [#1286](https://github.com/finos/perspective/pull/1286)
- Fixes style issue with &lt;select&gt; dark theme on Windows [#1287](https://github.com/finos/perspective/pull/1287)

Misc

- Export inline `@finos/perspective` by default, and simplify some package `dist` with rollup [#1322](https://github.com/finos/perspective/pull/1322)
- Update regular-table to 0.2.1 [#1321](https://github.com/finos/perspective/pull/1321)
- Docs site updates [#1319](https://github.com/finos/perspective/pull/1319)
- Removed dead code from C++ src [#1293](https://github.com/finos/perspective/pull/1293)
- Add `@finos/perspective-cpp` module [#1292](https://github.com/finos/perspective/pull/1292)
- Add `jlab_link` script to link local changes into development Jupyterlab [#1309](https://github.com/finos/perspective/pull/1309)
- JupyterLab update to ^3.0.0, and fix "Open With.." regression [#1294](https://github.com/finos/perspective/pull/1294)
- Statically link `perspective-python` and `libarrow` [#1290](https://github.com/finos/perspective/pull/1290)
- Upgrade Emscripten to 2.0.6 and remove emsdk docker image [#1232](https://github.com/finos/perspective/pull/1232)
- Fix #1244: make test_wheels script use python -m pip [#1288](https://github.com/finos/perspective/pull/1288)

# [v0.6.0](https://github.com/perspective-dev/perspective/releases/tag/v0.6.0)

_8 January 2021_ ([Full changelog](https://github.com/finos/perspective/compare/v0.5.6...v0.6.0))

**Breaking**

- Restrict `viewer.load()` to only accept `Table()` [#1231](https://github.com/finos/perspective/pull/1231)
- Remove host_view and open_view from public API [#1240](https://github.com/finos/perspective/pull/1240)

Features

- Validate view config in engine, fix computed column state bugs [#1272](https://github.com/finos/perspective/pull/1272)
- Reimplement pandas deconstruction [#1238](https://github.com/finos/perspective/pull/1238)
- Fix #1213 - improve render warning behavior [#1249](https://github.com/finos/perspective/pull/1249)
- Add unit context for 0-sided views [#1235](https://github.com/finos/perspective/pull/1235)
- Add Python client-based stresstest [#1223](https://github.com/finos/perspective/pull/1223)

Fixes

- Fix Date/Time formatting in `perspective-viewer` CSV output [#1281](https://github.com/finos/perspective/pull/1281)
- Fix build for pyarrow 2.0.0 [#1260](https://github.com/finos/perspective/pull/1260)
- Fix #1241 - date and datetime values in client mode are parsed properly [#1248](https://github.com/finos/perspective/pull/1248)
- Fix distributed editing in PerspectiveWidget [#1236](https://github.com/finos/perspective/pull/1236)

Misc

- New Documentation & Project Site [#1275](https://github.com/finos/perspective/pull/1275)
- free() pointer to arrow binary in Python [#1273](https://github.com/finos/perspective/pull/1273)
- Cleanup docs and examples to viewer.load(table) [#1271](https://github.com/finos/perspective/pull/1271)
- Fix: version conflict that makes `npm install` failed [#1266](https://github.com/finos/perspective/pull/1266)
- Fix flapping tests for render warnings [#1264](https://github.com/finos/perspective/pull/1264)
- Documentation: Point to current jupyter examples, and remove out-of-date/broken example [#1257](https://github.com/finos/perspective/pull/1257)
- Add perspective-click event to grid [#1250](https://github.com/finos/perspective/pull/1250)
- Adding abs sum functionality [#1247](https://github.com/finos/perspective/pull/1247)
- Update Azure Windows boost to 1.72 [#1253](https://github.com/finos/perspective/pull/1253)
- Fix example notebooks [#1239](https://github.com/finos/perspective/pull/1239)
- tweak py wheel build on linux [#1234](https://github.com/finos/perspective/pull/1234)
- Add `get_index()` and `get_limit()` to the public API, internal code cleanup [#1230](https://github.com/finos/perspective/pull/1230)
- Refactor C++, misc. C++ fixes [#1233](https://github.com/finos/perspective/pull/1233)
- Explicitly import `tornado.locks` [#1227](https://github.com/finos/perspective/pull/1227)

# [v0.5.6](https://github.com/perspective-dev/perspective/releases/tag/v0.5.6)

_15 October 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.5.5...v0.5.6))

Features

- adding binder link [#1217](https://github.com/finos/perspective/pull/1217)
- Send large arrow binaries as chunks, add client-level Websocket heartbeat [#1209](https://github.com/finos/perspective/pull/1209)
- Add `perspective-plugin-update` event for d3fc [#1212](https://github.com/finos/perspective/pull/1212)
- Upgrade WebAssembly build to Arrow 1.0.1 [#1207](https://github.com/finos/perspective/pull/1207)

Fixes

- Fix infinite loop bug in 2-sided context [#1219](https://github.com/finos/perspective/pull/1219)
- Fix `computed-column` and `table()` constructor Javascript bugs [#1214](https://github.com/finos/perspective/pull/1214)

Misc

- Separate 'release' and 'debug' builds [#1221](https://github.com/finos/perspective/pull/1221)
- C++ Datetime Parsing [#1220](https://github.com/finos/perspective/pull/1220)
- fix broken link to apache arrow [#1211](https://github.com/finos/perspective/pull/1211)
- Improve Python Examples [#1197](https://github.com/finos/perspective/pull/1197)
- Fix typo, update arrow version info.  [#1204](https://github.com/finos/perspective/pull/1204)

# [v0.5.5](https://github.com/perspective-dev/perspective/releases/tag/v0.5.5)

_21 September 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.5.3...v0.5.5))

Features

- Release GIL for `Table` methods [#1202](https://github.com/finos/perspective/pull/1202)
- GIL release for perspective-python Async mode [#1198](https://github.com/finos/perspective/pull/1198)
- Add Python client implementation [#1199](https://github.com/finos/perspective/pull/1199)
- Server mode for Jupyterlab `PerspectiveWidget` [#1195](https://github.com/finos/perspective/pull/1195)

Fixes

- Upgrade to regular-table 0.1.5 and fix custom-style example [#1203](https://github.com/finos/perspective/pull/1203)
- `perspective-python` Client fixes [#1200](https://github.com/finos/perspective/pull/1200)
- Remove linking against python [#1194](https://github.com/finos/perspective/pull/1194)

Misc

- add some build troubleshooting docs [#1193](https://github.com/finos/perspective/pull/1193)
- Bl.ocks [#1191](https://github.com/finos/perspective/pull/1191)
- Use `black` Python format [#1188](https://github.com/finos/perspective/pull/1188)
- Move Python examples to `/examples/` [#1178](https://github.com/finos/perspective/pull/1178)

# [v0.5.3](https://github.com/perspective-dev/perspective/releases/tag/v0.5.3)

_7 September 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.5.2...v0.5.3))

Features

- Add websocket stresstests for Tornado server [#1177](https://github.com/finos/perspective/pull/1177)
- `perspective-viewer-datagrid` support for `editable` [#1176](https://github.com/finos/perspective/pull/1176)
- Remove deprecated plugins `@finos/perspective-viewer-hypergrid` and `@finos/perspective-viewer-highcharts` [#1174](https://github.com/finos/perspective/pull/1174)
- Updated `@finos/perspective-viewer-datagrid` plugin to `regular-table` 0.0.9 [#1169](https://github.com/finos/perspective/pull/1169)
- Add `d3fc` X/Y Line Chart [#1172](https://github.com/finos/perspective/pull/1172)
- fix for virtualenvs/envs with multiple py3 installed, allow for up to arrow 0.17 [#1163](https://github.com/finos/perspective/pull/1163)
- Fixes #1159 - deltas are now generated on first update for 0-sided contexts [#1164](https://github.com/finos/perspective/pull/1164)
- Submit tornado write_message to IOLoop, add websocket tests in Python [#1156](https://github.com/finos/perspective/pull/1156)
- Adds PR templates for bugfix, documentation, and feature [#1155](https://github.com/finos/perspective/pull/1155)
- Adds `set_threadpool_size()` [#1147](https://github.com/finos/perspective/pull/1147)
- Generate/test Manylinux wheels, clean up wheel/build process [#1105](https://github.com/finos/perspective/pull/1105)

Fixes

- Datagrid overdraw fix [#1187](https://github.com/finos/perspective/pull/1187)
- D3FC render fixes [#1186](https://github.com/finos/perspective/pull/1186)
- Fix sticky dragdrop on `perspective-viewer` [#1185](https://github.com/finos/perspective/pull/1185)
- `promo` example project update and computed function fix [#1184](https://github.com/finos/perspective/pull/1184)
- Fix `perspective-viewer-datagrid` sorting [#1181](https://github.com/finos/perspective/pull/1181)
- `perspective-workspace` CSS fixes [#1183](https://github.com/finos/perspective/pull/1183)
- Fix segfault and errors on 2-sided sorted views when data window is invalid [#1153](https://github.com/finos/perspective/pull/1153)
- fix(perspective-viewer-d3fc): show formatted dates on treemap and sunburst (1144) [#1165](https://github.com/finos/perspective/pull/1165)
- Fix #1129 and #1130, remove Highcharts and Hypergrid from PerspectiveWidget [#1142](https://github.com/finos/perspective/pull/1142)
- Fix issue where contexts were being notified before gnode state was updated [#1136](https://github.com/finos/perspective/pull/1136)
- Enable updates from arrows that have more/less columns than the Table schema [#1140](https://github.com/finos/perspective/pull/1140)
- Fix path resolution for cross-origin assets [#1141](https://github.com/finos/perspective/pull/1141)

Misc

- Updated development.md to show correct Emscripten version. [#1138](https://github.com/finos/perspective/pull/1138)

# [v0.5.2](https://github.com/perspective-dev/perspective/releases/tag/v0.5.2)

_28 July 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.5.1...v0.5.2))

Features

- slight UX change, dont end with stack trace as it looks like it raise… [#1110](https://github.com/finos/perspective/pull/1110)

Fixes

- Properly display computed axis on charts, use local time for all datetime functions [#1116](https://github.com/finos/perspective/pull/1116)

Misc

- `perspective-viewer-highcharts-lite` [#1135](https://github.com/finos/perspective/pull/1135)
- Explicitly floor start row/col and ceil end row/col [#1112](https://github.com/finos/perspective/pull/1112)
- Fix transferable list in worker.postMessage [#1119](https://github.com/finos/perspective/pull/1119)
- Fixed Typos in Perspective API Docs [#1096](https://github.com/finos/perspective/pull/1096)
- Add client/server editing example, fix hypergrid to allow editing in workspace [#1109](https://github.com/finos/perspective/pull/1109)

# [v0.5.1](https://github.com/perspective-dev/perspective/releases/tag/v0.5.1)

_25 June 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.5.0...v0.5.1))

Features

- Computed expressions respect left-to-right associativity and operator precedence [#1090](https://github.com/finos/perspective/pull/1090)
- Enable Manylinux wheel builds [#1057](https://github.com/finos/perspective/pull/1057)
- Fix for CRLF issue  [#1078](https://github.com/finos/perspective/pull/1078)
- Use `regular-table` [#1060](https://github.com/finos/perspective/pull/1060)
- add perspective-update-complete event example to js guide [#1027](https://github.com/finos/perspective/pull/1027)

Fixes

- Fix Windows build on Azure [#1095](https://github.com/finos/perspective/pull/1095)
- Use local time for column/row headers and computed functions [#1074](https://github.com/finos/perspective/pull/1074)
- Fix regression in regex for Firefox [#1065](https://github.com/finos/perspective/pull/1065)

Misc

- Unpin arrow version [#1104](https://github.com/finos/perspective/pull/1104)
- Cleans up CMakeLists & Python build scripts, fixes datetime string rendering [#1091](https://github.com/finos/perspective/pull/1091)
- Refactor manager internal API, speed up string filters in UI,  add manager API tests [#1077](https://github.com/finos/perspective/pull/1077)
- Spelling and grammar corrections [#1094](https://github.com/finos/perspective/pull/1094)
- Spell-Fix [#1093](https://github.com/finos/perspective/pull/1093)
- Spelling fixes [#1083](https://github.com/finos/perspective/pull/1083)
- Fix #1068 [#1103](https://github.com/finos/perspective/pull/1103)
- Bump websocket-extensions from 0.1.3 to 0.1.4 [#1080](https://github.com/finos/perspective/pull/1080)
- Run ESLint on documentation + minor documentation improvements [#1069](https://github.com/finos/perspective/pull/1069)
- Remap lab extension command in makefile [#1046](https://github.com/finos/perspective/pull/1046)
- Fixed typo on documentation page [#1062](https://github.com/finos/perspective/pull/1062)

# [v0.5.0](https://github.com/perspective-dev/perspective/releases/tag/v0.5.0)

_24 May 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.8...v0.5.0))

Features

- Autocomplete [#1052](https://github.com/finos/perspective/pull/1052)
- Implement Client/Server Editing [#1043](https://github.com/finos/perspective/pull/1043)
- Reference python objects directly in perspective tables [#975](https://github.com/finos/perspective/pull/975)
- Expression-based Computed Columns [#983](https://github.com/finos/perspective/pull/983)

Fixes

- Fix flapping `perspective-workspace` tests [#1022](https://github.com/finos/perspective/pull/1022)

Misc

- Styleable scroll-area for `@finos/perspective-viewer-datagrid` [#1058](https://github.com/finos/perspective/pull/1058)
- Restore firefox support by removing captrue group from regex pattern [#1048](https://github.com/finos/perspective/pull/1048)
- Remove duplicate `psp_okey` column from arrow updates [#1044](https://github.com/finos/perspective/pull/1044)
- Adds jsdelivr package.json metadata [#1040](https://github.com/finos/perspective/pull/1040)
- Add abs sum as an aggregator [#1031](https://github.com/finos/perspective/pull/1031)
- Add plugin save and restore api to `perspective-viewer-datagrid` [#1029](https://github.com/finos/perspective/pull/1029)
- Fix minor bugs in Perspective datetime + NaN handling [#1028](https://github.com/finos/perspective/pull/1028)
- Upgrade `papaparse` [#1033](https://github.com/finos/perspective/pull/1033)
- Update to emsdk 1.39.12 and remove 2gb MAXIMUM_MEMORY [#1015](https://github.com/finos/perspective/pull/1015)

# [v0.4.8](https://github.com/perspective-dev/perspective/releases/tag/v0.4.8)

_21 April 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.7...v0.4.8))

Misc

- Datagrid virtual scroll fixes and `-webkit-scrollbar` CSS [#1018](https://github.com/finos/perspective/pull/1018)
- When updating tables typed as `int` with `float64` numpy arrays, copy instead of filling iteratively [#1012](https://github.com/finos/perspective/pull/1012)
- Update Python benchmarks to include results for `update` calls [#1011](https://github.com/finos/perspective/pull/1011)
- Bump minimist from 1.2.0 to 1.2.3 [#1001](https://github.com/finos/perspective/pull/1001)
- Adds -Wall and fixes C++ build warnings [#1017](https://github.com/finos/perspective/pull/1017)
- Add Manylinux Python 3.7 wheel build + tests, disable Azure Windows Python build [#1010](https://github.com/finos/perspective/pull/1010)

# [v0.4.7](https://github.com/perspective-dev/perspective/releases/tag/v0.4.7)

_6 April 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.6...v0.4.7))

Features

- `@finos/perspective-viewer-datagrid` Tree Formatting [#993](https://github.com/finos/perspective/pull/993)

Fixes

- Fix column resizing when column pivots are present, and update docs and examples. [#1002](https://github.com/finos/perspective/pull/1002)
- Fix incorrect sort order when hidden, pivoted columns are sorted [#1000](https://github.com/finos/perspective/pull/1000)
- `@finos/perspective-viewer-datagrid` Bug Fixes [#997](https://github.com/finos/perspective/pull/997)
- tweak accessor to accept numpy dict [#985](https://github.com/finos/perspective/pull/985)
- perspective-workspace fixes [#990](https://github.com/finos/perspective/pull/990)
- remove cpp test check from setup.py (no more cpp tests) [#982](https://github.com/finos/perspective/pull/982)

Misc

- Add `lock` to PerspectiveManager [#999](https://github.com/finos/perspective/pull/999)
- Look for PyArrow relative to Perspective in @rpath [#995](https://github.com/finos/perspective/pull/995)
- Purge `@finos/perspective-viewer-hypergrid` [#991](https://github.com/finos/perspective/pull/991)
- Documentation: update PerspectiveTornadoServer to PerspectiveTornadoHandler [#987](https://github.com/finos/perspective/pull/987)

# [v0.4.6](https://github.com/perspective-dev/perspective/releases/tag/v0.4.6)

_17 March 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.5...v0.4.6))

Features

- Datagrid row selection and column resize [#979](https://github.com/finos/perspective/pull/979)
- Remove duplicate brew instructions [#973](https://github.com/finos/perspective/pull/973)
- Add `linked` filter mode to `perspective-workspace` [#969](https://github.com/finos/perspective/pull/969)
- Datagrid header click-to-sort and assorted improvements [#967](https://github.com/finos/perspective/pull/967)
- New plugin `@finos/perspective-viewer-datagrid` [#954](https://github.com/finos/perspective/pull/954)
- Add ==, !=, &gt;, &lt;, and string equality computed columns [#957](https://github.com/finos/perspective/pull/957)

Fixes

- Update azure-pipelines.yml for Azure Pipelines [#977](https://github.com/finos/perspective/pull/977)
- PerspectiveManager no longer treats `str` as `bytes` in Python 2 [#965](https://github.com/finos/perspective/pull/965)
- Fully clear queued updates before adding a new computed column [#961](https://github.com/finos/perspective/pull/961)

Misc

- Update typings to include nodejs only components  [#980](https://github.com/finos/perspective/pull/980)
- update dependencies to jupyterlab 2.0, phosphor -&gt; lumino [#970](https://github.com/finos/perspective/pull/970)
- Refactor out `WebsSocketManager` from `WebSockerServer` [#963](https://github.com/finos/perspective/pull/963)

# [v0.4.5](https://github.com/perspective-dev/perspective/releases/tag/v0.4.5)

_28 February 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.4...v0.4.5))

Fixes

- Emit source maps for WebWorker. [#956](https://github.com/finos/perspective/pull/956)
- Bugfix sdist [#953](https://github.com/finos/perspective/pull/953)

Misc

- Refactor `gnode` and `gnode_state`, remove C++ test suite [#939](https://github.com/finos/perspective/pull/939)

# [v0.4.4](https://github.com/perspective-dev/perspective/releases/tag/v0.4.4)

_26 February 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.3...v0.4.4))

Features

- Remove some stale code [#927](https://github.com/finos/perspective/pull/927)
- Fix for #921: unifies versioning between JS and Python libraries [#923](https://github.com/finos/perspective/pull/923)

Fixes

- Fixes off-by-one error in `end_col` [#948](https://github.com/finos/perspective/pull/948)
- Fix tables `delete` bug in `perspective-workspace` [#946](https://github.com/finos/perspective/pull/946)
- Fix #945: Improve Python install docs [#947](https://github.com/finos/perspective/pull/947)
- Deal with np.int_ on Windows, handle missing __INDEX__ [#943](https://github.com/finos/perspective/pull/943)
- Fix widget title in `perspective-workspace` [#934](https://github.com/finos/perspective/pull/934)
- Fix `perspective-workspace` initialize bug [#924](https://github.com/finos/perspective/pull/924)
- Fix `perspective-workspace` non-unique generated slotid bug [#925](https://github.com/finos/perspective/pull/925)

Misc

- Activate Perspective in FINOS Foundation [#949](https://github.com/finos/perspective/pull/949)
- Package/dist license in python package [#930](https://github.com/finos/perspective/pull/930)
- Adds test coverage reporting for`@finos/perspective` [#920](https://github.com/finos/perspective/pull/920)

# [v0.4.3](https://github.com/perspective-dev/perspective/releases/tag/v0.4.3)

_12 February 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.2...v0.4.3))

Features

- adding sdist check so we don't deploy broken sdists accidentally [#918](https://github.com/finos/perspective/pull/918)

Fixes

- Event regression fix [#922](https://github.com/finos/perspective/pull/922)
- Remove `@finos/perspective-phosphor` and fix #825 regression. [#919](https://github.com/finos/perspective/pull/919)

Misc

- Added Azure compatible reporting for tests [#916](https://github.com/finos/perspective/pull/916)
- Fix bug where `perspective-viewer` doesn't resize [#911](https://github.com/finos/perspective/pull/911)
- Set up CI with Azure Pipelines [#915](https://github.com/finos/perspective/pull/915)

# [v0.4.2](https://github.com/perspective-dev/perspective/releases/tag/v0.4.2)

_10 February 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.1...v0.4.2))

Features

- Custom Element API for `&lt;perspective-workspace&gt;` [#901](https://github.com/finos/perspective/pull/901)
- `perspective-viewer-hypergrid` Tree column toggle buttons. [#914](https://github.com/finos/perspective/pull/914)
- Remove `perspective.node` Python module. [#912](https://github.com/finos/perspective/pull/912)
- Add 'workspace-layout-update' event and css class selector names cleanup  [#902](https://github.com/finos/perspective/pull/902)
- updates and fixes for windows build [#884](https://github.com/finos/perspective/pull/884)
- Make `perspective-viewer-hypergrid` selection state save/restore compatible [#903](https://github.com/finos/perspective/pull/903)
- implement save/restore on viewer configuration [#896](https://github.com/finos/perspective/pull/896)
- Make `@finos/perspective-workspace` widget title editable by doubleclick [#891](https://github.com/finos/perspective/pull/891)
- Add 'perspective-select' event to `@finos/perspective-viewer-hypergrid` [#894](https://github.com/finos/perspective/pull/894)
- Allow missing columns [#881](https://github.com/finos/perspective/pull/881)
- Style fixes for `perspective-workspace` [#890](https://github.com/finos/perspective/pull/890)
- Fix selection styling on `@finos/perspective-viewer-hypergrid` [#889](https://github.com/finos/perspective/pull/889)
- Fixed React types. [#886](https://github.com/finos/perspective/pull/886)
- Add new package `@finos/perspective-workspace` [#874](https://github.com/finos/perspective/pull/874)

Fixes

- Fix column ordering in Python, null handling for computed columns [#907](https://github.com/finos/perspective/pull/907)
- Fix #898 - week bucket overflows [#899](https://github.com/finos/perspective/pull/899)

Misc

- Remove yarn dependency duplication. [#908](https://github.com/finos/perspective/pull/908)
- Bump core-js to v3.6.4 and Babel to 7.8.4 [#906](https://github.com/finos/perspective/pull/906)
- `&lt;perspective-viewer&gt;` UI cleanup [#905](https://github.com/finos/perspective/pull/905)
- Implement computed column functions in C++ [#892](https://github.com/finos/perspective/pull/892)
- Better test screenshot archiving. [#895](https://github.com/finos/perspective/pull/895)
- Update Python README [#893](https://github.com/finos/perspective/pull/893)
- Improve Perspective Documentation [#873](https://github.com/finos/perspective/pull/873)

# [v0.4.1](https://github.com/perspective-dev/perspective/releases/tag/v0.4.1)

_27 January 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0...v0.4.1))

Features

- New computed functions `pow`, `invert`, `sqrt`, `abs` [#871](https://github.com/finos/perspective/pull/871)
- Optional `@finos/perspective-webpack-plugin` [#870](https://github.com/finos/perspective/pull/870)

Fixes

- Fix `on_update` callbacks in Python [#880](https://github.com/finos/perspective/pull/880)
- Time zone awareness in perspective-python [#867](https://github.com/finos/perspective/pull/867)
- Improve `@finos/perspective-viewer` typings [#872](https://github.com/finos/perspective/pull/872)
- Allow plugins to be importable before '`perspective-viewer` [#868](https://github.com/finos/perspective/pull/868)
- Fix scrolling for pivoted hypergrid [#866](https://github.com/finos/perspective/pull/866)

Misc

- Extend `perspective-viewer` typings and added a react-typescript example [#877](https://github.com/finos/perspective/pull/877)
- Hiring! [#876](https://github.com/finos/perspective/pull/876)
- Added simple webpack example and renamed existing webpack example [#869](https://github.com/finos/perspective/pull/869)
- Python versioning fix [#863](https://github.com/finos/perspective/pull/863)

# [v0.4.0](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0)

_7 January 2020_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0-rc.6...v0.4.0))

Features

- Implement `to_arrow` in C++ for JS/Python [#850](https://github.com/finos/perspective/pull/850)
- Exp bin functions [#851](https://github.com/finos/perspective/pull/851)

Fixes

- Fix `perspective-viewer` to allow loading a table before it's attache… [#854](https://github.com/finos/perspective/pull/854)
- Fix `perspective-jupyterlab` theme [#853](https://github.com/finos/perspective/pull/853)

Misc

- Improved error messages from C++ [#862](https://github.com/finos/perspective/pull/862)
- Add benchmark suite for Python, Refactor module loading for environments where C++ cannot be built [#859](https://github.com/finos/perspective/pull/859)
- add pypi badge [#855](https://github.com/finos/perspective/pull/855)
- Workspace fixes [#858](https://github.com/finos/perspective/pull/858)
- Update versioning script for Python [#852](https://github.com/finos/perspective/pull/852)

# [v0.4.0-rc.6](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0-rc.6)

_18 December 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0-rc.5...v0.4.0-rc.6))


# [v0.4.0-rc.5](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0-rc.5)

_18 December 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0-rc.4...v0.4.0-rc.5))

Features

- Add `selectable` attribute to `perspective-viewer` [#842](https://github.com/finos/perspective/pull/842)
- `weighted mean` aggregate type [#846](https://github.com/finos/perspective/pull/846)
- Theme `material-dense` [#845](https://github.com/finos/perspective/pull/845)
- CSV/JSON renderer in JupyterLab [#832](https://github.com/finos/perspective/pull/832)
- Read date32, date64, decimal128 from Arrow datasets [#829](https://github.com/finos/perspective/pull/829)
- Add `delete()` to widget, cache client updates before render, refactor module structure [#823](https://github.com/finos/perspective/pull/823)

Fixes

- Fixed resize behavior [#848](https://github.com/finos/perspective/pull/848)
- Node.js `table` unpin [#844](https://github.com/finos/perspective/pull/844)
- Asynchronously process updates when running in Tornado [#838](https://github.com/finos/perspective/pull/838)
- Throttle fix [#835](https://github.com/finos/perspective/pull/835)
- Preserve user columns and pivots in widget [#833](https://github.com/finos/perspective/pull/833)
- Fix `PerspectiveWorkspace` when tabbed views are moved to master [#831](https://github.com/finos/perspective/pull/831)
- Widget fixes for resizing, TS typings, boolean columns [#826](https://github.com/finos/perspective/pull/826)
- Properly remove `on_delete` and `on_update` callbacks that fail. [#822](https://github.com/finos/perspective/pull/822)
- Default to int64 in Python3, add `long` and `unicode` to schema and type inference [#821](https://github.com/finos/perspective/pull/821)
- Fix misordered columns in update [#818](https://github.com/finos/perspective/pull/818)

Misc

- Refactor `perspective-viewer` themes to include css classes [#849](https://github.com/finos/perspective/pull/849)
- Python build overhaul [#839](https://github.com/finos/perspective/pull/839)
- add editable example to readme [#847](https://github.com/finos/perspective/pull/847)
- Async resize [#840](https://github.com/finos/perspective/pull/840)
- Improvements to Arrow updates and indexed columns [#837](https://github.com/finos/perspective/pull/837)
- Remove `ci_python` and refactor scripts. [#836](https://github.com/finos/perspective/pull/836)
- Set Enums as values for Widget/Viewer, refactor test folder structure [#834](https://github.com/finos/perspective/pull/834)
- Stricter linting for comments [#828](https://github.com/finos/perspective/pull/828)
- Add PerspectiveWorkspace olympics example to README [#820](https://github.com/finos/perspective/pull/820)
- Update Perspective website with Python API and user guide [#819](https://github.com/finos/perspective/pull/819)

# [v0.4.0-rc.4](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0-rc.4)

_14 November 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0-rc.3...v0.4.0-rc.4))

Features

- Client mode supports dataframes, np.ndarray, structured and recarray [#813](https://github.com/finos/perspective/pull/813)
- Allow client mode widget to be constructed with schema [#807](https://github.com/finos/perspective/pull/807)

Fixes

- Fixed 2-sided sorting on column-only pivots [#815](https://github.com/finos/perspective/pull/815)
- Python build fixes [#809](https://github.com/finos/perspective/pull/809)
- Fixed Python Arrow loading bug [#806](https://github.com/finos/perspective/pull/806)
- Two sided sort fixes [#805](https://github.com/finos/perspective/pull/805)

Misc

- Add puppeteer tests for `perspective-phosphor` [#812](https://github.com/finos/perspective/pull/812)
- Hypergrid no longer depends on `Object.keys` order of dataset [#811](https://github.com/finos/perspective/pull/811)
- allow for right master [#799](https://github.com/finos/perspective/pull/799)
- Tweak date/datetime inference, remove dependency on non-core Numpy/Pandas API [#802](https://github.com/finos/perspective/pull/802)
- add websocket export in type definition [#800](https://github.com/finos/perspective/pull/800)
- Add umd build and updated tests for `perspective-phosphor` [#798](https://github.com/finos/perspective/pull/798)

# [v0.4.0-rc.3](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0-rc.3)

_6 November 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0-rc.2...v0.4.0-rc.3))

Features

- Dataframe/Numpy Array Loader [#791](https://github.com/finos/perspective/pull/791)

Misc

- Fixed travis build error & hypergrid console error [#795](https://github.com/finos/perspective/pull/795)
- Added `promo` example project [#794](https://github.com/finos/perspective/pull/794)
- Add `update` for widget in client mode, fix `on_update` in Python 2 [#793](https://github.com/finos/perspective/pull/793)
- Fixed aggregates to apply to hidden sorted columns [#792](https://github.com/finos/perspective/pull/792)
- Fixed `client` flag to default to True on Windows [#788](https://github.com/finos/perspective/pull/788)
- New logo & demo gif [#790](https://github.com/finos/perspective/pull/790)

# [v0.4.0-rc.2](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0-rc.2)

_31 October 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.4.0-rc.1...v0.4.0-rc.2))

Fixes

- Python 2/GCC &lt;5 compatibility [#784](https://github.com/finos/perspective/pull/784)

Misc

- Hypergrid paintloop removal [#785](https://github.com/finos/perspective/pull/785)

# [v0.4.0-rc.1](https://github.com/perspective-dev/perspective/releases/tag/v0.4.0-rc.1)

_24 October 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.9...v0.4.0-rc.1))

Features

- `PerspectiveDockPanel` and `PerspectiveWorkspace` components [#782](https://github.com/finos/perspective/pull/782)
- Computed UX [#765](https://github.com/finos/perspective/pull/765)
- Added `Table()` support for numpy recarray [#771](https://github.com/finos/perspective/pull/771)
- Add `to_csv` to Python API [#759](https://github.com/finos/perspective/pull/759)
- Apache Arrow native reads for JS+Python [#755](https://github.com/finos/perspective/pull/755)
- ＶΛＰＯＲＷΛＶΞ [#739](https://github.com/finos/perspective/pull/739)
- Readable dates [#695](https://github.com/finos/perspective/pull/695)

Fixes

- Mobile fixes [#781](https://github.com/finos/perspective/pull/781)
- Arrow fixes [#772](https://github.com/finos/perspective/pull/772)
- Fixed ios compatibility [#770](https://github.com/finos/perspective/pull/770)
- Hypergrid renderer fixes [#764](https://github.com/finos/perspective/pull/764)
- Fixed `yarn clean` script [#753](https://github.com/finos/perspective/pull/753)
- Fixed grid performance when pivoted [#752](https://github.com/finos/perspective/pull/752)
- Fix update bugs [#749](https://github.com/finos/perspective/pull/749)
- Fix empty list in phosphor plugin [#745](https://github.com/finos/perspective/pull/745)
- Read numpy nans/datetimes [#741](https://github.com/finos/perspective/pull/741)

Misc

- Python sdist  [#763](https://github.com/finos/perspective/pull/763)
- Fixes jupyterlab plugin regressions [#779](https://github.com/finos/perspective/pull/779)
- Link `lerna version` to `bumpversion` [#780](https://github.com/finos/perspective/pull/780)
- Adjust setup.py for MacOS wheel dist [#778](https://github.com/finos/perspective/pull/778)
- Add exception handling, clean up PSP_COMPLAIN_AND_ABORT [#777](https://github.com/finos/perspective/pull/777)
- Multiple views on JLab plugin [#776](https://github.com/finos/perspective/pull/776)
- Update declaration [#773](https://github.com/finos/perspective/pull/773)
- Upgrade Arrow to 0.15.0, link python arrow from prebuilt library [#768](https://github.com/finos/perspective/pull/768)
- Add tornado handler for perspective-python [#766](https://github.com/finos/perspective/pull/766)
- Add core-js@2 dependency that is required by transpiled outputs of Babel [#758](https://github.com/finos/perspective/pull/758)
- Rewrite Perspective Jupyterlab and Phosphor API [#756](https://github.com/finos/perspective/pull/756)
- ES6 Client API [#751](https://github.com/finos/perspective/pull/751)
- add compute() to dynamically show/hide sidebar computation panel [#748](https://github.com/finos/perspective/pull/748)
- Allow users register multiple on_delete callbacks to view and table [#747](https://github.com/finos/perspective/pull/747)
- Some cleanup items [#744](https://github.com/finos/perspective/pull/744)
- Add PerspectiveManager remote API for Python, Tornado server example [#743](https://github.com/finos/perspective/pull/743)
- Computed column partial update [#740](https://github.com/finos/perspective/pull/740)
- Test suite failure feedback [#735](https://github.com/finos/perspective/pull/735)
- Added .gitattributes [#734](https://github.com/finos/perspective/pull/734)
- Enable update with __INDEX__ on explicit index column [#733](https://github.com/finos/perspective/pull/733)
- fixes view-&gt;plugin rename that didnt make it from original repo [#731](https://github.com/finos/perspective/pull/731)
- Python improvements + refactor [#730](https://github.com/finos/perspective/pull/730)
- Remove incorrect does not equal filter [#732](https://github.com/finos/perspective/pull/732)
- convert to monolithic python install [#728](https://github.com/finos/perspective/pull/728)
- Allow partial updates on computed column source columns [#729](https://github.com/finos/perspective/pull/729)
- Python [#723](https://github.com/finos/perspective/pull/723)

# [v0.3.9](https://github.com/perspective-dev/perspective/releases/tag/v0.3.9)

_16 September 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.8...v0.3.9))

Features

- Editing for `@finos/perspective-viewer-hypergrid` [#708](https://github.com/finos/perspective/pull/708)
- Added `index` API to `to_format` methods [#693](https://github.com/finos/perspective/pull/693)

Fixes

- Copy-paste error in last PR [#710](https://github.com/finos/perspective/pull/710)

Misc

- Fixed schema miscalculation with computed columns and implicit index [#727](https://github.com/finos/perspective/pull/727)
- Type-on-edit [#715](https://github.com/finos/perspective/pull/715)
- Misc cleanup and fixes [#726](https://github.com/finos/perspective/pull/726)
- `yarn setup` [#725](https://github.com/finos/perspective/pull/725)
- Remove regeneratorRuntime entirely [#718](https://github.com/finos/perspective/pull/718)
- Bump lodash.merge from 4.6.1 to 4.6.2 [#717](https://github.com/finos/perspective/pull/717)
- `perspective-test` Module [#711](https://github.com/finos/perspective/pull/711)
- Refactor C++ [#707](https://github.com/finos/perspective/pull/707)
- documentation/style fix [#705](https://github.com/finos/perspective/pull/705)
- Test implicit index & remove extraneous example file [#706](https://github.com/finos/perspective/pull/706)
- `perspective-viewer` cleanup [#703](https://github.com/finos/perspective/pull/703)
- Allow for perspective in ipywidgets layouts [#702](https://github.com/finos/perspective/pull/702)
- Limit charts [#700](https://github.com/finos/perspective/pull/700)
- `leaves_only` flag for perspective [#699](https://github.com/finos/perspective/pull/699)
- `index` column support [#698](https://github.com/finos/perspective/pull/698)
- Bump mixin-deep from 1.3.1 to 1.3.2 [#697](https://github.com/finos/perspective/pull/697)
- Fixed README.md [#696](https://github.com/finos/perspective/pull/696)
- Calculate row offset in C++, refactor Table, remove implicit primary key mode [#692](https://github.com/finos/perspective/pull/692)
- Fixed chunked arrow test to actually be chunked [#691](https://github.com/finos/perspective/pull/691)

# [v0.3.8](https://github.com/perspective-dev/perspective/releases/tag/v0.3.8)

_26 August 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.7...v0.3.8))

Misc

- Emsdk upstream [#690](https://github.com/finos/perspective/pull/690)
- 0-sided Performance Fix [#689](https://github.com/finos/perspective/pull/689)

# [v0.3.7](https://github.com/perspective-dev/perspective/releases/tag/v0.3.7)

_20 August 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.6...v0.3.7))

Misc

- Added column-width to style API [#688](https://github.com/finos/perspective/pull/688)
- Added 'dataset' configurable data example [#687](https://github.com/finos/perspective/pull/687)
- `perspective-click` fix [#686](https://github.com/finos/perspective/pull/686)
- Fix performance regression [#685](https://github.com/finos/perspective/pull/685)
- Fix scatter row_pivots_values exception on click [#684](https://github.com/finos/perspective/pull/684)
- Pinned D3FC to 14.0.40 [#683](https://github.com/finos/perspective/pull/683)
- Style API [#682](https://github.com/finos/perspective/pull/682)
- Remove nan filtering, add null filtering [#676](https://github.com/finos/perspective/pull/676)
- Add view config class in C++ [#672](https://github.com/finos/perspective/pull/672)
- Fix #616: perspective-jupyterlab versioning [#675](https://github.com/finos/perspective/pull/675)
- Fix jlab again [#673](https://github.com/finos/perspective/pull/673)
- Update phosphor component to use `plugin` instead of view [#667](https://github.com/finos/perspective/pull/667)
- Cleaner API through the Table abstraction, prepare for Python API [#642](https://github.com/finos/perspective/pull/642)
- Fixes user defined aggregates for computed columns [#666](https://github.com/finos/perspective/pull/666)
- Fix exception for filter labels [#669](https://github.com/finos/perspective/pull/669)
- Allow arrow tables to be created from a schema [#663](https://github.com/finos/perspective/pull/663)
- Updated example gists to use latest API [#661](https://github.com/finos/perspective/pull/661)

# [v0.3.6](https://github.com/perspective-dev/perspective/releases/tag/v0.3.6)

_15 July 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.5...v0.3.6))

Misc

- Fixed webpack plugin resolution of require() [#660](https://github.com/finos/perspective/pull/660)

# [v0.3.5](https://github.com/perspective-dev/perspective/releases/tag/v0.3.5)

_15 July 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.4...v0.3.5))

Misc

- Npm gh fix [#659](https://github.com/finos/perspective/pull/659)

# [v0.3.4](https://github.com/perspective-dev/perspective/releases/tag/v0.3.4)

_12 July 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.3...v0.3.4))


# [v0.3.3](https://github.com/perspective-dev/perspective/releases/tag/v0.3.3)

_12 July 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.2...v0.3.3))


# [v0.3.2](https://github.com/perspective-dev/perspective/releases/tag/v0.3.2)

_12 July 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.1...v0.3.2))

Misc

- Fixed github reported vulnerability in lodash.template [#654](https://github.com/finos/perspective/pull/654)
- Panel resize fixes [#652](https://github.com/finos/perspective/pull/652)
- Made side-panel resizable [#650](https://github.com/finos/perspective/pull/650)
- Fixed null pivotting issue [#651](https://github.com/finos/perspective/pull/651)
- Remove column pivot __ROW_PATH__ filter [#649](https://github.com/finos/perspective/pull/649)
- Add hover styles to copy, download, reset [#643](https://github.com/finos/perspective/pull/643)
- Perspective config [#644](https://github.com/finos/perspective/pull/644)
- Moved loader dependencies out of webpack plugin [#641](https://github.com/finos/perspective/pull/641)
- Fix debug builds [#637](https://github.com/finos/perspective/pull/637)
- Refactor [#639](https://github.com/finos/perspective/pull/639)
- Fixed webpack config error in webpack example [#640](https://github.com/finos/perspective/pull/640)
- Don't use transferable for WASM payload [#635](https://github.com/finos/perspective/pull/635)
- Fixed async loading of node.js module [#634](https://github.com/finos/perspective/pull/634)

# [v0.3.1](https://github.com/perspective-dev/perspective/releases/tag/v0.3.1)

_25 June 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.0...v0.3.1))

Fixes

- Phosphor and JupyterLab bug and regression fixes [#625](https://github.com/finos/perspective/pull/625)

Misc

- Fixed safari hypergrid rendering [#632](https://github.com/finos/perspective/pull/632)
- Update Babel `preset-env` [#631](https://github.com/finos/perspective/pull/631)
- Use MODULARIZE emscripten option instead of a custom one [#630](https://github.com/finos/perspective/pull/630)
- Remove support for ASM.JS, Internet Explorer and other non-WASM browsers [#629](https://github.com/finos/perspective/pull/629)
- Memory usage fixes [#628](https://github.com/finos/perspective/pull/628)

# [v0.3.0](https://github.com/perspective-dev/perspective/releases/tag/v0.3.0)

_10 June 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.0-rc.4...v0.3.0))

Features

- Allow transfer as columns [#607](https://github.com/finos/perspective/pull/607)

Misc

- Webpack perf [#615](https://github.com/finos/perspective/pull/615)
- Updated website [#614](https://github.com/finos/perspective/pull/614)
- Make "view" attribute of `&lt;perspective-viewer&gt;` backwards compatible [#611](https://github.com/finos/perspective/pull/611)
- Made drag/drop zones more generous [#610](https://github.com/finos/perspective/pull/610)
- Fixed split-axis y_line charts in D3FC [#609](https://github.com/finos/perspective/pull/609)
- Restore highchairs on phosphor/jlab until d3 is complete [#608](https://github.com/finos/perspective/pull/608)
- Sync refactor [#606](https://github.com/finos/perspective/pull/606)

# [v0.3.0-rc.4](https://github.com/perspective-dev/perspective/releases/tag/v0.3.0-rc.4)

_30 May 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.0-rc.3...v0.3.0-rc.4))

Misc

- Replace "distinct count" default aggregate with "count" [#604](https://github.com/finos/perspective/pull/604)
- Replace atomic [#603](https://github.com/finos/perspective/pull/603)

# [v0.3.0-rc.3](https://github.com/perspective-dev/perspective/releases/tag/v0.3.0-rc.3)

_28 May 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.0-rc.2...v0.3.0-rc.3))

Features

- A few quality-of-life improvements for perspective-phosphor [#591](https://github.com/finos/perspective/pull/591)

Misc

- Clean up API names [#600](https://github.com/finos/perspective/pull/600)
- D3FC Default Plugin [#599](https://github.com/finos/perspective/pull/599)
- simplify python setup.py, add psp_test to python tests [#596](https://github.com/finos/perspective/pull/596)
- Fixed D3FC heatmap color for Material dark theme. [#595](https://github.com/finos/perspective/pull/595)
- Row delta fixes [#594](https://github.com/finos/perspective/pull/594)
- Row deltas return arrow-serialized data [#589](https://github.com/finos/perspective/pull/589)
- Fix for webpack 4 themes generation error on Windows [#590](https://github.com/finos/perspective/pull/590)

# [v0.3.0-rc.2](https://github.com/perspective-dev/perspective/releases/tag/v0.3.0-rc.2)

_22 May 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.3.0-rc.1...v0.3.0-rc.2))

Features

- Fixed tooltip value when split_values and multiple main values [#583](https://github.com/finos/perspective/pull/583)
- add restyle to type definitions, fix dark mode in jlab, fix CSS issue [#578](https://github.com/finos/perspective/pull/578)
- Feature/dual y axis POC [#564](https://github.com/finos/perspective/pull/564)
- JupyterLab enhancements [#570](https://github.com/finos/perspective/pull/570)
- D3 Treemaps [#563](https://github.com/finos/perspective/pull/563)

Misc

- New benchmark suite [#588](https://github.com/finos/perspective/pull/588)
- Port to Webpack 4 [#587](https://github.com/finos/perspective/pull/587)
- Update CONTRIBUTING.md [#584](https://github.com/finos/perspective/pull/584)
- Row delta supports addition, delete, non-contiguous updates [#582](https://github.com/finos/perspective/pull/582)
- Undo condensed column layout when width &lt; 600px [#580](https://github.com/finos/perspective/pull/580)
- Fixed grid styling [#576](https://github.com/finos/perspective/pull/576)
- UX fixes [#575](https://github.com/finos/perspective/pull/575)
- Performance overhaul for `table.update()` [#574](https://github.com/finos/perspective/pull/574)
- Feature/treemap enhancements [#572](https://github.com/finos/perspective/pull/572)
- Fix the format of long numbers [#573](https://github.com/finos/perspective/pull/573)
- Refactor Javascript API +add documentation [#571](https://github.com/finos/perspective/pull/571)
- Update results.json to reflect Scatter name change [#190](https://github.com/finos/perspective/pull/190)
- Overwrite test results [#189](https://github.com/finos/perspective/pull/189)
- Update results.json to reflect Scatter name change [#188](https://github.com/finos/perspective/pull/188)
- Correctly read and generate boolean values for Arrow format [#561](https://github.com/finos/perspective/pull/561)
- Rename charts [#187](https://github.com/finos/perspective/pull/187)
- correct testData file reference [#186](https://github.com/finos/perspective/pull/186)
- provide framework for centering tooltips, and apply to treemap [#182](https://github.com/finos/perspective/pull/182)
- use the native d3 treemap functionality to calculate the new coordina… [#183](https://github.com/finos/perspective/pull/183)
- finos migration [#184](https://github.com/finos/perspective/pull/184)
- titling mechanism for gridLayout charts made generic and shared. [#180](https://github.com/finos/perspective/pull/180)
- Fixed docs links [#559](https://github.com/finos/perspective/pull/559)
- Feature/treemap resizing [#179](https://github.com/finos/perspective/pull/179)
- Test/more unit tests [#181](https://github.com/finos/perspective/pull/181)
- Feature/treemap chart [#168](https://github.com/finos/perspective/pull/168)
- Store legend position and size in settings [#176](https://github.com/finos/perspective/pull/176)
- Fix tooltip for sunburst with no color [#177](https://github.com/finos/perspective/pull/177)
- Treat negative sunburst size values as zero [#178](https://github.com/finos/perspective/pull/178)
- Made date zoom button names consistent [#175](https://github.com/finos/perspective/pull/175)
- Minor refactor to settings configuration [#174](https://github.com/finos/perspective/pull/174)
- Allow settings to be restored before draw [#173](https://github.com/finos/perspective/pull/173)
- Initial implemenetation of save and restore [#170](https://github.com/finos/perspective/pull/170)
- Zoom y-axis to data on OHLC/Candlestick charts [#171](https://github.com/finos/perspective/pull/171)
- Added fixed zoom ranges for date x axis [#169](https://github.com/finos/perspective/pull/169)
- Support dates on the y-axis for heatmaps [#165](https://github.com/finos/perspective/pull/165)
- Simplify plugin interface code [#167](https://github.com/finos/perspective/pull/167)

# [v0.3.0-rc.1](https://github.com/perspective-dev/perspective/releases/tag/v0.3.0-rc.1)

_30 April 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.23...v0.3.0-rc.1))

Features

- Remove 'aggregate' syntax in engine [#552](https://github.com/finos/perspective/pull/552)
- Add 'styleElement' method to tell perspective-viewer to restyle picking up css changes [#553](https://github.com/finos/perspective/pull/553)

Misc

- Transfer perspective to finos [#558](https://github.com/finos/perspective/pull/558)
- D3fc default [#551](https://github.com/finos/perspective/pull/551)
- Filter control auto-focuses when dropped or modified [#557](https://github.com/finos/perspective/pull/557)
- Fixed issue when # of charts changes in highcharts multichart mode [#556](https://github.com/finos/perspective/pull/556)

# [v0.2.23](https://github.com/perspective-dev/perspective/releases/tag/v0.2.23)

_22 April 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.22...v0.2.23))

Misc

- Misc cleanup [#550](https://github.com/finos/perspective/pull/550)
- Added table ownership flag to `&lt;perspective-viewer&gt;` `delete()` method [#549](https://github.com/finos/perspective/pull/549)
- Remote arrow [#547](https://github.com/finos/perspective/pull/547)
- Hypergrid hover theme fix [#546](https://github.com/finos/perspective/pull/546)
- Called save and restore with the correct context [#544](https://github.com/finos/perspective/pull/544)
- Link click event example in README [#545](https://github.com/finos/perspective/pull/545)
- Fixed hypergrid formatting issue when only row-pivots are changed [#542](https://github.com/finos/perspective/pull/542)
- Refactored data_slice to return t_tscalar [#541](https://github.com/finos/perspective/pull/541)
- Remove header rows for column-only views [#540](https://github.com/finos/perspective/pull/540)

# [v0.2.22](https://github.com/perspective-dev/perspective/releases/tag/v0.2.22)

_10 April 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.21...v0.2.22))

Features

- D3fc plugin - Sunburst, color styles and bug fixes [#511](https://github.com/finos/perspective/pull/511)

Misc

- Updated Puppeteer docker image [#539](https://github.com/finos/perspective/pull/539)
- Hypergrid missing columns fix [#538](https://github.com/finos/perspective/pull/538)
- Upgraded Emscripten to 1.38.29 [#537](https://github.com/finos/perspective/pull/537)
- Updated benchmarked versions  [#536](https://github.com/finos/perspective/pull/536)
- D3fc plugin - Resizable legend and other tweaks [#534](https://github.com/finos/perspective/pull/534)
- Updated benchmarks, removed IS_DELTA flag [#533](https://github.com/finos/perspective/pull/533)
- Added save() and restore() methods to plugin API [#532](https://github.com/finos/perspective/pull/532)
- update plugin [#166](https://github.com/finos/perspective/pull/166)
- Merge latest jpmorganchase/perspective master changes into develop [#164](https://github.com/finos/perspective/pull/164)
- Sort by hidden [#531](https://github.com/finos/perspective/pull/531)
- Column sort fix [#529](https://github.com/finos/perspective/pull/529)
- Removed old files [#530](https://github.com/finos/perspective/pull/530)
- Fixed header click behavior to not resize or scroll grid [#528](https://github.com/finos/perspective/pull/528)
- API Refactor [#527](https://github.com/finos/perspective/pull/527)
- "Disable" chart when there is no data [#162](https://github.com/finos/perspective/pull/162)
- Fully implement data slice API [#526](https://github.com/finos/perspective/pull/526)
- Fixed `docs` task [#520](https://github.com/finos/perspective/pull/520)
- Fixed Hypergrid scroll stuttering [#521](https://github.com/finos/perspective/pull/521)
- Add row delta to View [#517](https://github.com/finos/perspective/pull/517)
- Use the same color range for all charts when split [#160](https://github.com/finos/perspective/pull/160)
- Fix issue #522: row count is correct on column-only views [#523](https://github.com/finos/perspective/pull/523)
- Support for live theme changes [#161](https://github.com/finos/perspective/pull/161)
- Test UI interaction in tooltip component [#159](https://github.com/finos/perspective/pull/159)
- Feature/legend resizable [#131](https://github.com/finos/perspective/pull/131)
- Implemented an example UI/D3 based unit test [#158](https://github.com/finos/perspective/pull/158)
- Merge latest changes [#157](https://github.com/finos/perspective/pull/157)
- Feature/parameter names [#156](https://github.com/finos/perspective/pull/156)
- Fix occasional integration test failure and some IE issues [#155](https://github.com/finos/perspective/pull/155)
- Allow for 2-column display when only 2 charts (#151) [#152](https://github.com/finos/perspective/pull/152)
- Allow for 2-column display when only 2 charts [#151](https://github.com/finos/perspective/pull/151)
- d3fc_plugin - sunburst chart, color changes and bug fixes [#150](https://github.com/finos/perspective/pull/150)
- update screenshots [#149](https://github.com/finos/perspective/pull/149)
- sunburst - add labels, don't display if no crossValue is supplied [#148](https://github.com/finos/perspective/pull/148)
- Sunburst centre now shows current level instead of parent [#147](https://github.com/finos/perspective/pull/147)
- Match arc opacity [#146](https://github.com/finos/perspective/pull/146)
- Fixed sunburst legend overlap [#145](https://github.com/finos/perspective/pull/145)
- Tweaked sizing code for sunburst charts` [#144](https://github.com/finos/perspective/pull/144)
- Improved colour-legend display and labels [#143](https://github.com/finos/perspective/pull/143)
- Test/sunburst integration [#141](https://github.com/finos/perspective/pull/141)
- merge view.config fix [#142](https://github.com/finos/perspective/pull/142)
- Refactor axis to use common implementation for x and y [#140](https://github.com/finos/perspective/pull/140)
- Sunburst Chart [#129](https://github.com/finos/perspective/pull/129)
- Fix/use get config [#139](https://github.com/finos/perspective/pull/139)
- Update develop from remote master [#138](https://github.com/finos/perspective/pull/138)
- Hide labels that would be clipped by the window bounds [#135](https://github.com/finos/perspective/pull/135)
- update screenshot results with new colours [#134](https://github.com/finos/perspective/pull/134)
- Implemented themable color ranges for heatmap and X/Y [#133](https://github.com/finos/perspective/pull/133)
-  Put color styles in settings so that they can be scoped to a chart [#125](https://github.com/finos/perspective/pull/125)

# [v0.2.21](https://github.com/perspective-dev/perspective/releases/tag/v0.2.21)

_3 April 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.20...v0.2.21))

Features

- Preparation for merging of perspective-python [#515](https://github.com/finos/perspective/pull/515)
- Make row titles configurable via plugin API [#512](https://github.com/finos/perspective/pull/512)
- D3fc plugin [#498](https://github.com/finos/perspective/pull/498)
- D3fc plugin - Basic OHLC and Candlestick charts [#488](https://github.com/finos/perspective/pull/488)
- d3fc plugin - Label rotation, interpolated legend, zooming, scatter chart things [#479](https://github.com/finos/perspective/pull/479)
- Get version from package json: fixes #423 [#481](https://github.com/finos/perspective/pull/481)

Misc

- `on_update` fix [#519](https://github.com/finos/perspective/pull/519)
- New package `perspective-cli` [#516](https://github.com/finos/perspective/pull/516)
- Hypergrid virtual columns & sort by click [#506](https://github.com/finos/perspective/pull/506)
- Fixed merge error in new plugin API access to `view.config` [#507](https://github.com/finos/perspective/pull/507)
- Added `get_config()` API to `view` [#503](https://github.com/finos/perspective/pull/503)
- Fixed expand/collapse on 2-sided pivots [#502](https://github.com/finos/perspective/pull/502)
- Fix pivot null update bug [#501](https://github.com/finos/perspective/pull/501)
- Fix build error and add unit test support [#132](https://github.com/finos/perspective/pull/132)
- Merge unit test functionality from perspective master [#130](https://github.com/finos/perspective/pull/130)
- Switched to new d3fc canvas gridline component [#127](https://github.com/finos/perspective/pull/127)
- D3FC unit test [#494](https://github.com/finos/perspective/pull/494)
- update plugin [#124](https://github.com/finos/perspective/pull/124)
- Add git commit [#123](https://github.com/finos/perspective/pull/123)
- Refresh screenshots [#121](https://github.com/finos/perspective/pull/121)
- refresh screenshots and update shares-template [#119](https://github.com/finos/perspective/pull/119)
- Local puppeteer [#497](https://github.com/finos/perspective/pull/497)
- Update plugin [#120](https://github.com/finos/perspective/pull/120)
-  Added integration screenshot tests for more d3fc charts [#117](https://github.com/finos/perspective/pull/117)
- Fixed legend when only one series [#118](https://github.com/finos/perspective/pull/118)
- Merge/jpmorganchase master [#116](https://github.com/finos/perspective/pull/116)
- `on_update` delta calculations are now lazy [#495](https://github.com/finos/perspective/pull/495)
- Do not show number on header indicator if only one column is sorted [#492](https://github.com/finos/perspective/pull/492)
- Fix sum abs agg [#493](https://github.com/finos/perspective/pull/493)
- Theme chart series from CSS and theme file [#114](https://github.com/finos/perspective/pull/114)
- Implemented selection events from d3fc plugin [#113](https://github.com/finos/perspective/pull/113)
- Added bollinger bands and moving average to candle/ohlc [#111](https://github.com/finos/perspective/pull/111)
- Implemented fix for missing final date value [#112](https://github.com/finos/perspective/pull/112)
- Fix webpack config load path [#491](https://github.com/finos/perspective/pull/491)
- Ensure that filter column stays active when filtering [#490](https://github.com/finos/perspective/pull/490)
- Switched ohlc and candlestick charts to canvas [#110](https://github.com/finos/perspective/pull/110)
- Refactored shared svg/canvas gridlines [#109](https://github.com/finos/perspective/pull/109)
- legend draggable and keys cropped [#98](https://github.com/finos/perspective/pull/98)
- Add candlestick/ohlc legend [#107](https://github.com/finos/perspective/pull/107)
- Add upColors and downColors to series [#102](https://github.com/finos/perspective/pull/102)
- update perspective-viewer-d3fc/test/results [#106](https://github.com/finos/perspective/pull/106)
- update perspective-viewer-d3fc/test/results [#105](https://github.com/finos/perspective/pull/105)
- Header sort indicator [#489](https://github.com/finos/perspective/pull/489)
- Basic OHLC and Candlestick charts [#104](https://github.com/finos/perspective/pull/104)
- Fixed some MS-Edge issues [#90](https://github.com/finos/perspective/pull/90)
- Removed old SVG X/Y chart and replace with the Canvas one [#88](https://github.com/finos/perspective/pull/88)
- Inverted y-axis domain for x-bar and heatmap to match highcharts [#79](https://github.com/finos/perspective/pull/79)
- Make sure colour-scale points still have semi-transparent fill [#75](https://github.com/finos/perspective/pull/75)
- Set back to reference "cjs" dependency, with yarn focus [#74](https://github.com/finos/perspective/pull/74)
- Apply XY point colour based on mainValue [#73](https://github.com/finos/perspective/pull/73)
- remove unnecessary slice [#101](https://github.com/finos/perspective/pull/101)
- D3fc plugin - "Nearby" tooltips for some charts [#484](https://github.com/finos/perspective/pull/484)
- Added window support to `to_arrow()` [#485](https://github.com/finos/perspective/pull/485)
- basic OHLC / candlestick charts [#95](https://github.com/finos/perspective/pull/95)
- Updated d3fc and used its new ordinalAxis [#99](https://github.com/finos/perspective/pull/99)
- Fixed lint_cpp script [#487](https://github.com/finos/perspective/pull/487)
- Fixed 0-sided schema [#486](https://github.com/finos/perspective/pull/486)
- Implement t_data_slice API for data extraction from 0 & 1-sided views [#483](https://github.com/finos/perspective/pull/483)
- Fixed some MS-Edge issues [#90](https://github.com/finos/perspective/pull/90)
- Removed old SVG X/Y chart and replace with the Canvas one [#88](https://github.com/finos/perspective/pull/88)
- Added candlestick chart [#97](https://github.com/finos/perspective/pull/97)
- Tooltip fixes [#96](https://github.com/finos/perspective/pull/96)
- Improved and simplified nearby-tooltip code and used on y-scatter [#92](https://github.com/finos/perspective/pull/92)
- Fix typo [#482](https://github.com/finos/perspective/pull/482)
- replace colour references with color [#91](https://github.com/finos/perspective/pull/91)
- Add tooltips for Area charts [#89](https://github.com/finos/perspective/pull/89)
- Fixed some MS-Edge issues [#90](https://github.com/finos/perspective/pull/90)
- Removed old SVG X/Y chart and replace with the Canvas one [#88](https://github.com/finos/perspective/pull/88)
- Updated d3fc and replaced local cartesianSvgChart [#87](https://github.com/finos/perspective/pull/87)
- Refactored tooltips into cartesian-chart component [#86](https://github.com/finos/perspective/pull/86)
- remove duplicate withOutOpacity method from seriesColours [#85](https://github.com/finos/perspective/pull/85)
- Inverted y-axis domain for x-bar and heatmap to match highcharts [#79](https://github.com/finos/perspective/pull/79)
- Make sure colour-scale points still have semi-transparent fill [#75](https://github.com/finos/perspective/pull/75)
- Set back to reference "cjs" dependency, with yarn focus [#74](https://github.com/finos/perspective/pull/74)
- Apply XY point colour based on mainValue [#73](https://github.com/finos/perspective/pull/73)
- Date filter issue [#478](https://github.com/finos/perspective/pull/478)

# [v0.2.20](https://github.com/perspective-dev/perspective/releases/tag/v0.2.20)

_7 March 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.19...v0.2.20))

Features

- D3fc plugin - area and heatmap charts [#463](https://github.com/finos/perspective/pull/463)

Misc

- Add t_data_slice for data output [#473](https://github.com/finos/perspective/pull/473)
- Fixed “not in” filter to array conversion in viewer [#477](https://github.com/finos/perspective/pull/477)
- Fixed calls to `update()` with empty list from throwing exception [#476](https://github.com/finos/perspective/pull/476)
- D3FC fixes [#474](https://github.com/finos/perspective/pull/474)
- Added ‘not in’ filter to `perspective-viewer` defaults [#475](https://github.com/finos/perspective/pull/475)
- CSV integer parse bug [#471](https://github.com/finos/perspective/pull/471)
- Fix for Juypterlab build-&gt;dist [#470](https://github.com/finos/perspective/pull/470)
- Update remote API to accept a `perspective.table()` [#469](https://github.com/finos/perspective/pull/469)
- Ported Javascript build, test and clean tasks to Windows [#468](https://github.com/finos/perspective/pull/468)
- Updated README [#465](https://github.com/finos/perspective/pull/465)
- Add perspective click to usage [#464](https://github.com/finos/perspective/pull/464)
- area chart, heatmap chart, and more [#66](https://github.com/finos/perspective/pull/66)
- Feature/heatmap [#61](https://github.com/finos/perspective/pull/61)
- removed deprecated and unused styling directory recursively. [#64](https://github.com/finos/perspective/pull/64)
- Feature/scatter chart extent zeroing responsive to range [#63](https://github.com/finos/perspective/pull/63)
- Hide overlapping labels in crossAxis [#62](https://github.com/finos/perspective/pull/62)
- added optional includeAggregates parameter for splitIntoMultiSeries f… [#59](https://github.com/finos/perspective/pull/59)
- Area chart needs to use new version of axis components [#60](https://github.com/finos/perspective/pull/60)
- Implemented Area Chart [#56](https://github.com/finos/perspective/pull/56)
- Feature/scatter chart extent zeroing responsive to range [#57](https://github.com/finos/perspective/pull/57)
- Update d3fc with fixed seriesSvgGrouped [#55](https://github.com/finos/perspective/pull/55)
- Use a custom (fixed) version of the seriesSvgGrouped component [#52](https://github.com/finos/perspective/pull/52)

# [v0.2.19](https://github.com/perspective-dev/perspective/releases/tag/v0.2.19)

_1 March 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.18...v0.2.19))

Misc

- Integration tests for D3FC [#458](https://github.com/finos/perspective/pull/458)
- Click event fix [#461](https://github.com/finos/perspective/pull/461)

# [v0.2.18](https://github.com/perspective-dev/perspective/releases/tag/v0.2.18)

_27 February 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.17...v0.2.18))

Misc

- Added missing `@babel/runtime` dependency [#459](https://github.com/finos/perspective/pull/459)

# [v0.2.17](https://github.com/perspective-dev/perspective/releases/tag/v0.2.17)

_27 February 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.16...v0.2.17))

Features

- D3fc plugin [#420](https://github.com/finos/perspective/pull/420)
- Add high chart click interactions [#444](https://github.com/finos/perspective/pull/444)

Misc

- Updated AUTHORS [#456](https://github.com/finos/perspective/pull/456)
- Removed NPM caching from travis config [#457](https://github.com/finos/perspective/pull/457)
- Fixes for `clean` and `bench` development scripts [#455](https://github.com/finos/perspective/pull/455)
- Port view to C++ [#452](https://github.com/finos/perspective/pull/452)
- Fixed babel compilation in `perspective-d3fc-plugin` package [#454](https://github.com/finos/perspective/pull/454)
- Fixed Github reported dependency vulnerabilities [#451](https://github.com/finos/perspective/pull/451)
- Added `shared_worker()` to ts definition [#453](https://github.com/finos/perspective/pull/453)
- Moved `perspective-jupyterlab` build from `build/` to `dist/` to work… [#450](https://github.com/finos/perspective/pull/450)
- Build cleanup [#448](https://github.com/finos/perspective/pull/448)
- Add tests for filtering datetime columns by string [#449](https://github.com/finos/perspective/pull/449)
- Purges phosphor and jlab tests  [#437](https://github.com/finos/perspective/pull/437)
- Fix regression on view expand [#445](https://github.com/finos/perspective/pull/445)
- Interactions click dispatch [#439](https://github.com/finos/perspective/pull/439)
- Some styling and tooltip hover changes [#51](https://github.com/finos/perspective/pull/51)
- Implemented X-Y chart [#41](https://github.com/finos/perspective/pull/41)
- Add gridlines [#36](https://github.com/finos/perspective/pull/36)
- rename '[d3fc] Y Line Chart 2' to '[d3fc] Y Line Chart' [#40](https://github.com/finos/perspective/pull/40)
- Removed old code (and references to it) from before restructure [#39](https://github.com/finos/perspective/pull/39)
- Moved the getChartElement helper into a new module [#38](https://github.com/finos/perspective/pull/38)
- Added line chart [#35](https://github.com/finos/perspective/pull/35)
- Minimum 1-pixel bandwidth [#32](https://github.com/finos/perspective/pull/32)
- Fix data filter for multiple GroupBy [#31](https://github.com/finos/perspective/pull/31)
- Add date/time and linear cross-axis scales [#30](https://github.com/finos/perspective/pull/30)
- Fixed css labelling and spacing and some Edge issues [#28](https://github.com/finos/perspective/pull/28)

# [v0.2.16](https://github.com/perspective-dev/perspective/releases/tag/v0.2.16)

_19 February 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.15...v0.2.16))

Features

- Phosphor bindings [#436](https://github.com/finos/perspective/pull/436)
- Write arrows [#435](https://github.com/finos/perspective/pull/435)
- Make sort syntax consistent in tests [#434](https://github.com/finos/perspective/pull/434)
- C++ subproject [#426](https://github.com/finos/perspective/pull/426)
- Tidy up dependencies [#427](https://github.com/finos/perspective/pull/427)
- Allow mac failures on travis, have travis fail fast [#428](https://github.com/finos/perspective/pull/428)
- [WIP] Better python build for location of shared objects.  [#415](https://github.com/finos/perspective/pull/415)

Misc

- Add `replace()` and `clear()` to table [#431](https://github.com/finos/perspective/pull/431)
- adding autodocumentation for python and C++ [#414](https://github.com/finos/perspective/pull/414)
- fixes #411 [#424](https://github.com/finos/perspective/pull/424)
- 0.2.15 changelog [#422](https://github.com/finos/perspective/pull/422)
- Port View to C++ [#413](https://github.com/finos/perspective/pull/413)

# [v0.2.15](https://github.com/perspective-dev/perspective/releases/tag/v0.2.15)

_7 February 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.14...v0.2.15))

Misc

- String column promotion [#421](https://github.com/finos/perspective/pull/421)
- limit to a single build (15 minutes) until we have more resources [#418](https://github.com/finos/perspective/pull/418)
- Fixed cross origin detection bug [#419](https://github.com/finos/perspective/pull/419)
- `null` category axis fix [#416](https://github.com/finos/perspective/pull/416)
- Fix isCrossOrigin function issue for non-webpack builds  [#412](https://github.com/finos/perspective/pull/412)

# [v0.2.14](https://github.com/perspective-dev/perspective/releases/tag/v0.2.14)

_4 February 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.13...v0.2.14))

Misc

- Webpack fix [#409](https://github.com/finos/perspective/pull/409)
- Added `flush()` method to `&lt;perspective-viewer&gt;` [#408](https://github.com/finos/perspective/pull/408)

# [v0.2.13](https://github.com/perspective-dev/perspective/releases/tag/v0.2.13)

_4 February 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.12...v0.2.13))

Misc

- Date parsing bug [#407](https://github.com/finos/perspective/pull/407)
- Add publicPath support to webpack-plugin  [#403](https://github.com/finos/perspective/pull/403)
- Fixed CSS regression in Chrome canary, fixed example docs [#405](https://github.com/finos/perspective/pull/405)
- add another IEX demo [#404](https://github.com/finos/perspective/pull/404)
- expand os for c++ testing [#402](https://github.com/finos/perspective/pull/402)
- adding iex streaming example to readme [#401](https://github.com/finos/perspective/pull/401)
- Empty filters [#387](https://github.com/finos/perspective/pull/387)
- perspective-webpack-plugin [#399](https://github.com/finos/perspective/pull/399)
- Point README links to blocks [#400](https://github.com/finos/perspective/pull/400)
- Adding FINOS badge [#397](https://github.com/finos/perspective/pull/397)
- Output CJS files perspective package [#392](https://github.com/finos/perspective/pull/392)
- C++ Date Validation [#396](https://github.com/finos/perspective/pull/396)
- Benchmark limit + minor changes to DataAccessor [#395](https://github.com/finos/perspective/pull/395)
- Update Webpack example to webpack 4 [#393](https://github.com/finos/perspective/pull/393)
- Output CJS module bundles for perspective-viewer packages [#391](https://github.com/finos/perspective/pull/391)
- Websocket heartbeat detection [#394](https://github.com/finos/perspective/pull/394)
- [WIP] Merging JS and Python binding code - Part 2 [#389](https://github.com/finos/perspective/pull/389)
- Remove cross /src imports in packages [#390](https://github.com/finos/perspective/pull/390)

# [v0.2.12](https://github.com/perspective-dev/perspective/releases/tag/v0.2.12)

_18 January 2019_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.11...v0.2.12))

Features

- C++ tests [#383](https://github.com/finos/perspective/pull/383)
- Interoperability between CMAKE_BUILD_TYPE and PSP_DEBUG [#381](https://github.com/finos/perspective/pull/381)
- Invalid filters [#375](https://github.com/finos/perspective/pull/375)
- remove boost::format [#374](https://github.com/finos/perspective/pull/374)
- reorganize cpp test directory for better organization [#371](https://github.com/finos/perspective/pull/371)

Fixes

- Fixes local cpp build -&gt; need to cd into build dir (not needed on docker, working dir is set) [#373](https://github.com/finos/perspective/pull/373)

Misc

- Re-enable cpp warnings [#386](https://github.com/finos/perspective/pull/386)
- Debug fix [#385](https://github.com/finos/perspective/pull/385)
- Correctly type parse numbers wrapped in strings [#370](https://github.com/finos/perspective/pull/370)
- fix mac ending [#369](https://github.com/finos/perspective/pull/369)
- Promote column [#367](https://github.com/finos/perspective/pull/367)
- adding readme for python [#366](https://github.com/finos/perspective/pull/366)
- Test and lint python [#365](https://github.com/finos/perspective/pull/365)
- Add missing dependencies [#364](https://github.com/finos/perspective/pull/364)
- Python build fix [#363](https://github.com/finos/perspective/pull/363)
- Removed regenerator-plugin in favor of fast-async [#357](https://github.com/finos/perspective/pull/357)
- Fix merge error with renamed types #358 [#361](https://github.com/finos/perspective/pull/361)
- Python Bindings [#356](https://github.com/finos/perspective/pull/356)
- Removed type abstractions [#355](https://github.com/finos/perspective/pull/355)
- Test quality-of-life updates [#354](https://github.com/finos/perspective/pull/354)
- Build & performance fixes [#353](https://github.com/finos/perspective/pull/353)
- Unified data access interface [#352](https://github.com/finos/perspective/pull/352)
- Adding test harness for jupyterlab extension [#351](https://github.com/finos/perspective/pull/351)

# [v0.2.11](https://github.com/perspective-dev/perspective/releases/tag/v0.2.11)

_20 December 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.10...v0.2.11))

Misc

- New benchmarks [#350](https://github.com/finos/perspective/pull/350)
- making cpp a first class citizen again [#346](https://github.com/finos/perspective/pull/346)
- Change transpose button to two-way arrow [#348](https://github.com/finos/perspective/pull/348)
- adding support for apache arrow in jlab [#345](https://github.com/finos/perspective/pull/345)
- Fix #291 Null values in filters [#344](https://github.com/finos/perspective/pull/344)
- Empty string column type inference fix [#343](https://github.com/finos/perspective/pull/343)

# [v0.2.10](https://github.com/perspective-dev/perspective/releases/tag/v0.2.10)

_9 December 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.9...v0.2.10))

Misc

- Cleanup for port_data_parser branch [#339](https://github.com/finos/perspective/pull/339)
- Port data_types and get_data_type [#336](https://github.com/finos/perspective/pull/336)
- Visual polish [#338](https://github.com/finos/perspective/pull/338)
- Test stability [#337](https://github.com/finos/perspective/pull/337)
- Port infer_type and column_names to C++ [#334](https://github.com/finos/perspective/pull/334)
- Build into dist, plays nicer with ipywidgets [#335](https://github.com/finos/perspective/pull/335)
- Parallel tests [#332](https://github.com/finos/perspective/pull/332)
- Material fixes [#330](https://github.com/finos/perspective/pull/330)
- Refactor parse_data [#329](https://github.com/finos/perspective/pull/329)
- Viewer memory leak on delete() [#328](https://github.com/finos/perspective/pull/328)

# [v0.2.9](https://github.com/perspective-dev/perspective/releases/tag/v0.2.9)

_25 November 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.8...v0.2.9))

Misc

- UX Cleanup [#327](https://github.com/finos/perspective/pull/327)
- Added a new example [#324](https://github.com/finos/perspective/pull/324)
- Use Yarn workspaces as a drop-in for Lerna [#320](https://github.com/finos/perspective/pull/320)
- Fun Animations! [#326](https://github.com/finos/perspective/pull/326)
- Full column sort [#325](https://github.com/finos/perspective/pull/325)

# [v0.2.8](https://github.com/perspective-dev/perspective/releases/tag/v0.2.8)

_21 November 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.7...v0.2.8))

Misc

- Column pivot sort [#319](https://github.com/finos/perspective/pull/319)
- Context sort [#317](https://github.com/finos/perspective/pull/317)
- Refactor make_table [#311](https://github.com/finos/perspective/pull/311)
- Further refactored PerspectiveViewer [#313](https://github.com/finos/perspective/pull/313)
- Fix weighted mean null/missing value handling [#315](https://github.com/finos/perspective/pull/315)
- docs: update installation guide [#312](https://github.com/finos/perspective/pull/312)
- Jupyterlab plugin: Cleanup and computed columns [#310](https://github.com/finos/perspective/pull/310)
- Typo [#309](https://github.com/finos/perspective/pull/309)
- Added Jupyterlab plugin install docs [#308](https://github.com/finos/perspective/pull/308)
- Jupyterlab plugin feature improvements [#307](https://github.com/finos/perspective/pull/307)
- Fixed webpack build for Jupyterlab [#306](https://github.com/finos/perspective/pull/306)

# [v0.2.7](https://github.com/perspective-dev/perspective/releases/tag/v0.2.7)

_12 November 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.6...v0.2.7))

Misc

- Fixed package error which excluded perspective from it's own plugin [#304](https://github.com/finos/perspective/pull/304)

# [v0.2.6](https://github.com/perspective-dev/perspective/releases/tag/v0.2.6)

_12 November 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.5...v0.2.6))

Misc

- Integration fixes [#303](https://github.com/finos/perspective/pull/303)
- Reorganize ViewPrivate [#302](https://github.com/finos/perspective/pull/302)

# [v0.2.5](https://github.com/perspective-dev/perspective/releases/tag/v0.2.5)

_9 November 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.4...v0.2.5))

Misc

- Ported to babel 7 [#301](https://github.com/finos/perspective/pull/301)

# [v0.2.4](https://github.com/perspective-dev/perspective/releases/tag/v0.2.4)

_8 November 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.3...v0.2.4))

Misc

- Toolbar [#299](https://github.com/finos/perspective/pull/299)
- Release bugs [#298](https://github.com/finos/perspective/pull/298)
- Move ViewPrivate into a separate file [#297](https://github.com/finos/perspective/pull/297)
- Moved babel-polyfill to avoid webpack/babel bug [#296](https://github.com/finos/perspective/pull/296)
- Worker loader [#295](https://github.com/finos/perspective/pull/295)
- Add warnings when data to be rendered will slow down browser [#290](https://github.com/finos/perspective/pull/290)
- Move drag/drop into separate file, clean up row, move detectIE/detectChrome from perspective into perspective-viewer [#293](https://github.com/finos/perspective/pull/293)
- Replace _column_view with semantically named methods [#294](https://github.com/finos/perspective/pull/294)
- Refactor __WORKER__ into proper singleton [#292](https://github.com/finos/perspective/pull/292)

# [v0.2.3](https://github.com/perspective-dev/perspective/releases/tag/v0.2.3)

_25 October 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.2...v0.2.3))

Features

- Change `restore()` to be a promise which resolves on apply [#287](https://github.com/finos/perspective/pull/287)
- Shadow DOM [#286](https://github.com/finos/perspective/pull/286)
- Date types [#271](https://github.com/finos/perspective/pull/271)

Fixes

- Need to specify variable name in type declaration [#279](https://github.com/finos/perspective/pull/279)
- Computed columns broken with delta updates on non-dependent columns [#274](https://github.com/finos/perspective/pull/274)

Misc

- Fixed x axis rendering bug #164 [#289](https://github.com/finos/perspective/pull/289)
- Fixed empty hypergrid loading error #264 [#288](https://github.com/finos/perspective/pull/288)
- Fix computed column UX issues [#283](https://github.com/finos/perspective/pull/283)
- Expose view columns as TypedArrays [#273](https://github.com/finos/perspective/pull/273)
- Added developer docs and updated contributing.md [#282](https://github.com/finos/perspective/pull/282)
- update to jupyterlab 0.35.x [#284](https://github.com/finos/perspective/pull/284)
- Expansion depth should be stable across updates [#277](https://github.com/finos/perspective/pull/277)
- Move C++ to top level directory [#266](https://github.com/finos/perspective/pull/266)
- Cleanup cpp api [#275](https://github.com/finos/perspective/pull/275)

# [v0.2.2](https://github.com/perspective-dev/perspective/releases/tag/v0.2.2)

_8 October 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.1...v0.2.2))

Features

- Added support for chunked arrows [#268](https://github.com/finos/perspective/pull/268)

Fixes

- Canary css fix [#269](https://github.com/finos/perspective/pull/269)

Misc

- New examples [#267](https://github.com/finos/perspective/pull/267)
- Can't remove from an array while iterating it's indices [#263](https://github.com/finos/perspective/pull/263)
- Misc fixes accumulated from external PRs [#261](https://github.com/finos/perspective/pull/261)
- Fix bug with pkey column update with missing agg value [#258](https://github.com/finos/perspective/pull/258)
- Bind functions [#260](https://github.com/finos/perspective/pull/260)
- Fixed bug which caused computed-columns creation to break updates in … [#259](https://github.com/finos/perspective/pull/259)
- Added options dict to viewer load method [#256](https://github.com/finos/perspective/pull/256)
- Add 'not in' filter operation [#255](https://github.com/finos/perspective/pull/255)
- Added positive/negative color & font to Hypergrid CSS style [#254](https://github.com/finos/perspective/pull/254)

# [v0.2.1](https://github.com/perspective-dev/perspective/releases/tag/v0.2.1)

_1 October 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.0...v0.2.1))

Misc

- IE fix [#253](https://github.com/finos/perspective/pull/253)

# [v0.2.0](https://github.com/perspective-dev/perspective/releases/tag/v0.2.0)

_1 October 2018_ ([Full changelog](https://github.com/finos/perspective/compare/0.2.0-beta.3...v0.2.0))

Misc

- Fixed hover tooltips on y_scatter charts [#252](https://github.com/finos/perspective/pull/252)
- Updated documentation [#250](https://github.com/finos/perspective/pull/250)
- Moved LESS formatting to prettier;  added clean-css to LESS build [#251](https://github.com/finos/perspective/pull/251)
- Refactor examples [#249](https://github.com/finos/perspective/pull/249)
- 1D charts generated from columnar data [#231](https://github.com/finos/perspective/pull/231)

# [0.2.0-beta.3](https://github.com/perspective-dev/perspective/releases/tag/0.2.0-beta.3)

_24 September 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.0-beta.3...0.2.0-beta.3))


# [v0.2.0-beta.3](https://github.com/perspective-dev/perspective/releases/tag/v0.2.0-beta.3)

_24 September 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.0-beta.2...v0.2.0-beta.3))

Misc

- Fixed cross origin asset resolution failure [#248](https://github.com/finos/perspective/pull/248)
- Column resize fix refactor [#246](https://github.com/finos/perspective/pull/246)
- Better documentation for `worker()` method usage in node.js & the bro… [#245](https://github.com/finos/perspective/pull/245)
- Clang format [#244](https://github.com/finos/perspective/pull/244)
- Add eslint-prettier [#242](https://github.com/finos/perspective/pull/242)

# [v0.2.0-beta.2](https://github.com/perspective-dev/perspective/releases/tag/v0.2.0-beta.2)

_17 September 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.2.0-beta.1...v0.2.0-beta.2))

Misc

- Added `y_scatter` chart type [#241](https://github.com/finos/perspective/pull/241)

# [v0.2.0-beta.1](https://github.com/perspective-dev/perspective/releases/tag/v0.2.0-beta.1)

_17 September 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.18...v0.2.0-beta.1))

Misc

- Computed persistence [#240](https://github.com/finos/perspective/pull/240)
- Limit tables [#239](https://github.com/finos/perspective/pull/239)
- Fixed column-oriented output with column-only pivot [#238](https://github.com/finos/perspective/pull/238)
- WebsocketHost HTTP support + GIT example [#237](https://github.com/finos/perspective/pull/237)
- Null fix [#233](https://github.com/finos/perspective/pull/233)
- Add ESLint [#236](https://github.com/finos/perspective/pull/236)
- Remove nested build dirs [#234](https://github.com/finos/perspective/pull/234)
- Added perspective gitter banner to README.md [#235](https://github.com/finos/perspective/pull/235)
- Added Jupyter API for incremental updates [#230](https://github.com/finos/perspective/pull/230)
- Cpp tests [#225](https://github.com/finos/perspective/pull/225)
- Add Travis node_modules caching [#229](https://github.com/finos/perspective/pull/229)
- Refactored `load()` method to a Promise; updated expand/collapse API … [#228](https://github.com/finos/perspective/pull/228)
- Computed columns with multiple parameters [#223](https://github.com/finos/perspective/pull/223)
- Jupyterlab plugin ipywidget [#222](https://github.com/finos/perspective/pull/222)
- Upgraded to emscripten 1.38.11 [#219](https://github.com/finos/perspective/pull/219)
- Added PSP_CPU_COUNT env var [#221](https://github.com/finos/perspective/pull/221)
- Simpler implementation of aggregate fix [#220](https://github.com/finos/perspective/pull/220)
- Null aggregate fix [#217](https://github.com/finos/perspective/pull/217)
- Asm.js tests [#215](https://github.com/finos/perspective/pull/215)
- Computed columns retain persistent aggregates and show/hide [#214](https://github.com/finos/perspective/pull/214)
- First & Last by Index Aggregates [#211](https://github.com/finos/perspective/pull/211)
- Column oriented partial update [#208](https://github.com/finos/perspective/pull/208)
- Mean fix [#206](https://github.com/finos/perspective/pull/206)
- bump dependencies [#203](https://github.com/finos/perspective/pull/203)
- More cleanup + OS X [#202](https://github.com/finos/perspective/pull/202)
- Fixed typescript/webpack file resolution error [#204](https://github.com/finos/perspective/pull/204)
- Drop python [#198](https://github.com/finos/perspective/pull/198)
- Computed columns [#197](https://github.com/finos/perspective/pull/197)
- Assorted bug fixes [#195](https://github.com/finos/perspective/pull/195)
- Memory leak fix [#194](https://github.com/finos/perspective/pull/194)
- Allow table.update() to accept partial rows [#192](https://github.com/finos/perspective/pull/192)
- Fixed Hypergrid regression in column-only pivot [#191](https://github.com/finos/perspective/pull/191)
- Remote performance [#190](https://github.com/finos/perspective/pull/190)
- Fixing filters when setting multiple filters per column [#189](https://github.com/finos/perspective/pull/189)
- Refactored remote library into regular `perspective.js` [#188](https://github.com/finos/perspective/pull/188)
- Remote perspective [#187](https://github.com/finos/perspective/pull/187)
- Add tests and fix for regressed column update. [#186](https://github.com/finos/perspective/pull/186)
- Schema fix [#185](https://github.com/finos/perspective/pull/185)
- Elaborated Jupyterlab plugin documentation, added example notebook [#184](https://github.com/finos/perspective/pull/184)
- Merge from fork [#182](https://github.com/finos/perspective/pull/182)
- Added new persistent, node.js benchmark suite [#181](https://github.com/finos/perspective/pull/181)
- Updated webcomponentsjs [#180](https://github.com/finos/perspective/pull/180)
- Refactor Material Theme [#178](https://github.com/finos/perspective/pull/178)

# [v0.1.18](https://github.com/perspective-dev/perspective/releases/tag/v0.1.18)

_1 August 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.17...v0.1.18))

Misc

- Responsive sidebar [#175](https://github.com/finos/perspective/pull/175)
- Don't exclude @apache-arrow from babel [#177](https://github.com/finos/perspective/pull/177)
- upping jlab dependencies [#174](https://github.com/finos/perspective/pull/174)
- Fixed Jest regression [#176](https://github.com/finos/perspective/pull/176)
- Better comparisons for benchmarks [#173](https://github.com/finos/perspective/pull/173)
- Fixed hover colors [#172](https://github.com/finos/perspective/pull/172)
- Jupyter embedded mode [#170](https://github.com/finos/perspective/pull/170)
- fix for #160 [#168](https://github.com/finos/perspective/pull/168)
- Run tests in parallel [#166](https://github.com/finos/perspective/pull/166)
- Material tooltip [#167](https://github.com/finos/perspective/pull/167)
- small style fixes [#163](https://github.com/finos/perspective/pull/163)
- Highcharts Tooltips [#162](https://github.com/finos/perspective/pull/162)
- Forgo publishing cpp source code [#161](https://github.com/finos/perspective/pull/161)
- Add typing for perspective [#157](https://github.com/finos/perspective/pull/157)
- Release fixes [#158](https://github.com/finos/perspective/pull/158)
- Split Build Steps into individual tasks [#156](https://github.com/finos/perspective/pull/156)

# [v0.1.17](https://github.com/perspective-dev/perspective/releases/tag/v0.1.17)

_10 July 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.16...v0.1.17))

Misc

- Fixed csv.html example [#155](https://github.com/finos/perspective/pull/155)
- Update fin-hypergrid-grouped-header-plugin to 1.2.4 [#154](https://github.com/finos/perspective/pull/154)
- Added simple clipboard API [#152](https://github.com/finos/perspective/pull/152)
- To csv [#150](https://github.com/finos/perspective/pull/150)
- Hypergrid expand/collapse on tree columns. [#148](https://github.com/finos/perspective/pull/148)
- Dropdown styling fix [#147](https://github.com/finos/perspective/pull/147)
- Bug fixes 2 [#145](https://github.com/finos/perspective/pull/145)

# [v0.1.16](https://github.com/perspective-dev/perspective/releases/tag/v0.1.16)

_2 July 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.15...v0.1.16))

Misc

- Fixed hypergrid deletion bug. [#144](https://github.com/finos/perspective/pull/144)
- Fixed Hypergrid lazy data model scroll performance bug [#143](https://github.com/finos/perspective/pull/143)
- Added an example of loading a CSV client side [#142](https://github.com/finos/perspective/pull/142)
- Fix event ordering bug when switching visualization types [#141](https://github.com/finos/perspective/pull/141)
- Smart column selection when switching visualization plugin [#140](https://github.com/finos/perspective/pull/140)
- Hypergrid 3 [#139](https://github.com/finos/perspective/pull/139)
- New labels [#137](https://github.com/finos/perspective/pull/137)
- Fixed IE regressions [#134](https://github.com/finos/perspective/pull/134)

# [v0.1.15](https://github.com/perspective-dev/perspective/releases/tag/v0.1.15)

_11 June 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.14...v0.1.15))

Misc

- Fixed datetime category axes [#133](https://github.com/finos/perspective/pull/133)
- Cleaned up code, fixed chart offset regression in material theme. [#132](https://github.com/finos/perspective/pull/132)
- Multi chart mode for Treemap and Sunburst charts [#131](https://github.com/finos/perspective/pull/131)
- Made y_area charts stacked by default [#130](https://github.com/finos/perspective/pull/130)
- Added category axis support to xy_ charts [#129](https://github.com/finos/perspective/pull/129)

# [v0.1.14](https://github.com/perspective-dev/perspective/releases/tag/v0.1.14)

_4 June 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.13...v0.1.14))

Misc

- New docs [#127](https://github.com/finos/perspective/pull/127)
- Namespaced -viewer events, documented, added view update event. [#126](https://github.com/finos/perspective/pull/126)
- Ignore boost in perspective cpp [#124](https://github.com/finos/perspective/pull/124)
- Add `emscripten` docker container [#114](https://github.com/finos/perspective/pull/114)
- Boost mode for line charts [#125](https://github.com/finos/perspective/pull/125)
- Fixed scatter bug [#123](https://github.com/finos/perspective/pull/123)
- Highcharts refactor [#122](https://github.com/finos/perspective/pull/122)
- Adding dark mode via theme [#121](https://github.com/finos/perspective/pull/121)
- Grid styles [#120](https://github.com/finos/perspective/pull/120)

# [v0.1.13](https://github.com/perspective-dev/perspective/releases/tag/v0.1.13)

_22 May 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.12...v0.1.13))

Misc

- UI theme support [#119](https://github.com/finos/perspective/pull/119)
- Adding template polyfill for browsers that do not support the template tag [#118](https://github.com/finos/perspective/pull/118)

# [v0.1.12](https://github.com/perspective-dev/perspective/releases/tag/v0.1.12)

_18 May 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.11...v0.1.12))

Misc

- Fixed hidden column regression [#117](https://github.com/finos/perspective/pull/117)

# [v0.1.11](https://github.com/perspective-dev/perspective/releases/tag/v0.1.11)

_18 May 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.10...v0.1.11))

Misc

- Re-added remove() feature from bad merge [#116](https://github.com/finos/perspective/pull/116)
- Added tests to verify deletions cause no errors [#115](https://github.com/finos/perspective/pull/115)
- Fixed heatmap legend direction [#113](https://github.com/finos/perspective/pull/113)

# [v0.1.10](https://github.com/perspective-dev/perspective/releases/tag/v0.1.10)

_17 May 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.9...v0.1.10))

Misc

- Sunburst charts [#112](https://github.com/finos/perspective/pull/112)
- Added 'remove' command to perspective.table [#111](https://github.com/finos/perspective/pull/111)
- Support for initializing with schema [#110](https://github.com/finos/perspective/pull/110)
- Sort order [#107](https://github.com/finos/perspective/pull/107)
- Custom element decorators [#105](https://github.com/finos/perspective/pull/105)
- Allow empty strings in arrow columns  (as disctinct from null values) [#103](https://github.com/finos/perspective/pull/103)
- Bug fixes 0.1.9 [#102](https://github.com/finos/perspective/pull/102)

# [v0.1.9](https://github.com/perspective-dev/perspective/releases/tag/v0.1.9)

_24 April 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.8...v0.1.9))

Misc

- Fixed -examples modules [#98](https://github.com/finos/perspective/pull/98)
- Rebuild [#97](https://github.com/finos/perspective/pull/97)
- Removed perspective-common module [#96](https://github.com/finos/perspective/pull/96)
- Custom elements v1 [#95](https://github.com/finos/perspective/pull/95)
- comm is a promise now, upping jlab version, upping package version [#94](https://github.com/finos/perspective/pull/94)
- Date filters [#93](https://github.com/finos/perspective/pull/93)

# [v0.1.8](https://github.com/perspective-dev/perspective/releases/tag/v0.1.8)

_16 April 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.7...v0.1.8))

Misc

- Add support for javascript defined custom columns [#88](https://github.com/finos/perspective/pull/88)
- New viewer filters [#92](https://github.com/finos/perspective/pull/92)
- Highcharts refactor [#91](https://github.com/finos/perspective/pull/91)
- Fixed perspective-viewer load order regression, when a schema is used… [#87](https://github.com/finos/perspective/pull/87)

# [v0.1.7](https://github.com/perspective-dev/perspective/releases/tag/v0.1.7)

_5 April 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.6...v0.1.7))

Misc

- More highcharts modes [#86](https://github.com/finos/perspective/pull/86)

# [v0.1.6](https://github.com/perspective-dev/perspective/releases/tag/v0.1.6)

_3 April 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.5...v0.1.6))

Misc

- Style fixes. [#85](https://github.com/finos/perspective/pull/85)
- Weighted mean API [#84](https://github.com/finos/perspective/pull/84)
- Fix setting the aggregate attribute on perspective-viewer [#83](https://github.com/finos/perspective/pull/83)
- Windows 10 installation instructions [#78](https://github.com/finos/perspective/pull/78)
- Better date formatting for plugins #67  [#82](https://github.com/finos/perspective/pull/82)

# [v0.1.5](https://github.com/perspective-dev/perspective/releases/tag/v0.1.5)

_30 March 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.4...v0.1.5))

Misc

- Viewer fixes [#80](https://github.com/finos/perspective/pull/80)
- Properly handle case when there is no data [#77](https://github.com/finos/perspective/pull/77)
- Fixed ellipsis to show when column names extend past visible panel. [#74](https://github.com/finos/perspective/pull/74)
- Boost mode for Highcharts scatter+heatmaps [#73](https://github.com/finos/perspective/pull/73)

# [v0.1.4](https://github.com/perspective-dev/perspective/releases/tag/v0.1.4)

_12 March 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.3...v0.1.4))

Misc

- Various fixes for layout, drag-and-drop [#69](https://github.com/finos/perspective/pull/69)
- Reset & more conservative default column selection [#68](https://github.com/finos/perspective/pull/68)

# [v0.1.3](https://github.com/perspective-dev/perspective/releases/tag/v0.1.3)

_8 March 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.2...v0.1.3))

Misc

- Added table and view deletion callbacks [#64](https://github.com/finos/perspective/pull/64)
- Remove specification of index column type from API [#63](https://github.com/finos/perspective/pull/63)
- Scatter labels to show pivot values [#60](https://github.com/finos/perspective/pull/60)

# [v0.1.2](https://github.com/perspective-dev/perspective/releases/tag/v0.1.2)

_26 February 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.1...v0.1.2))

Misc

- Bug Fixes [#58](https://github.com/finos/perspective/pull/58)
- Various bug fixes. [#57](https://github.com/finos/perspective/pull/57)
- Support Dict arrays with Binary vectors [#54](https://github.com/finos/perspective/pull/54)
- change mime renderer type to not interfere with saving notebook [#52](https://github.com/finos/perspective/pull/52)
- Bug fixes for perspective-viewer. [#50](https://github.com/finos/perspective/pull/50)
- Copy arrow dictionary directly [#49](https://github.com/finos/perspective/pull/49)
- Script fixes [#48](https://github.com/finos/perspective/pull/48)
- Add test file for internal apis [#47](https://github.com/finos/perspective/pull/47)
- Heatmap implementation for perspective-viewer-highcharts plugin [#46](https://github.com/finos/perspective/pull/46)
- Test for various arrow timestamp resolutions, and proper psp column types [#45](https://github.com/finos/perspective/pull/45)
- Update API to use transferable when available [#44](https://github.com/finos/perspective/pull/44)
- Refactored Highcharts imports to use heatmap module from base package. [#43](https://github.com/finos/perspective/pull/43)
- Add transferable support for binary arrow files [#42](https://github.com/finos/perspective/pull/42)
- Support ns and us time resolutions [#41](https://github.com/finos/perspective/pull/41)
- Actually the port number is 8080 NOT 8081 [#39](https://github.com/finos/perspective/pull/39)
- removing lantern dependency [#34](https://github.com/finos/perspective/pull/34)
- Add link for "emsdk" installation. [#31](https://github.com/finos/perspective/pull/31)
- Fixes #14: Fixing issue with encoding, data only [#29](https://github.com/finos/perspective/pull/29)
- README missing hyphen [#25](https://github.com/finos/perspective/pull/25)
- spelling fix, no content changes [#26](https://github.com/finos/perspective/pull/26)
- Fixes ScriptPath for script paths with query strings [#28](https://github.com/finos/perspective/pull/28)
- Remove seemingly unnecessary install step in README.md [#30](https://github.com/finos/perspective/pull/30)
- Support binary type (for non-unicode string data) [#24](https://github.com/finos/perspective/pull/24)
- bugfix for jupyter compat [#23](https://github.com/finos/perspective/pull/23)

# [v0.1.1](https://github.com/perspective-dev/perspective/releases/tag/v0.1.1)

_5 February 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.1.0...v0.1.1))

Misc

- JupyterLab extension for perspective rendering [#17](https://github.com/finos/perspective/pull/17)
- Arrow improvements [#22](https://github.com/finos/perspective/pull/22)
- Firefox doesn't support 'new Date("date string")' for arbitrary date … [#20](https://github.com/finos/perspective/pull/20)
- Internal cleanup of gnode/pool api [#19](https://github.com/finos/perspective/pull/19)
- Refactor pkey/op creation for tables to work across text and arrow data [#18](https://github.com/finos/perspective/pull/18)

# [v0.1.0](https://github.com/perspective-dev/perspective/releases/tag/v0.1.0)

_31 January 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.0.2...v0.1.0))

Misc

- Column-only pivoting. [#15](https://github.com/finos/perspective/pull/15)
- Initial support for loading Apache Arrow data [#11](https://github.com/finos/perspective/pull/11)
- Don't rely on internal embind implementation for the type of context … [#10](https://github.com/finos/perspective/pull/10)
- A new column chooser UX which also allows column reordering. [#9](https://github.com/finos/perspective/pull/9)

# [v0.0.2](https://github.com/perspective-dev/perspective/releases/tag/v0.0.2)

_8 January 2018_ ([Full changelog](https://github.com/finos/perspective/compare/v0.0.1...v0.0.2))

Misc

- Hypergrid plugin modified to load data from perspective lazily. Significantly improves performance on large datasets. [#5](https://github.com/finos/perspective/pull/5)
- Incremental Hypergrid loading;  viewer transform updates no longer stack. [#4](https://github.com/finos/perspective/pull/4)

# [v0.0.1](https://github.com/perspective-dev/perspective/releases/tag/v0.0.1)

_31 December 2017_ ([Full changelog](null))

Misc

- General test suite improvements for speed, coverage, reproducibility, and developer quality-of-life. [#3](https://github.com/finos/perspective/pull/3)
- UI integration tests via Jest + Puppeteer. [#2](https://github.com/finos/perspective/pull/2)
- README corrections [#1](https://github.com/finos/perspective/pull/1)

