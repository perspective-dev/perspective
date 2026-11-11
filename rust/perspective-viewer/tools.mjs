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

import { execSync } from "child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    bundle as bundleCss,
    composeVisitors,
    transform as transformCss,
} from "lightningcss";

import { createRequire } from "node:module";

const INHERIT = {
    stdio: "inherit",
    stderr: "inherit",
};

export function get_host() {
    return /host\: (.+?)$/gm.exec(execSync(`rustc -vV`).toString())[1];
}

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

const DOCS_ROOT = "../../docs/md";

const DOCS_SUMMARY = `${DOCS_ROOT}/SUMMARY.md`;

const DOCS_SUBTREES = [
    "explanation/view.md",
    "explanation/derived_table.md",
    "how_to/javascript/viewer.md",
    "glossary.md",
];

const DOCS_MD_FILES = ["../../rust/perspective-client/docs/expression_gen.md"];

const DOCS_DTS_FILES = [
    {
        file: "./dist/wasm/perspective-viewer.d.ts",
        prefix: "JS API",
        scope: ["class PerspectiveViewerElement"],
    },
    {
        file: "../../packages/viewer-datagrid/src/ts/types.ts",
        prefix: "Datagrid Plugin",
        scope: [
            "type EditMode",
            "type Align",
            "interface ColumnConfig",
            "interface DatagridPluginConfig",
        ],
    },
    {
        file: "../../packages/viewer-charts/src/ts/charts/chart.ts",
        prefix: "Charts Plugin",
        scope: ["interface FacetConfig", "interface PluginConfig"],
    },
    {
        file: "../../packages/viewer-charts/src/ts/plugin/charts.ts",
        prefix: "Charts Plugin",
    },
    ...[
        "CustomNumberFormatConfig",
        "NumberFormatStyle",
        "Notation",
        "DatetimeFormat",
        "SimpleDatetimeFormat",
        "DatetimeTextPart",
        "DatetimeNumericPart",
        "DatetimeMonthPart",
        "FractionalSecondDigits",
    ].map((x) => ({ file: `./dist/ts-rs/${x}.d.ts`, prefix: "Column Format" })),
    ...[
        "WorkspaceConfigUpdate",
        "Layout",
        "SplitLayout",
        "TabLayout",
        "Orientation",
        "DerivedTableConfig",
    ].map((x) => ({ file: `./dist/ts-rs/${x}.d.ts`, prefix: "Workspace" })),
];

const DOCS_MERGE_UNDER = 500;
const DOCS_SPLIT_OVER = 2500;
const DOCS_RAW_BUDGET = 250_000;

function repoPath(file) {
    return path.relative(path.resolve("../.."), path.resolve(file));
}

// Every page in the `SUMMARY.md` table of contents that is one of `roots`
// or nested beneath one.
function summarySubtrees(summary, roots, missing) {
    const files = [];
    const found = new Set();
    let depth = null;
    for (const line of fs.readFileSync(summary, "utf8").split("\n")) {
        const entry = line.match(/^(\s*)- \[[^\]]*\]\(\.\/([^)]+)\)/);
        if (!entry) {
            depth = line.startsWith("#") ? null : depth;
            continue;
        }

        const [, indent, file] = entry;
        if (depth !== null && indent.length > depth) {
            files.push(path.join(path.dirname(summary), file));
        } else if (roots.includes(file)) {
            depth = indent.length;
            found.add(file);
            files.push(path.join(path.dirname(summary), file));
        } else {
            depth = null;
        }
    }

    for (const root of roots.filter((x) => !found.has(x))) {
        missing.push(`\`${root}\` is not in ${summary}`);
    }

    return files;
}

// Split one markdown file on heading boundaries, breadcrumbing titles.
// Fenced code blocks are opaque - a `#` inside a fence is not a heading.
function chunkMarkdown(file, text) {
    const chunks = [];
    const crumbs = [];
    let buf = [];
    let fence = null;
    const flush = () => {
        const body = buf.join("\n").trim();
        buf = [];
        if (body) {
            const base = path.basename(file, ".md");
            const parts = crumbs[0] === base ? crumbs : [base, ...crumbs];
            const title = parts.filter(Boolean).join(" » ");
            chunks.push({ title, path: repoPath(file), text: body });
        }
    };

    for (const line of text.split("\n")) {
        const fence_match = line.match(/^\s*(`{3,}|~{3,})/);
        if (fence_match) {
            fence = fence === null ? fence_match[1][0] : null;
        }

        const heading = fence === null && line.match(/^(#{1,6})\s+(.*)/);
        if (heading) {
            flush();
            crumbs.length = heading[1].length - 1;
            crumbs[heading[1].length - 1] = heading[2]
                .replace(/[#`*]/g, "")
                .trim();
        } else {
            buf.push(line);
        }
    }

    flush();
    return chunks;
}

