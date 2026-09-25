# Developer Guide (How to build Perspective from this repo)

This guide will teach you everything you need to know to get started hacking on
the Perspective codebase. Please see [`CONTRIBUTING.md`](CONTRIBUTING.md) for
contribution guidelines.

If you're coming to this project as principally a JavaScript developer, please
be aware that Perspective is quite a bit more complex than a typical NPM package
due to the mixed-language nature of the project; we've done quite a bit to make
sure the newcomer experience is as straightforward as possible, but some things
might not work the way you're used to!

Perspective is organized as a
[monorepo](https://github.com/babel/babel/blob/master/doc/design/monorepo.md),
and uses [pnpm workspaces](https://pnpm.io/workspaces) to manage dependencies.
All commands in this guide are run from the repository root.

| Path                                                          | Contents                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `rust/perspective-server`                                     | The C++ engine, compiled natively and to WebAssembly via Emscripten  |
| `rust/perspective-client`                                     | Rust client, `perspective.proto` and the Virtual Server framework    |
| `rust/perspective-js`                                         | `@perspective-dev/client`, the JavaScript/WebAssembly bindings       |
| `rust/perspective-python`                                     | `perspective-python`, the [PyO3](https://pyo3.rs) bindings           |
| `rust/perspective-viewer`                                     | `@perspective-dev/viewer`, the `<perspective-viewer>` Custom Element |
| `rust/perspective`                                            | The `perspective` Rust crate                                         |
| `packages/viewer-datagrid`, `packages/viewer-charts`          | Viewer plugins                                                       |
| `packages/react`, `packages/jupyterlab`, `packages/anywidget` | Framework and notebook integrations                                  |
| `tools/scripts`, `tools/test`, `tools/bench`                  | Build scripts, the shared test harness and the benchmark suite       |
| `examples`, `docs`                                            | Example projects and the documentation site                          |

This guide provides instructions for the JavaScript, Python and Rust libraries.
To choose which packages your development toolchain builds and tests, use
`pnpm run setup`. Once the setup script has been run, common commands like
`pnpm run build` and `pnpm run test` automatically call the correct build and
test tools for the selected packages.

### System Dependencies

`Perspective.js` and `perspective-python` **require** the following system
dependencies to be installed:

- [Node.js](https://nodejs.org/) (version 22 is what CI uses)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) via `rustup`. The pinned nightly toolchain and
  WebAssembly targets in `rust-toolchain.toml` are installed automatically.
- [CMake](https://cmake.org/) (version 3.29.5 or higher)
- A C++17 compiler for native builds (`perspective-python` and the Rust crate).
  LLVM 17 is the pinned version, which `pnpm run install_llvm` will download to
  `.llvm/`.

Running `pnpm install` additionally downloads the pinned versions of
[Emscripten](https://emscripten.org/) and
[Binaryen](https://github.com/WebAssembly/binaryen) specified in `package.json`,
and the Chromium build used by [Playwright](https://playwright.dev/). Boost and
the other C++ dependencies are downloaded by CMake at build time, and do not
need to be installed.

**_This list may be non-exhaustive depending on your OS/environment; please open
a thread in
[Discussions](https://github.com/perspective-dev/perspective/discussions) if you
have any questions_**

## Build

Make sure you have the system dependencies installed. For specifics depending on
your OS, check the [system-specific instructions](#system-specific-instructions)
below.

To run a build, use

```bash
pnpm run build
```

If this is the first time you've built Perspective, you'll be asked to generate
a `.perspectiverc` via a short survey. This can be later re-configured via

```bash
pnpm run setup
```

`.perspectiverc` is a plain `KEY=value` file, and any of its values can be
overridden per-command from the environment. `PACKAGE` is a comma-separated list
of the package names shown by `pnpm run setup`, e.g. to build just the engine
and JavaScript client:

```bash
PACKAGE=server,client pnpm run build
```

Note that `PACKAGE` is a filter, not a dependency graph. Packages which are not
selected are not rebuilt, so e.g. a change to the C++ engine in
`rust/perspective-server` will not be reflected in `@perspective-dev/client`
unless `server` is also selected.

Other useful options:

| Variable              | Effect                                                     |
| --------------------- | ---------------------------------------------------------- |
| `PSP_DEBUG=1`         | Debug build                                                |
| `PSP_BUILD_VERBOSE=1` | Verbose C++ build output                                   |
| `PSP_NUM_CPUS=<n>`    | Limit C++ build parallelism                                |
| `PSP_WASM64=1`        | Also build the `wasm64` (Memory64) engine                  |
| `PSP_BUILD_WHEEL=1`   | Build a `perspective-python` wheel to `rust/target/wheels` |
| `PSP_DOCKER=1`        | Build inside the Docker build environment                  |

If everything is successful, you should be able to run any of the `examples/`
packages, e.g. `examples/esbuild-example` like so:

```bash
pnpm run start esbuild-example
```

To remove build artifacts, use `pnpm run clean`.

## `Perspective.js`

To build the JavaScript library, which includes WebAssembly compilation,
[Emscripten](https://emscripten.org/) and its prerequisites are required.

`Perspective.js` specifies its Emscripten version dependency in `package.json`,
and the correct version of Emscripten will be installed with other JS
dependencies by running `pnpm install`.

#### Building via local EMSDK

To build using an Emscripten install on your local system and not the Emscripten
bundled with Perspective in its `package.json`,
[install](https://emscripten.org/docs/getting_started/downloads.html) the
Emscripten SDK, then activate and export the latest `emsdk` environment via
[`emsdk_env.sh`](https://github.com/juj/emsdk):

```bash
source emsdk/emsdk_env.sh
```

Deviating from this specific version of Emscripten specified in the project's
`package.json` can introduce various errors that are extremely difficult to
debug.

To install a specific version of Emscripten (e.g. `5.0.3`):

```bash
./emsdk install 5.0.3
```

Set `PSP_SKIP_EMSDK_INSTALL=1` to prevent `pnpm install` from downloading the
bundled version.

---

## `perspective-python`

To build the Python library, first configure your project to build Python via
`pnpm run setup`. Then, install the requirements corresponding to your version
of python, e.g.

```bash
pip install -r rust/perspective-python/requirements.txt
```

`pnpm run build` will then compile the extension and install it into your active
Python environment in development mode via
[`maturin develop`](https://www.maturin.rs/). It is strongly recommended to do
this within a virtual environment.

`perspective-python` supports Python 3.11 and upwards.

To build for [Pyodide](https://pyodide.org/), select
`perspective-python (pyodide)` in `pnpm run setup` and install the pinned
Pyodide distribution with `pnpm run install_pyodide`.

### `perspective-jupyterlab`

The JupyterLab extension is built by the `jupyterlab` package, which copies the
resulting labextension into the `perspective-python` package's data directory.
To install it from your local working directory, build both packages as a wheel
and install the wheel with `pip`:

```bash
# builds the labextension, then a wheel which bundles it
PACKAGE=jupyterlab,python PSP_BUILD_WHEEL=1 pnpm run build
pip install --force-reinstall rust/target/wheels/perspective_python-*.whl
```

Afterwards, you should see `@perspective-dev/jupyterlab` listed when you run
`jupyter labextension list`.

## `perspective` (Rust)

To build the Rust crate, select `perspective (rust)` in `pnpm run setup`.

The root `.cargo/config.toml` shares one `target-dir` (`rust/target`) between
the native and WebAssembly builds. When invoking `cargo` directly, always pass
an explicit `--target` (e.g. `--target=wasm32-unknown-unknown` for
`perspective-viewer` and `perspective-js`), otherwise `cargo` will fingerprint
shared host artifacts differently than `pnpm run build` does, and each will
invalidate the other's cache.

---

## System-Specific Instructions

### MacOS/OSX

Install system dependencies through Homebrew:

```bash
brew install cmake llvm@17
brew link llvm@17 # optional, see below
```

On Apple Silicon systems, make sure your brew-installed dependencies are in
`/opt/homebrew` (the default location), and that `/opt/homebrew/bin` is on the
`PATH`.

If you do not want to link the llvm@17 keg, then while developing ensure it is
on your PATH too, like this:

```
PATH=$(brew --prefix llvm@17)/bin:$PATH
```

**Note**: Perspective vendors its C++ extensions, so you may run into trouble
building if you have `brew`-installed versions of libraries, such as
`flatbuffers`.

### Windows 10+

You need to use bash in order to build Perspective packages. To successfully
build on Windows 10+, enable
[Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
(WSL) and install the Linux distribution of your choice.

Create symbolic links to easily access Windows directories and projects modified
via Windows. This way, you can modify any of the Perspective files using your
favorite editors on Windows and build via Linux.

Follow the Linux specific instructions to install Emscripten and all
prerequisite tools.

### Ubuntu/Debian

Install system dependencies through `apt`:

```bash
apt-get install build-essential cmake
```

Boost is downloaded by CMake at build time; a system `libboost` is not required.

---

## Test

You can run the test suite for the packages selected in `.perspectiverc` with
the standard NPM command.

```bash
pnpm run test
```

The test suite runs against the artifacts of the last `pnpm run build`, and does
not rebuild them; remember to re-run the build after making a change.

### JavaScript

The JavaScript test suite is composed of two sections: a Node.js test, which
asserts behavior of the `@perspective-dev/client` library, and a suite of
[Playwright](https://playwright.dev/) tests, which assert the behavior of the
rest of the UI facing packages.

`PACKAGE` selects which packages' suites run, and extra arguments are forwarded
to Playwright, so to run a single spec or test:

```bash
PACKAGE=viewer-datagrid pnpm run test column_style.spec
PACKAGE=client pnpm run test -g "to_arrow"
```

Each package is a Playwright project named `<package>-desktop-chrome` (or
`<package>-node` for the Node.js suites), which can be passed as `--project` to
narrow a run when several packages are selected.

Set `PSP_HEADED=1` to watch the browser tests run. The JupyterLab integration
tests are run with `PACKAGE=jupyterlab pnpm run test --jupyter`.

Many UI tests compare against screenshot and DOM snapshots, which live in
`tools/test/dist/snapshots` and are not checked in to this repository. CI
fetches them from a separate snapshots repository. To regenerate
snapshots locally after an intentional rendering change, or to generate them
for the first time from a known-passing (in CI) build you've checked out:

```bash
pnpm run test --update-snapshots
```

Locally regenerated snapshots only affect your machine; a pull request which
changes rendering also needs its snapshots veriied and published to the
snapshots repository by a maintainer.

### Python

With `python` selected, `pnpm run test` runs the `pytest` suite; extra arguments
are forwarded to `pytest`.

### Rust

With `rust` selected, `pnpm run test` runs `cargo test` for the `perspective`
and `perspective-client` crates.

## Lint

```bash
pnpm run lint
pnpm run fix
```

`lint` checks license headers, `eslint`, `prettier`, `clippy` and `rustfmt` (and
`ruff` when `perspective-python` is selected), and is run as a pre-push hook.
`fix` applies the automatic fixes.

## Docs

```bash
pnpm run docs
```

Documentation sources live in `docs/md`. This runs `cargo doc`, then the `docs`
script of each selected package.

### Troubleshooting installation from source

If you are installing from a source distribution (sdist), make sure you have the
[System Dependencies](#system-dependencies) installed.

Try installing in verbose mode:

```bash
pip install -vv perspective-python
```

The most common culprits are:

- CMake version is too old
- No C++17 compiler is available

---

## Benchmark

You can generate benchmarks specific to your machine's OS and CPU architecture
with Perspective's benchmark suite, which will host a live dashboard at
http://localhost:8080 as well as output a result `.arrow` file to
`tools/bench/dist`. The suite which runs is chosen by the selected packages:
`viewer-charts`, `client` or `python`.

```bash
pnpm run bench
```
