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

import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { createRequire } from "module";
import { bundleAsync as bundleCssAsync, composeVisitors } from "lightningcss";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");

const WATCH = process.argv.includes("--watch");
const RELOAD_PORT = Number(
    process.argv.find((x) => x.startsWith("--reload-port="))?.split("=")[1] ??
        8081,
);

const HTML_PAGES = ["index.html"];

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursive(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

/**
 * A lightningcss visitor inlining `url()` asset references as data URIs.
 *
 * @param fromFile the stylesheet relative paths resolve against.
 */
export function inlineUrlVisitor(fromFile) {
    const dir = path.dirname(fromFile);
    return composeVisitors([
        {
            Url(url) {
                const ext = path.extname(url.url).toLowerCase();
                if (![".svg", ".png", ".gif"].includes(ext)) {
                    return;
                }

                const resolved = path.resolve(dir, url.url);
                if (!fs.existsSync(resolved)) {
                    throw new Error(`File not found ${url.url}`);
                }

                const content = fs.readFileSync(resolved);
                const mime =
                    ext === ".svg"
                        ? "image/svg+xml"
                        : ext === ".png"
                          ? "image/png"
                          : "image/gif";

                const new_content = content
                    .toString("base64")
                    .split("\n")
                    .map((x) => x.trim())
                    .join("");

                return {
                    url: `data:${mime};base64,${new_content}`,
                    loc: url.loc,
                };
            },
        },
    ]);
}

/**
 * A lightningcss resolver reading `node_modules` specifiers and leaving
 * `http` imports external.
 *
 * @param url the module URL bare specifiers resolve against.
 */
export const resolveNPM = (url) => ({
    read(filePath) {
        if (filePath.startsWith("http")) {
            return `@import url("${filePath}");`;
        }

        return fs.readFileSync(filePath, "utf8");
    },
    resolve(specifier, from) {
        if (specifier.startsWith("http")) {
            return { external: specifier };
        }

        const _require = createRequire(url);

        if (specifier.startsWith(".") || specifier.startsWith("/")) {
            return path.resolve(path.dirname(from), specifier);
        }

        return _require.resolve(specifier);
    },
});

const RELOAD_CLIENTS = new Set();

function startReloadServer() {
    const server = http.createServer((request, response) => {
        if (!request.url.startsWith("/livereload")) {
            response.writeHead(404).end();
            return;
        }

        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
        });

        response.write("retry: 500\n\n");
        RELOAD_CLIENTS.add(response);
        request.on("close", () => RELOAD_CLIENTS.delete(response));
    });

    server.on("error", (e) => {
        if (e.code === "EADDRINUSE") {
            console.error(
                `Live-reload port ${RELOAD_PORT} is in use. Pass ` +
                    `--reload-port=<n> (and restart the browser tab).`,
            );
        } else {
            console.error(e);
        }
    });

    server.listen(RELOAD_PORT);
    return server;
}

function notifyReload(reason) {
    console.log(`  ↻ ${reason}`);
    for (const client of RELOAD_CLIENTS) {
        client.write(`event: reload\ndata: ${reason}\n\n`);
    }
}

const RELOAD_SNIPPET = `<script>
            new EventSource("http://localhost:${RELOAD_PORT}/livereload")
                .addEventListener("reload", (event) => {
                    if (event.data !== "css") {
                        location.reload();
                        return;
                    }

                    for (const link of document.querySelectorAll(
                        'link[rel="stylesheet"]',
                    )) {
                        const next = new URL(link.href);
                        next.searchParams.set("t", Date.now());
                        link.href = next.href;
                    }
                });
        </script>
`;

async function buildCss() {
    const { code } = await bundleCssAsync({
        filename: path.join(__dirname, "./src/css/style.css"),
        minify: !WATCH,
        resolver: resolveNPM(import.meta.url),
        visitor: inlineUrlVisitor("./src/css/style.css"),
    });

    fs.mkdirSync(path.join(DIST, "css"), { recursive: true });
    fs.writeFileSync(path.join(DIST, "style.css"), code);
}

function copyHtml() {
    for (const html of HTML_PAGES) {
        const source = fs.readFileSync(
            path.join(__dirname, "src", html),
            "utf8",
        );

        const output = WATCH
            ? source.replace("</body>", `${RELOAD_SNIPPET}    </body>`)
            : source;

        fs.writeFileSync(path.join(DIST, html), output);
    }
}

function copyStatic() {
    copyRecursive(path.join(__dirname, "static"), DIST);
    const arrow = path.join(
        __dirname,
        "node_modules/superstore-arrow/superstore.lz4.arrow",
    );

    fs.mkdirSync(path.join(DIST, "data"), { recursive: true });
    if (fs.existsSync(arrow)) {
        fs.copyFileSync(arrow, path.join(DIST, "data/superstore.lz4.arrow"));
    } else {
        console.warn("Missing superstore-arrow; Superstore Projects will 404.");
    }
}