// The end offset of the declaration starting at `start`: its matching
// `}` for a class or interface, its terminating `;` for a type alias.
function declarationEnd(text, start, kind) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (text.startsWith("/*", i)) {
            const close = text.indexOf("*/", i + 2);
            if (close < 0) {
                break;
            }

            i = close + 1;
        } else if (text.startsWith("//", i)) {
            i = text.indexOf("\n", i);
        } else if (ch === '"' || ch === "'" || ch === "`") {
            let j = i + 1;
            while (j < text.length && text[j] !== ch) {
                j += text[j] === "\\" ? 2 : 1;
            }

            i = j;
        } else if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0 && kind !== "type") {
                return i + 1;
            }
        } else if (ch === ";" && depth === 0 && kind === "type") {
            return i + 1;
        }

        if (i < 0) {
            break;
        }
    }

    return text.length;
}

// The source text of each `scope` declaration (e.g. `"interface Foo"`),
// including its leading JSDoc.
function scopeDeclarations(file, text, scope, missing) {
    return scope
        .map((decl) => {
            const [kind, name] = decl.split(/\s+/);
            const re = new RegExp(
                `(?:\\/\\*\\*(?:(?!\\*\\/)[\\s\\S])*\\*\\/\\s*)?(?:export\\s+)?(?:declare\\s+)?${kind}\\s+${name}\\b`,
            );

            const match = re.exec(text);
            if (!match) {
                missing.push(`\`${decl}\` not found in ${file}`);
                return "";
            }

            const body = match.index + match[0].length;
            return text.slice(match.index, declarationEnd(text, body, kind));
        })
        .join("\n");
}

