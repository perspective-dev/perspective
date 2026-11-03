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
import { bundle as bundleCss, composeVisitors } from "lightningcss";

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
        "CustomDatetimeStyleConfig",
        "SimpleDatetimeStyleConfig",
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
function summarySubtrees(summary, roots) {
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
        console.warn(`docs corpus: \`${root}\` is not in ${summary}`);
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
function scopeDeclarations(file, text, scope) {
    return scope
        .map((decl) => {
            const [kind, name] = decl.split(/\s+/);
            const re = new RegExp(
                `(?:\\/\\*\\*(?:(?!\\*\\/)[\\s\\S])*\\*\\/\\s*)?(?:export\\s+)?(?:declare\\s+)?${kind}\\s+${name}\\b`,
            );

            const match = re.exec(text);
            if (!match) {
                console.warn(`docs corpus: \`${decl}\` not found in ${file}`);
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

async function buildToolSchemas() {
    const { createGenerator } = await import("ts-json-schema-generator");
    const schemas = {};
    for (const [type, path] of TOOL_SCHEMA_TYPES) {
        if (!fs.existsSync(path)) {
            console.warn(
                `docs corpus: ${path} missing, skipping ${type} schema`,
            );
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
export async function buildDocsCorpus() {
    const chunks = [];
    const md_files = [
        ...summarySubtrees(DOCS_SUMMARY, DOCS_SUBTREES),
        ...DOCS_MD_FILES,
    ].filter((file) => {
        if (!fs.existsSync(file)) {
            console.warn(`docs corpus: ${file} missing, skipping`);
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
            const scoped = scope ? scopeDeclarations(file, text, scope) : text;
            chunks.push(...chunkDts(file, scoped, prefix));
        } else {
            console.warn(`docs corpus: ${file} missing, skipping API chunks`);
        }
    }

    const corpus = normalizeChunks(chunks);
    const bundle = { schemas: await buildToolSchemas(), chunks: corpus };
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
