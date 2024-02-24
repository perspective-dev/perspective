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

exports.WorkerPlugin = function WorkerPlugin(options = {}) {
    const inline = !!options.inline;
    const targetdir = options.targetdir || "build/worker";
    function setup(build) {
        build.onResolve({ filter: /\.worker(\.js)?$/ }, (args) => {
            if (args.namespace === "worker-stub") {
                const outfile =
                    `${targetdir}/` +
                    path.basename(args.path).replace(".worker", "");

                const entryPoint = path.join(
                    args.pluginData.resolveDir,
                    args.path
                );

                const subbuild = esbuild.build({
                    target: ["es2021"],
                    entryPoints: [entryPoint],
                    outfile,
                    define: {
                        global: "self",
                    },
                    entryNames: "[name]",
                    chunkNames: "[name]",
                    assetNames: "[name]",
                    minify: !process.env.PSP_DEBUG,
                    bundle: true,
                    sourcemap: true,
                });

                return {
                    path: args.path.replace(".worker", ""),
                    namespace: "worker",
                    pluginData: {
                        outfile,
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
                        contents: `
                        import worker from ${JSON.stringify(args.path)};
                        function make_host(a, b) {
                            function addEventListener(type, callback) {
                                a.push(callback);
                            }

                            function postMessage(msg) {
                                if (Object.keys(msg).length > 0) {
                                    for (const listener of b) {
                                        listener({data: msg});
                                    }
                                }
                            }

                            return {
                                addEventListener,
                                postMessage,
                                location: {href: ""}
                            }
                        }

                        function run_single_threaded(code, e) {
                            console.error("Running perspective in single-threaded mode due to error initializing Web Worker:", e);
                            let f = Function("const self = arguments[0];" + code);
                            const workers = [];
                            const mains = [];
                            f(make_host(workers, mains));
                            return make_host(mains, workers);
                        }

                        export const initialize = async function () {
                            try {
                                const blob = new Blob([worker], {type: 'application/javascript'});
                                const url = URL.createObjectURL(blob);
                                return new Worker(url, {type: "module"});
                            } catch (e) {
                                if (window.location.protocol.startsWith("file")) {
                                    console.warn("file:// protocol does not support Web Workers");
                                } else {
                                    console.error("Error instantiating Web Worker");
                                }
    
                                return run_single_threaded(worker, e);
                            }
                        };

                        export default initialize;
                    `,
                    };
                }

                return {
                    pluginData: args.pluginData,
                    contents: `
                    import worker from ${JSON.stringify(args.path)};
                    async function get_worker_code() {
                        const url = new URL(worker, import.meta.url);
                        const req = await fetch(url);
                        const code = await req.text();
                        return code;
                    };

                    function make_host(a, b) {
                        function addEventListener(type, callback) {
                            a.push(callback);
                        }

                        function postMessage(msg) {
                            if (Object.keys(msg).length > 0) {
                                for (const listener of b) {
                                    listener({data: msg});
                                }
                            }
                        }

                        return {
                            addEventListener,
                            postMessage,
                            location: {href: ""}
                        }
                    }

                    function run_single_threaded(code) {
                        let f = Function("const self = arguments[0];" + code);
                        const workers = [];
                        const mains = [];
                        f(make_host(workers, mains));
                        return make_host(mains, workers);
                    }

                    const code_promise = get_worker_code();
                    export const initialize = async function () {
                        const code = await code_promise;
                        if (window.location.protocol.startsWith("file") && !window.isElectron) {
                            console.warn("file:// protocol does not support Web Workers");
                            return run_single_threaded(code);
                        }

                        try {
                            const blob = new Blob([code], {type: 'application/javascript'});
                            const url = URL.createObjectURL(blob);
                            return new Worker(url, {type: "module"});
                        } catch (e) {
                            console.warn("Failed to instantiate worker, falling back to single-threaded runtime", e);
                            return run_single_threaded(code);
                        }
                    };

                    export default initialize;
                `,
                };
            }
        );

        build.onLoad({ filter: /.*/, namespace: "worker" }, async (args) => {
            // Get the subbuild output and delete the temp file
            await args.pluginData.subbuild;
            contents = await fs.promises.readFile(args.pluginData.outfile);

            // // Copy the sourcemaps also
            // const mapfile = args.pluginData.outfile + ".map";
            // sourcemap = await fs.promises.readFile(mapfile);

            const outpath =
                build.initialOptions.outdir ||
                path.dirname(build.initialOptions.outfile);

            if (!fs.existsSync(outpath)) {
                fs.mkdirSync(outpath, { recursive: true });
            }

            // await fs.promises.writeFile(
            //     path.join(outpath, path.basename(args.path) + ".map"),
            //     sourcemap
            // );

            return {
                contents,
                loader: inline ? "text" : "file",
            };
        });
    }

    return {
        name: "webworker",
        setup,
    };
};