// Each JSDoc block + its following declaration signature is one chunk;
// declarations without prose are skipped as type-machinery noise.
function chunkDts(file, text, prefix) {
    const chunks = [];
    const re = /\/\*\*([\s\S]*?)\*\/\s*\n([^\n]*)/g;
    for (const match of text.matchAll(re)) {
        const prose = match[1]
            .split("\n")
            .map((x) => x.replace(/^\s*\*\s?/, ""))
            .join("\n")
            .trim();

        if (prose.length < 40) {
            continue;
        }

        const sig = match[2]
            .trim()
            .replace(/[{;]\s*$/, "")
            .trim();
        const name = (sig.match(
            /(?:interface|class|enum|function|type|const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
        ) ||
            sig.match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\??\s*[(:<]/) || [
                null,
                sig.split(/\s+/).pop(),
            ])[1];

        chunks.push({
            title: `${prefix} » ${name}`,
            path: repoPath(file),
            text: `${sig}\n\n${prose}`,
        });
    }

    return chunks;
}

// Merge runt chunks into their predecessor (same file), then split
// oversized chunks at paragraph boundaries.
function normalizeChunks(chunks) {
    const merged = [];
    for (const chunk of chunks) {
        const prev = merged[merged.length - 1];
        if (
            prev &&
            prev.path === chunk.path &&
            prev.text.length < DOCS_MERGE_UNDER
        ) {
            prev.text += `\n\n${chunk.title}\n\n${chunk.text}`;
        } else {
            merged.push({ ...chunk });
        }
    }

    const out = [];
    for (const chunk of merged) {
        if (chunk.text.length <= DOCS_SPLIT_OVER) {
            out.push(chunk);
            continue;
        }

        let part = "";
        let idx = 1;
        for (const para of chunk.text.split(/\n\n+/)) {
            if (part && part.length + para.length > DOCS_SPLIT_OVER) {
                out.push({
                    ...chunk,
                    title: `${chunk.title} (${idx})`,
                    text: part,
                });
                idx += 1;
                part = para;
            } else {
                part = part ? `${part}\n\n${para}` : para;
            }
        }

        if (part) {
            const title = idx > 1 ? `${chunk.title} (${idx})` : chunk.title;
            out.push({ ...chunk, title, text: part });
        }
    }

    return out;
}

// JSON Schemas for tool parameters, generated from the ts-rs `.d.ts` output
const TOOL_SCHEMA_TYPES = [
    ["ViewerConfigUpdate", "dist/ts-rs/ViewerConfigUpdate.d.ts"],
    ["ViewerConfigInitial", "dist/ts-rs/ViewerConfigInitial.d.ts"],
    ["WorkspaceConfigUpdate", "dist/ts-rs/WorkspaceConfigUpdate.d.ts"],
];

// Inline every definition whose GENERATED NAME is not a legible
// identifier, replacing each `$ref` to it with the type itself.
function inlineMangledDefinitions(schema) {
    const defs = schema.definitions ?? {};
    const mangled = new Map(
        Object.entries(defs).filter(
            ([name]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
        ),
    );

    if (mangled.size === 0) {
        return schema;
    }

    const walk = (node) => {
        if (Array.isArray(node)) {
            return node.map(walk);
        }

        if (!node || typeof node !== "object") {
            return node;
        }

        const ref = node["$ref"];
        if (typeof ref === "string" && ref.startsWith("#/definitions/")) {
            const name = decodeURIComponent(ref.slice("#/definitions/".length));

            if (mangled.has(name)) {
                // Sibling keys (`description`) win over the inlined body.
                const { $ref, ...rest } = node;
                return {
                    ...walk(JSON.parse(JSON.stringify(mangled.get(name)))),
                    ...rest,
                };
            }
        }

        return Object.fromEntries(
            Object.entries(node).map(([k, v]) => [k, walk(v)]),
        );
    };

    const out = walk(schema);
    for (const name of mangled.keys()) {
        delete out.definitions[name];
    }

    return out;
}

async function buildToolSchemas(missing) {
    const { createGenerator } = await import("ts-json-schema-generator");
    const schemas = {};
    for (const [type, path] of TOOL_SCHEMA_TYPES) {
        if (!fs.existsSync(path)) {
            missing.push(`${path} (${type} tool schema)`);
            continue;
        }

        schemas[type] = inlineMangledDefinitions(
            createGenerator({
                path,
                type,
                skipTypeCheck: true,
                topRef: true,
            }).createSchema(type),
        );
    }

    return schemas;
}

/// Build the `dist/docs/perspective-docs.json` agent metadata bundle
/// (`{schemas, chunks}`). Returns summary stats.
///
/// Every input is required: a missing file or scoped declaration (e.g. a
/// ts-rs type renamed in Rust but not here) fails the build rather than
/// silently dropping that API from the corpus.
export async function buildDocsCorpus() {
    const chunks = [];
    const missing = [];
    const md_files = [
        ...summarySubtrees(DOCS_SUMMARY, DOCS_SUBTREES, missing),
        ...DOCS_MD_FILES,
    ].filter((file) => {
        if (!fs.existsSync(file)) {
            missing.push(file);
            return false;
        }

        return true;
    });

    for (const file of md_files) {
        chunks.push(...chunkMarkdown(file, fs.readFileSync(file, "utf8")));
    }

    for (const { file, prefix, scope } of DOCS_DTS_FILES) {
        if (fs.existsSync(file)) {
            const text = fs.readFileSync(file, "utf8");
            const scoped = scope
                ? scopeDeclarations(file, text, scope, missing)
                : text;
            chunks.push(...chunkDts(file, scoped, prefix));
        } else {
            missing.push(file);
        }
    }

    const schemas = await buildToolSchemas(missing);
    if (missing.length > 0) {
        throw new Error(
            `docs corpus: ${missing.length} input(s) missing - update DOCS_DTS_FILES / TOOL_SCHEMA_TYPES / DOCS_SUBTREES in tools.mjs:\n${missing.map((x) => `  ${x}`).join("\n")}`,
        );
    }

    const corpus = normalizeChunks(chunks);
    const bundle = { schemas, chunks: corpus };
    const json = JSON.stringify(bundle);
    if (json.length > DOCS_RAW_BUDGET) {
        console.warn(
            `docs corpus: ${json.length} bytes exceeds the ${DOCS_RAW_BUDGET} raw budget - consider pruning DOCS_SUBTREES`,
        );
    }

    fs.mkdirSync("dist/docs", { recursive: true });
    fs.writeFileSync("dist/docs/perspective-docs.json", json);
    return {
        chunks: corpus.length,
        bytes: json.length,
        files: md_files.length,
    };
}

// Inline url() asset references as data URIs.
/** The `@mixin`/`@apply` at-rules the theme sources share palettes with. */
export const THEME_AT_RULES = {
    mixin: { prelude: "<custom-ident>", body: "style-block" },
    apply: { prelude: "<custom-ident>" },
};

/**
 * A visitor expanding `@apply <name>;` to the body of `@mixin <name> {}`,
 * with the mixins collected up front from `files` because the bundler visits
 * each stylesheet as it finishes parsing, not in source order.
 */
export function mixinVisitor(files) {
    const declared = new Map();
    for (const filename of files) {
        transformCss({
            filename,
            code: fs.readFileSync(filename),
            customAtRules: THEME_AT_RULES,
            visitor: {
                Rule: {
                    custom: {
                        mixin(rule) {
                            declared.set(
                                rule.prelude.value,
                                withoutNulls(rule.body.value),
                            );
                            return [];
                        },
                    },
                },
            },
        });
    }

    return {
        Rule: {
            custom: {
                mixin() {
                    return [];
                },
                apply(rule) {
                    const body = declared.get(rule.prelude.value);
                    if (body === undefined) {
                        throw new Error(
                            `Unknown mixin "${rule.prelude.value}"`,
                        );
                    }

                    return body;
                },
            },
        },
    };
}

/**
 * Drop `null` fields from a lightningcss AST value, since the serializer emits
 * them for absent `Option`s (such as a `var()` reference's css-modules `from`)
 * and the deserializer rejects them on the way back in.
 */
function withoutNulls(value) {
    if (Array.isArray(value)) {
        value.forEach(withoutNulls);
    } else if (value !== null && typeof value === "object") {
        for (const key of Object.keys(value)) {
            if (value[key] === null) {
                delete value[key];
            } else {
                withoutNulls(value[key]);
            }
        }
    }

    return value;
}

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
                    return;
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

const CEM_SCHEMA_VERSION = "2.1.0";

const CEM_MODULE_PATH = "dist/esm/perspective-viewer.js";

const CEM_ENTRY = "./src/ts/perspective-viewer.ts";

const CEM_WASM_DTS = "./dist/wasm/perspective-viewer.d.ts";

const CEM_THEMES_DIR = "./src/themes";

const CEM_HIDDEN_MEMBERS = new Set([
    "constructor",
    "free",
    "connectedCallback",
]);

const CEM_PRIVATE_CSS_PREFIXES = ["--theme-", "--pp-"];

const CEM_OPEN_CSS_FAMILIES = `
## Open CSS custom property families

Beyond the enumerated \`cssProperties\`, \`<perspective-viewer>\` reads these
families by prefix, so any name under them is honored:

- \`--psp-user--color-<name>\`, \`--psp-user--gradient-<name>\`,
  \`--psp-user--palette-<name>\`: user-defined swatches offered by the color,
  gradient and palette pickers.
- \`--psp-label--<slug>--content\`: the UI string for any settings-schema key,
  where \`<slug>\` is the key lowercased with non-alphanumerics folded to \`-\`.
- \`--psp-plugin-name--<plugin>--content\`: the display name of a registered
  plugin.`;

const CEM_ELEMENTS = [
    {
        tagName: "perspective-viewer",
        className: "PerspectiveViewerElement",
        statics: {
            file: "./src/ts/extensions.ts",
            name: "PerspectiveViewerElementExt",
        },
        attributes: [
            {
                name: "theme",
                type: { text: "string" },
                description:
                    "The active theme, as a `--psp-theme-name` value declared by a loaded stylesheet; read when the first panel is created and reflected when the user picks a theme.",
            },
        ],
        slots: [
            {
                name: "",
                description:
                    "The plugin element of a single-panel viewer, adopted from the light DOM.",
            },
            {
                name: "modal",
                description:
                    "Top-layer overlays such as the expression editor and column settings.",
            },
            {
                name: "<panel-id>",
                description:
                    "One named slot per panel; the viewer assigns `slot=<panel-id>` to each plugin element it adopts, so authors never set this by hand.",
            },
        ],
        cssParts: [
            {
                name: "tab",
                description:
                    "A panel's tab in the `<regular-layout>` titlebar.",
            },
        ],
        cssProperties: true,
    },
    {
        tagName: "perspective-viewer-plugin",
        className: "PerspectiveDebugPluginElement",
    },
];

const CEM_CSS_FAMILIES = [
    [/^--psp-theme-name$/, "Theme name"],
    [/--mask-image$/, "Icon (mask image)"],
    [/^--psp-icon-/, "Icon"],
    [/^--psp-plugin-name--/, "Plugin display name (intl string)"],
    [/^--psp-label--/, "UI label (intl string)"],
    [/^--psp-datagrid--/, "Datagrid plugin"],
    [/^--psp-charts--/, "Charts plugin"],
    [/^--psp-openlayers--/, "Map plugin (OpenLayers)"],
    [/^--psp-status/, "Status bar"],
    [/^--psp-(expression|code-editor)--/, "Expression editor"],
    [/^--psp-plugin/, "Plugin area"],
    [/./, "Viewer chrome"],
];

const CEM_CSS_SYNTAX = [
    [/^--psp-theme-name$/, "<string>"],
    [/--mask-image$/, "<image>"],
    [/--content$/, "<string>"],
    [/--(background-)?color$/, "<color>"],
    [/--font-family$/, "<family-name>"],
    [/--font-size$/, "<length>"],
];

function cemStripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function cemCssMixins(files) {
    const mixins = new Map();
    for (const file of files) {
        const text = cemStripComments(fs.readFileSync(file, "utf8"));
        const re = /@mixin\s+([\w-]+)\s*\{/g;
        let match;
        while ((match = re.exec(text)) !== null) {
            let depth = 1;
            let i = re.lastIndex;
            for (; i < text.length && depth > 0; i++) {
                if (text[i] === "{") {
                    depth += 1;
                } else if (text[i] === "}") {
                    depth -= 1;
                }
            }

            mixins.set(match[1], text.slice(re.lastIndex, i - 1));
        }
    }

    return mixins;
}

function cemCssDeclarations(file, mixins) {
    const text = cemStripComments(fs.readFileSync(file, "utf8")).replace(
        /@apply\s+([\w-]+)\s*;/g,
        (_, name) => mixins.get(name) ?? "",
    );

    const out = [];
    let depth = 0;
    let start = 0;
    let selector = "";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "{") {
            if (depth === 0) {
                selector = text.slice(start, i).trim();
                start = i + 1;
            }

            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                if (/perspective-viewer(?![\w-])/.test(selector)) {
                    out.push(...cemSplitDeclarations(text.slice(start, i)));
                }

                start = i + 1;
            }
        } else if (ch === ";" && depth === 0) {
            start = i + 1;
        }
    }

    return out;
}

function cemSplitDeclarations(body) {
    const out = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    const flush = (end) => {
        const decl = body.slice(start, end);
        const colon = decl.indexOf(":");
        const name = decl.slice(0, colon).trim();
        if (colon > 0 && name.startsWith("--")) {
            out.push({
                name,
                value: decl
                    .slice(colon + 1)
                    .replace(/\s+/g, " ")
                    .trim(),
            });
        }

        start = end + 1;
    };

    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (quote !== null) {
            if (ch === "\\") {
                i += 1;
            } else if (ch === quote) {
                quote = null;
            }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "(") {
            depth += 1;
        } else if (ch === ")") {
            depth -= 1;
        } else if (ch === ";" && depth === 0) {
            flush(i);
        }
    }

    flush(body.length);
    return out;
}