function copyDocsBundle() {
    const docs_bundle = path.join(
        __dirname,
        "node_modules/@perspective-dev/viewer/dist/docs/perspective-docs.json",
    );

    if (fs.existsSync(docs_bundle)) {
        fs.copyFileSync(docs_bundle, path.join(DIST, "perspective-docs.json"));
    } else {
        console.warn(
            "No perspective-docs.json; the agent's `search_docs` tool will " +
                "be unavailable until `@perspective-dev/viewer` is built.",
        );
    }
}

/**
 * Stub the optional Memory64 engine binary when `@perspective-dev/server`
 * was built without `PSP_WASM64`, so the docs bundle without that compile.
 * The stub throws when imported, which rejects `engines.ts`'s `wasm64`
 * thunk and lets `init_server` fall back to the wasm32 binary at runtime.
 */
function optionalWasm64Plugin() {
    const NAMESPACE = "optional-wasm64";
    return {
        name: NAMESPACE,
        setup(build) {
            build.onResolve(
                { filter: /perspective-server\.memory64\.wasm$/ },
                async (args) => {
                    if (args.pluginData === NAMESPACE) {
                        return;
                    }

                    const resolved = await build.resolve(args.path, {
                        kind: args.kind,
                        importer: args.importer,
                        resolveDir: args.resolveDir,
                        pluginData: NAMESPACE,
                    });

                    if (resolved.errors.length === 0) {
                        return resolved;
                    }

                    console.warn(
                        `No ${path.basename(args.path)} (PSP_WASM64 unset); ` +
                            "perspective-server will run as wasm32.",
                    );

                    return { path: args.path, namespace: NAMESPACE };
                },
            );

            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
                loader: "js",
                contents: `throw new Error(${JSON.stringify(
                    `${args.path} was not built (set PSP_WASM64=1)`,
                )});`,
            }));
        },
    };
}

function esbuildOptions() {
    return {
        entryPoints: [path.join(__dirname, "src/index.ts")],
        bundle: true,
        splitting: true,
        format: "esm",
        outdir: DIST,
        minify: !WATCH,
        sourcemap: true,
        target: ["es2022"],
        define: {
            global: "window",
        },
        loader: {
            ".wasm": "file",
            ".arrow": "file",
        },
        plugins: [optionalWasm64Plugin()],
    };
}

async function build() {
    fs.mkdirSync(DIST, { recursive: true });
    await buildCss();
    await esbuild.build(esbuildOptions());
    copyHtml();
    copyStatic();
    copyDocsBundle();
    console.log("Build complete: dist/");
}

function debounce(fn, ms = 60) {
    let timer;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

function watchDir(dir, handler) {
    if (!fs.existsSync(dir)) {
        return;
    }

    fs.watch(dir, { recursive: true }, debounce(handler));
}

async function guard(label, step) {
    try {
        await step();
        notifyReload(label);
    } catch (e) {
        console.error(`  ✗ ${label} failed:\n${e.message ?? e}`);
    }
}

async function watch() {
    fs.mkdirSync(DIST, { recursive: true });
    try {
        await buildCss();
    } catch (e) {
        console.error(`  ✗ css failed:\n${e.message ?? e}`);
    }

    copyHtml();
    copyStatic();
    copyDocsBundle();

    const options = esbuildOptions();
    const ctx = await esbuild.context({
        ...options,
        plugins: [
            ...options.plugins,
            {
                name: "livereload",
                setup(build) {
                    let first = true;
                    build.onEnd((result) => {
                        if (result.errors.length > 0) {
                            console.error(
                                `  ✗ js failed (${result.errors.length} error(s))`,
                            );
                        } else if (first) {
                            first = false;
                        } else {
                            notifyReload("js");
                        }
                    });
                },
            },
        ],
    });

    await ctx.watch();
    watchDir(path.join(__dirname, "src/css"), () => guard("css", buildCss));
    watchDir(path.join(__dirname, "static"), () => guard("static", copyStatic));
    fs.watch(
        path.join(__dirname, "src"),
        { recursive: true },
        debounce(() => {
            if (HTML_PAGES.some((p) => hasChanged(p))) {
                guard("html", copyHtml);
            }
        }),
    );

    const server = startReloadServer();
    console.log(
        `Watching docs/src — live reload on :${RELOAD_PORT}.\n` +
            `Serve dist/ separately (\`pnpm start\`); Ctrl-C to stop.`,
    );

    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => {
            ctx.dispose();
            server.close();
            process.exit(0);
        });
    }
}

function hasChanged(page) {
    const from = path.join(__dirname, "src", page);
    const to = path.join(DIST, page);
    if (!fs.existsSync(to)) {
        return true;
    }

    return fs.statSync(from).mtimeMs > fs.statSync(to).mtimeMs;
}

(WATCH ? watch() : build()).catch((e) => {
    console.error(e);
    process.exit(1);
});
