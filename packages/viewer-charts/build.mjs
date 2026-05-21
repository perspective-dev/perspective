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

import { NodeModulesExternal } from "@perspective-dev/esbuild-plugin/external.js";
import { WorkerPlugin } from "@perspective-dev/esbuild-plugin/worker.js";
import { build } from "@perspective-dev/esbuild-plugin/build.js";
import { transform as transformCss } from "lightningcss";
import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";

import { GlslMinify as AstGlslMinify } from "webpack-glsl-minify/build/minify.js";

/**
 * Pull every identifier the JS code might resolve by string out of the
 * unminified shader source so we can hand them to the AST minifier's
 * `nomangle` list. `preserveUniforms: true` already covers `uniform`
 * declarations, and the minifier auto-preserves `varying` / `in` /
 * `out` names. The one category the minifier won't infer is the
 * GLSL ES 1.00 `attribute` declaration in vertex shaders — those are
 * the names `getAttribLocation` queries, so we surface them here.
 */
function extractPreservedNames(src) {
    const names = new Set();
    const attrRe =
        /\battribute\s+(?:highp\s+|mediump\s+|lowp\s+)?\S+\s+([a-zA-Z_][\w]*)/g;
    let m;
    while ((m = attrRe.exec(src))) {
        names.add(m[1]);
    }
    return [...names];
}

// AST-based GLSL minifier. Mangles function locals and non-`main`
// function names; preserves uniforms, attributes, varyings, and `gl_*`
// built-ins (the chart impls resolve those by string via
// `getUniformLocation` / `getAttribLocation`). Saves ~7% of the
// bundled shader payload over the prior regex pass, and parses
// `#`-directives natively so the previous newline-preservation hack
// is no longer needed.
const GlslMinify = () => ({
    name: "glsl-minify",
    setup(build) {
        build.onLoad({ filter: /\.glsl$/ }, async (args) => {
            const src = await fs.readFile(args.path, "utf8");
            if (process.env.PSP_DEBUG) {
                return { contents: src, loader: "text" };
            }
            const minifier = new AstGlslMinify(
                {
                    preserveDefines: true,
                    preserveUniforms: true,
                    preserveVariables: false,
                    nomangle: extractPreservedNames(src),
                    output: "source",
                    esModule: false,
                    stripVersion: false,
                },
                undefined,
                undefined,
            );
            const { sourceCode } = await minifier.execute(src);
            return { contents: sourceCode, loader: "text" };
        });
    },
});

// CSS is imported via `import style from "...css"` + the `.css: text`
// loader, so the final bundle embeds the source verbatim as a JS
// string literal — esbuild's own minifier doesn't touch string
// contents. Route `.css` loads through lightningcss so the embedded
// CSS is minified (whitespace collapse, selector shortening, value
// normalisation).
//
// Skipped in `PSP_DEBUG` builds to keep source maps useful.
const LightningCssMinify = () => ({
    name: "lightningcss-minify",
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
            const src = await fs.readFile(args.path);
            if (process.env.PSP_DEBUG) {
                return { contents: src.toString("utf8"), loader: "text" };
            }
            const { code } = transformCss({
                filename: args.path,
                code: src,
                minify: true,
            });
            return { contents: code.toString("utf8"), loader: "text" };
        });
    },
});

const BUILD = [
    {
        entryPoints: ["src/ts/index.ts"],
        define: {
            global: "window",
        },
        plugins: [
            NodeModulesExternal(),
            WorkerPlugin({
                inline: !process.env.PSP_DEBUG,
                plugins: [GlslMinify(), LightningCssMinify()],
                loader: {
                    ".css": "text",
                    ".glsl": "text",
                },
                additionalOptions: {
                    minifyWhitespace: !process.env.PSP_DEBUG,
                    minifyIdentifiers: !process.env.PSP_DEBUG,
                    mangleProps: process.env.PSP_DEBUG
                        ? undefined
                        : /^[_#]|^(plotRect|paddedX(?:Min|Max)|paddedY(?:Min|Max)|dataToPixel|tickColor|labelColor|axisLineColor|gridlineColor|legendText|legendBorder|tooltipBg|tooltipText|tooltipBorder|areaOpacity|heatmapGapPx|sunburstGapPx|gradientStops|seriesPalette|bufferPool)$/,
                    reserveProps: /(handle_response|__unsafe_open_view)/,
                },
            }),
            GlslMinify(),
            LightningCssMinify(),
        ],
        // minifyWhitespace: !process.env.PSP_DEBUG,
        // minifyIdentifiers: !process.env.PSP_DEBUG,
        // mangleProps: process.env.PSP_DEBUG ? false : /^[_#]/,
        format: "esm",
        loader: {
            ".css": "text",
            ".glsl": "text",
        },
        outfile: "dist/esm/perspective-viewer-charts.js",
    },
    {
        entryPoints: ["src/ts/index.ts"],
        define: {
            global: "window",
        },
        // minifyWhitespace: !process.env.PSP_DEBUG,
        // minifyIdentifiers: !process.env.PSP_DEBUG,
        // mangleProps: process.env.PSP_DEBUG ? false : /^[_#]/,
        plugins: [
            WorkerPlugin({
                // Inline (Blob URL) for prod, file mode for debug —
                // file mode preserves source maps + real paths in
                // DevTools so worker breakpoints work.
                inline: !process.env.PSP_DEBUG,
                plugins: [GlslMinify(), LightningCssMinify()],
                loader: {
                    ".css": "text",
                    ".glsl": "text",
                },
                additionalOptions: {
                    minifyWhitespace: !process.env.PSP_DEBUG,
                    minifyIdentifiers: !process.env.PSP_DEBUG,
                    mangleProps: process.env.PSP_DEBUG
                        ? undefined
                        : /^[_#]|^(plotRect|paddedX(?:Min|Max)|paddedY(?:Min|Max)|dataToPixel|tickColor|labelColor|axisLineColor|gridlineColor|legendText|legendBorder|tooltipBg|tooltipText|tooltipBorder|areaOpacity|heatmapGapPx|sunburstGapPx|gradientStops|seriesPalette|bufferPool)$/,
                    reserveProps: /(handle_response|__unsafe_open_view)/,
                },
            }),
            GlslMinify(),
            LightningCssMinify(),
        ],
        // minifyWhitespace: !process.env.PSP_DEBUG,
        // minifyIdentifiers: !process.env.PSP_DEBUG,
        // mangleProps: process.env.PSP_DEBUG ? false : /^[_#]/,
        format: "esm",
        loader: {
            ".css": "text",
            ".glsl": "text",
        },
        outfile: "dist/cdn/perspective-viewer-charts.js",
    },
];

async function build_all() {
    await Promise.all(BUILD.map(build)).catch(() => process.exit(1));
    try {
        execSync("tsc", { stdio: "inherit" });
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

build_all();