function cemCssProperties() {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.name.endsWith(".css")) {
                files.push(full);
            }
        }
    };

    walk(CEM_THEMES_DIR);
    files.sort();
    const mixins = cemCssMixins(files);
    const defaults = new Map();
    const names = new Set();
    for (const file of files) {
        const base = path.basename(file);
        for (const { name, value } of cemCssDeclarations(file, mixins)) {
            if (CEM_PRIVATE_CSS_PREFIXES.some((x) => name.startsWith(x))) {
                continue;
            }

            names.add(name);
            const rank =
                base === "pro-light.css" ? 0 : base === "defaults.css" ? 1 : 2;
            const prev = defaults.get(name);
            if (rank < 2 && (prev === undefined || rank < prev.rank)) {
                defaults.set(name, { rank, value });
            }
        }
    }

    return [...names].sort().map((name) => {
        const entry = { name };
        const syntax = CEM_CSS_SYNTAX.find(([re]) => re.test(name));
        if (syntax) {
            entry.syntax = syntax[1];
        }

        const fallback = defaults.get(name);
        if (fallback) {
            entry.default = fallback.value;
        }

        entry.description = CEM_CSS_FAMILIES.find(([re]) => re.test(name))[1];
        return entry;
    });
}

function cemDoc(node) {
    const docs = node.jsDoc ?? [];
    if (docs.length === 0) {
        return { description: "", params: {}, returns: "" };
    }

    const raw = docs[docs.length - 1]
        .getText()
        .replace(/^\/\*\*/, "")
        .replace(/\*\/$/, "")
        .split("\n")
        .map((x) => x.replace(/^\s*\* ?/, ""));

    const body = [];
    const params = {};
    const returns = [];
    let current = body;
    for (const line of raw) {
        const tag = line.match(/^@(\w+)\s*(.*)$/);
        if (!tag) {
            current.push(line);
            continue;
        }

        const [, name, rest] = tag;
        if (name === "param") {
            const [, param, text] = rest.match(/^(\w+)\s*-?\s*([\s\S]*)$/) ?? [
                null,
                rest,
                "",
            ];

            params[param] = [text];
            current = params[param];
        } else if (name === "example") {
            current = body;
            body.push("");
            if (rest) {
                body.push(rest);
            }
        } else if (name === "returns" || name === "return") {
            returns.push(rest);
            current = returns;
        } else {
            current = [];
        }
    }

    const join = (lines) =>
        lines
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    return {
        description: join(body),
        params: Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, join(v)]),
        ),
        returns: join(returns),
    };
}

