// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

/**
 * Esbuild plugin that compiles a `.worker.js` import into a
 * URL-yielding module. The shim `getWorkerURL()` returns a string
 * that's usable by both `new Worker(url, { type: "module" })` *and*
 * `await import(url)` — the in-process renderer path uses the latter
 * so the chart code lives in the worker bundle exactly once.
 *
 * Two output modes:
 *   - `inline: true` (default, prod). The subbuild's bytes are
 *     embedded as a JS string in the parent bundle. `getWorkerURL()`
 *     creates a Blob URL at runtime, cached so both consumers share
 *     the same URL (and the same module instance via dynamic-import
 *     dedup).
 *   - `inline: false` (debug). The subbuild's output is written to
 *     the parent's `outdir` next to the main bundle, with source
 *     maps. `getWorkerURL()` resolves `import.meta.url` to that file,
 *     so DevTools can show real source paths and breakpoints work.
 */
exports.WorkerPlugin = function WorkerPlugin(options = {}) {
    /**
     * Optional esbuild plugins to apply to the worker sub-build (e.g.
     * `GlslMinify`, `LightningCssMinify`). Use when the worker entry
     * imports the same custom-loader file types as the outer bundle.
     */
    const subbuildPlugins = options.plugins || [];

    /**
     * Optional `loader` map for the worker sub-build (e.g.
     * `{ ".glsl": "text", ".css": "text" }`).
     */
    const subbuildLoader = options.loader || {};

    /**
     * `false` to emit the worker bundle as a real file alongside the
     * parent bundle (debug builds — preserves source maps + real
     * paths in DevTools). Defaults to inline-Blob mode for prod.
     */
    const inline = options.inline !== false;

    const additionalOptions = options.additionalOptions || {};

    function setup(build) {
        build.initialOptions.metafile = true;

        build.onResolve({ filter: /\.worker(\.js)?$/ }, (args) => {
            if (args.namespace === "worker-stub") {
                const baseName = path
                    .basename(args.path)
                    .replace(".worker", "");

                const entryPoint = path.join(
                    args.pluginData.resolveDir,
                    args.path,
                );

                // `outdir` is set so that file-mode subbuilds produce
                // real, non-`<stdout>` paths in `outputFiles[].path`
                // — we use those paths to name the on-disk artifacts
                // when copying to the parent bundle's outdir. In
                // inline mode the path doesn't matter (we only read
                // the bytes), but setting `outdir` is harmless.
                const subbuild = esbuild.build({
                    target: ["es2021"],
                    entryPoints: [entryPoint],
                    define: {
                        global: "self",
                    },
                    outdir: ".",
                    entryNames: "[name]",
                    chunkNames: "[name]",
                    assetNames: "[name]",
                    minify: !process.env.PSP_DEBUG,
                    bundle: true,
                    sourcemap: !inline,
                    write: false,
                    plugins: subbuildPlugins,
                    loader: subbuildLoader,
                    format: "esm",
                    ...additionalOptions,
                });

                return {
                    path: args.path.replace(".worker", ""),
                    namespace: "worker",
                    pluginData: {
                        baseName,
                        subbuild,
                    },
                };
            }

            return {
                path: args.path,
                namespace: "worker-stub",
                pluginData: {
                    resolveDir: args.resolveDir,
                },
            };
        });

        build.onLoad(
            { filter: /.*/, namespace: "worker-stub" },
            async (args) => {
                if (inline) {
                    return {
                        pluginData: args.pluginData,

                        // Inline mode: the parent bundle imports the
                        // worker bytes as a text string and constructs
                        // a Blob URL on first call to `getWorkerURL`.
                        // The cached URL is reused for both
                        // `new Worker(url)` and `await import(url)` so
                        // module dedup keeps a single instance.
                        //
                        // `initialize()` adds a Worker-or-shim path:
                        // attempts `new Worker(blobUrl)` first; falls
                        // back to running the worker source text on the
                        // main thread via `new Function(...)` when
                        // Worker construction is unavailable (e.g.
                        // `file://` origins where module-Worker support
                        // is gated, or environments without the Worker
                        // constructor at all). The shim returned by
                        // \`make_host\` is MessagePort-shaped so
                        // downstream consumers can treat it like a real
                        // Worker.
                        contents: `
                            import workerSource from ${JSON.stringify(args.path)};
                            let cached = null;
                            export async function getWorkerURL() {
                                if (cached) return cached;
                                const blob = new Blob([workerSource], {
                                    type: "application/javascript",
                                });

                                cached = URL.createObjectURL(blob);
                                return cached;
                            }

                            function make_host(a, b) {
                                return {
                                    addEventListener(type, callback) {
                                        if (type === "message") {
                                            a.push(callback);
                                        }
                                    },
                                    removeEventListener(type, callback) {
                                        const idx = a.indexOf(callback);
                                        if (idx > -1) {
                                            a.splice(idx, 1);
                                        }
                                    },
                                    postMessage(msg, ports) {
                                        for (const listener of b) {
                                            listener({
                                                data: msg,
                                                ports: ports,
                                            });
                                        }
                                    },
                                    terminate() {},
                                    location: { href: "" },
                                };
                            }

                            function run_single_threaded() {
                                console.warn(
                                    "Running perspective in single-threaded mode"
                                );
                                const f = Function(
                                    "const self = arguments[0];" + workerSource
                                );
                                const workers = [];
                                const mains = [];
                                f(make_host(workers, mains));
                                return make_host(mains, workers);
                            }

                            export async function initialize(opts) {
                                const workerOpts = opts || {
                                    type: "module",
                                };
                                try {
                                    if (
                                        typeof window !== "undefined" &&
                                        window.location &&
                                        window.location.protocol &&
                                        window.location.protocol.startsWith(
                                            "file"
                                        )
                                    ) {
                                        console.warn(
                                            "file:// protocol does not reliably support Web Workers"
                                        );
                                        return run_single_threaded();
                                    }

                                    const url = await getWorkerURL();
                                    const worker = new Worker(url, workerOpts);
                                    return worker;
                                } catch (e) {
                                    console.error(
                                        "Error instantiating worker; falling back to single-threaded mode",
                                        e
                                    );
                                    return run_single_threaded();
                                }
                            }

                            export default getWorkerURL;
                        `,
                    };
                }

                // File mode: the subbuild writes its output to disk
                // next to the parent bundle, and `getWorkerURL`
                // resolves the worker file relative to the consuming
                // module's URL (so `<script type="module" src=...>`
                // and dynamic imports both work without a baked-in
                // absolute path). The basename comes from the
                // namespace import below.
                return {
                    pluginData: args.pluginData,
                    contents: `
                        import basename from ${JSON.stringify(args.path)};
                        const workerURL = new URL(
                            "./" + basename,
                            import.meta.url,
                        ).toString();
                        
                        export async function getWorkerURL() {
                            return workerURL;
                        }

                        export default getWorkerURL;
                    `,
                };
            },
        );

        build.onLoad({ filter: /.*/, namespace: "worker" }, async (args) => {
            const result = await args.pluginData.subbuild;

            const outpath =
                build.initialOptions.outdir ||
                path.dirname(build.initialOptions.outfile);

            if (!fs.existsSync(outpath)) {
                fs.mkdirSync(outpath, { recursive: true });
            }

            if (inline) {
                // Embed the bundle bytes as a `text` string in the
                // parent bundle; the stub above wraps them in a Blob
                // URL at runtime. The `.js.map` (when present) is
                // discarded — Blob URLs strip the source-map comment
                // anyway since DevTools can't follow it back to disk.
                const jsOut = result.outputFiles.find((o) =>
                    o.path.endsWith(".js"),
                );
                if (!jsOut) {
                    throw new Error("worker subbuild produced no .js output");
                }

                return { contents: jsOut.contents, loader: "text" };
            }

            // File mode: write the worker bundle (and source map)
            // alongside the parent bundle. Multiple output files are
            // emitted by esbuild when `sourcemap: true`. Use the
            // actual emitted .js basename for the URL so the stub
            // and the on-disk artifact agree (esbuild-emitted
            // basename includes `.worker` from the entry filename).
            let jsBaseName = null;
            for (const out of result.outputFiles) {
                const base = path.basename(out.path);
                const dst = path.join(outpath, base);
                await fs.promises.writeFile(dst, out.contents);
                if (base.endsWith(".js")) {
                    jsBaseName = base;
                }
            }

            if (!jsBaseName) {
                throw new Error("worker subbuild produced no .js output");
            }

            return {
                contents: `export default ${JSON.stringify(jsBaseName)};`,
                loader: "js",
            };
        });
    }

    return {
        name: "webworker",
        setup,
    };
};