function cemKnownTypes() {
    const known = new Map();
    const stems = (dir) =>
        fs.existsSync(dir)
            ? fs
                  .readdirSync(dir)
                  .filter((x) => x.endsWith(".d.ts"))
                  .map((x) => x.slice(0, -".d.ts".length))
            : [];

    for (const name of stems("../perspective-js/dist/ts-rs")) {
        known.set(name, "@perspective-dev/client");
    }

    const public_types = "../perspective-js/src/ts/public_types.ts";
    if (fs.existsSync(public_types)) {
        const block = fs
            .readFileSync(public_types, "utf8")
            .match(/export type \{([^}]*)\}/);

        for (const name of (block?.[1] ?? "").split(",")) {
            if (name.trim()) {
                known.set(name.trim(), "@perspective-dev/client");
            }
        }
    }

    for (const name of stems("./dist/ts-rs")) {
        known.set(name, "@perspective-dev/viewer");
    }

    return known;
}

function cemType(text, known) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const references = [];
    for (const match of normalized.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
        const pkg = known.get(match[0]);
        if (pkg) {
            references.push({
                name: match[0],
                package: pkg,
                start: match.index,
                end: match.index + match[0].length,
            });
        }
    }

    return references.length > 0
        ? { text: normalized, references }
        : { text: normalized };
}

function cemParameters(ts, checker, known, params, doc) {
    return params.map((p) => {
        const name = p.name.getText();
        const entry = { name };
        if (p.dotDotDotToken) {
            entry.rest = true;
        }

        if (p.questionToken || p.initializer) {
            entry.optional = true;
        }

        entry.type = cemType(
            p.type
                ? p.type.getText()
                : checker.typeToString(checker.getTypeAtLocation(p)),
            known,
        );

        if (doc.params[name]) {
            entry.description = doc.params[name];
        }

        return entry;
    });
}

function cemReturn(ts, checker, known, node) {
    if (node.type) {
        return { type: cemType(node.type.getText(), known) };
    }

    const signature = checker.getSignatureFromDeclaration(node);
    return signature
        ? {
              type: cemType(
                  checker.typeToString(signature.getReturnType()),
                  known,
              ),
          }
        : undefined;
}

function cemIsPublic(ts, member) {
    const name = member.name?.getText();
    if (!name || CEM_HIDDEN_MEMBERS.has(name) || name.startsWith("_")) {
        return false;
    }

    if (
        ts.isPrivateIdentifier(member.name) ||
        ts.isComputedPropertyName(member.name)
    ) {
        return false;
    }

    const flags = ts.getCombinedModifierFlags(member);
    return !(flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));
}

function cemMembers(
    ts,
    checker,
    known,
    members,
    { force_static = false } = {},
) {
    const out = [];
    const accessors = new Map();
    for (const member of members) {
        if (!cemIsPublic(ts, member)) {
            continue;
        }

        const name = member.name.getText();
        const doc = cemDoc(member);
        const is_static =
            force_static ||
            !!(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static);

        const base = { name, privacy: "public" };
        if (is_static) {
            base.static = true;
        }

        if (doc.description) {
            base.description = doc.description;
        }

        if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
            const entry = { kind: "method", ...base };
            const parameters = cemParameters(
                ts,
                checker,
                known,
                member.parameters,
                doc,
            );

            if (parameters.length > 0) {
                entry.parameters = parameters;
            }

            const ret = cemReturn(ts, checker, known, member);
            if (ret) {
                if (doc.returns) {
                    ret.description = doc.returns;
                }

                entry.return = ret;
            }

            out.push(entry);
        } else if (ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
            const existing = accessors.get(name);
            if (existing) {
                delete existing.readonly;
                continue;
            }

            const type_node = ts.isGetAccessor(member)
                ? member.type
                : member.parameters[0]?.type;

            const entry = {
                kind: "field",
                ...base,
                type: cemType(
                    type_node
                        ? type_node.getText()
                        : checker.typeToString(
                              checker.getTypeAtLocation(member),
                          ),
                    known,
                ),
                readonly: true,
            };

            accessors.set(name, entry);
            out.push(entry);
        } else if (
            ts.isPropertyDeclaration(member) ||
            ts.isPropertySignature(member)
        ) {
            const entry = {
                kind: "field",
                ...base,
                type: cemType(
                    member.type
                        ? member.type.getText()
                        : checker.typeToString(
                              checker.getTypeAtLocation(member),
                          ),
                    known,
                ),
            };

            if (
                ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Readonly
            ) {
                entry.readonly = true;
            }

            out.push(entry);
        }
    }

    return out;
}

function cemFindDeclaration(ts, source, name) {
    for (const stmt of source.statements) {
        if (
            (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
            stmt.name?.text === name
        ) {
            return stmt;
        }

        if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === name) {
            return stmt;
        }

        if (ts.isVariableStatement(stmt)) {
            for (const decl of stmt.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === name) {
                    return { statement: stmt, declaration: decl };
                }
            }
        }
    }

    return null;
}

function cemClass(ts, checker, known, cls, name) {
    const doc = cemDoc(cls);
    const entry = { kind: "class", name };
    if (doc.description) {
        entry.description = doc.description;
    }

    for (const clause of cls.heritageClauses ?? []) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            entry.superclass = { name: clause.types[0].expression.getText() };
        }
    }

    const members = cemMembers(ts, checker, known, cls.members);
    if (members.length > 0) {
        entry.members = members;
    }

    return entry;
}

function cemFunction(ts, checker, known, fn, name) {
    const doc = cemDoc(fn);
    const entry = { kind: "function", name };
    if (doc.description) {
        entry.description = doc.description;
    }

    const parameters = cemParameters(ts, checker, known, fn.parameters, doc);
    if (parameters.length > 0) {
        entry.parameters = parameters;
    }

    const ret = cemReturn(ts, checker, known, fn);
    if (ret) {
        if (doc.returns) {
            ret.description = doc.returns;
        }

        entry.return = ret;
    }

    return entry;
}

function cemVariable(ts, checker, known, { statement, declaration }, name) {
    const doc = cemDoc(statement);
    const entry = {
        kind: "variable",
        name,
        type: cemType(
            declaration.type
                ? declaration.type.getText()
                : checker.typeToString(
                      checker.getTypeAtLocation(declaration),
                      undefined,
                      ts.TypeFormatFlags.NoTruncation,
                  ),
            known,
        ),
    };

    if (doc.description) {
        entry.description = doc.description;
    }

    return entry;
}

function cemEvents(ts, checker, known, iface) {
    const events = [];
    const seen = new Set();
    for (const member of iface.members) {
        if (
            !ts.isMethodSignature(member) ||
            member.name.getText() !== "addEventListener"
        ) {
            continue;
        }

        const [name_param, cb_param] = member.parameters;
        const literal = name_param?.type;
        if (!literal || !ts.isLiteralTypeNode(literal)) {
            continue;
        }

        const name = literal.literal.text;
        if (seen.has(name)) {
            continue;
        }

        seen.add(name);
        const entry = { name };
        const cb = cb_param?.type;
        if (cb && ts.isFunctionTypeNode(cb) && cb.parameters[0]?.type) {
            entry.type = cemType(cb.parameters[0].type.getText(), known);
        }

        const doc = cemDoc(member);
        if (doc.description) {
            entry.description = doc.description;
        }

        events.push(entry);
    }

    return events;
}

function cemValueExports(ts, entry) {
    const exports = [];
    for (const stmt of entry.statements) {
        if (ts.isExportDeclaration(stmt)) {
            if (stmt.isTypeOnly || !stmt.exportClause) {
                continue;
            }

            if (!ts.isNamedExports(stmt.exportClause)) {
                continue;
            }

            for (const spec of stmt.exportClause.elements) {
                if (spec.isTypeOnly) {
                    continue;
                }

                exports.push({
                    name: spec.name.text,
                    local: (spec.propertyName ?? spec.name).text,
                    from: stmt.moduleSpecifier?.text ?? null,
                });
            }
        } else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
            exports.push({
                name: "default",
                local: "default",
                from: null,
                node: stmt,
            });
        }
    }

    return exports;
}

/// Build `dist/custom-elements.json`, a Custom Elements Manifest for the
/// elements this package registers plus its value exports.
export async function buildCustomElementsManifest(
    out_file = "dist/custom-elements.json",
) {
    const ts = (await import("typescript")).default;
    const config = ts.parseJsonConfigFileContent(
        ts.readConfigFile("tsconfig.json", ts.sys.readFile).config,
        ts.sys,
        ".",
    );

    const program = ts.createProgram(
        [
            CEM_ENTRY,
            CEM_WASM_DTS,
            ...CEM_ELEMENTS.map((x) => x.statics?.file).filter(Boolean),
        ],
        { ...config.options, noEmit: true },
    );

    const checker = program.getTypeChecker();
    const known = cemKnownTypes();
    const source = (file) => {
        const sf = program.getSourceFile(path.resolve(file));
        if (!sf) {
            throw new Error(
                `custom-elements.json: ${file} is not in the program`,
            );
        }

        return sf;
    };

    const declarations = [];
    const exports = [];
    const wasm = source(CEM_WASM_DTS);
    for (const element of CEM_ELEMENTS) {
        const cls = cemFindDeclaration(ts, wasm, element.className);
        if (!cls) {
            throw new Error(
                `custom-elements.json: ${element.className} not found in ${CEM_WASM_DTS}`,
            );
        }

        const entry = cemClass(ts, checker, known, cls, element.className);
        entry.tagName = element.tagName;
        entry.customElement = true;
        entry.superclass = { name: "HTMLElement" };
        if (element.statics) {
            const iface = cemFindDeclaration(
                ts,
                source(element.statics.file),
                element.statics.name,
            );

            const statics = cemMembers(ts, checker, known, iface.members, {
                force_static: true,
            }).filter(
                (x) =>
                    !["addEventListener", "removeEventListener"].includes(
                        x.name,
                    ),
            );

            entry.members = [...(entry.members ?? []), ...statics];
            const events = cemEvents(ts, checker, known, iface);
            if (events.length > 0) {
                entry.events = events;
            }
        }

        if (element.attributes) {
            entry.attributes = element.attributes;
        }

        if (element.slots) {
            entry.slots = element.slots;
        }

        if (element.cssParts) {
            entry.cssParts = element.cssParts;
        }

        if (element.cssProperties) {
            entry.cssProperties = cemCssProperties();
            entry.description =
                `${entry.description ?? ""}\n${CEM_OPEN_CSS_FAMILIES}`.trim();
        }

        declarations.push(entry);
        exports.push({
            kind: "custom-element-definition",
            name: element.tagName,
            declaration: { name: element.className, module: CEM_MODULE_PATH },
        });
    }

    const entry_source = source(CEM_ENTRY);
    for (const value of cemValueExports(ts, entry_source)) {
        let decl;
        if (value.node) {
            const expr = value.node.expression;
            const fields = ts.isObjectLiteralExpression(expr)
                ? expr.properties
                      .map((x) => x.name?.getText())
                      .filter(Boolean)
                      .map((x) => `${x}: typeof ${x}`)
                : [];

            decl = {
                kind: "variable",
                name: "default",
                type: cemType(
                    fields.length > 0
                        ? `{ ${fields.join("; ")} }`
                        : expr.getText(),
                    known,
                ),
            };
        } else {
            const file = value.from
                ? path.resolve(
                      path.dirname(path.resolve(CEM_ENTRY)),
                      value.from,
                  )
                : path.resolve(CEM_ENTRY);

            const found = cemFindDeclaration(ts, source(file), value.local);
            if (!found) {
                throw new Error(
                    `custom-elements.json: export ${value.name} has no declaration in ${file}`,
                );
            }

            if (ts.isClassDeclaration(found)) {
                decl = cemClass(ts, checker, known, found, value.local);
            } else if (ts.isFunctionDeclaration(found)) {
                decl = cemFunction(ts, checker, known, found, value.local);
            } else if (ts.isInterfaceDeclaration(found)) {
                continue;
            } else {
                decl = cemVariable(ts, checker, known, found, value.local);
            }
        }

        if (!declarations.some((x) => x.name === decl.name)) {
            declarations.push(decl);
        }

        exports.push({
            kind: "js",
            name: value.name,
            declaration: { name: decl.name, module: CEM_MODULE_PATH },
        });
    }

    const manifest = {
        schemaVersion: CEM_SCHEMA_VERSION,
        readme: "README.md",
        modules: [
            {
                kind: "javascript-module",
                path: CEM_MODULE_PATH,
                summary:
                    "The `<perspective-viewer>` and `<perspective-viewer-plugin>` custom elements.",
                declarations,
                exports,
            },
        ],
    };

    fs.mkdirSync(path.dirname(out_file), { recursive: true });
    fs.writeFileSync(out_file, JSON.stringify(manifest, null, 4) + "\n");
    const elements = declarations.filter((x) => x.customElement);
    return {
        members: elements.reduce((n, x) => n + (x.members?.length ?? 0), 0),
        events: elements.reduce((n, x) => n + (x.events?.length ?? 0), 0),
        cssProperties: elements.reduce(
            (n, x) => n + (x.cssProperties?.length ?? 0),
            0,
        ),
        exports: exports.length,
    };
}
