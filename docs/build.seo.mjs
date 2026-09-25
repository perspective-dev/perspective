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
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const README = path.join(__dirname, "../README.md");
const GUIDE_SRC = path.join(__dirname, "md");
const PROJECTS_SRC = path.join(__dirname, "src/data/projects");

export const SITE = "https://perspective-dev.github.io";
const REPO = "https://github.com/perspective-dev/perspective";
const BRAND = "Perspective";
const SENTENCE =
    "Perspective is an open-source, WebAssembly-powered data grid, pivot " +
    "table and charting component for large, real-time and streaming " +
    "datasets — in the browser, Python, Jupyter, Node.js and Rust.";

const HEAD_SLOT = "<!--seo:head-->";
const ABOUT_SLOT = "<!--seo:about-->";
const SPAN = /<!-- site:begin -->([\s\S]*?)<!-- site:end -->/g;

const AI_CRAWLERS = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Applebot-Extended",
    "CCBot",
];

const GALLERY_GROUPS = [
    [
        "Dashboards and datasets",
        (p) => p.source.kind === "fetch" && !isFeature(p) && !isBenchmark(p),
    ],
    ["Benchmarks", isBenchmark],
    ["Real-time and streaming", (p) => p.source.kind === "eval"],
    ["Expressions", (p) => p.source.kind === "generated"],
    ["Configuration variations", isFeature],
];

const INSTALL = [
    [
        "JavaScript",
        "npm install @perspective-dev/client @perspective-dev/server @perspective-dev/viewer @perspective-dev/viewer-datagrid @perspective-dev/viewer-charts",
    ],
    ["React", "npm install @perspective-dev/react"],
    ["Python and Jupyter", 'pip install "perspective-python[jupyter]"'],
    ["Rust", "cargo add perspective"],
];

const LINKS = [
    [
        "Guide",
        [
            ["What is Perspective", "/guide/index.html"],
            [
                "Data architecture: client-only, replicated, server-only",
                "/guide/explanation/architecture.html",
            ],
            [
                "Table: streaming columnar storage",
                "/guide/explanation/table.html",
            ],
            [
                "View: pivots, aggregates, filters and expressions",
                "/guide/explanation/view.html",
            ],
            ["Joins", "/guide/explanation/join.html"],
            [
                "Virtual servers for DuckDB, ClickHouse, PostgreSQL and Polars",
                "/guide/explanation/virtual_servers.html",
            ],
            ["Benchmarks", "/guide/benchmarks.html"],
            ["Glossary", "/guide/glossary.html"],
            ["FAQ", "/guide/FAQ.html"],
        ],
    ],
    [
        "Use cases",
        [
            [
                "Real-time dashboards over WebSocket",
                "/guide/use_cases/real_time_dashboard.html",
            ],
            [
                "Streaming pivot tables",
                "/guide/use_cases/streaming_pivot_table.html",
            ],
            [
                "Millions of rows in the browser",
                "/guide/use_cases/large_datasets.html",
            ],
            [
                "Trading blotters, order books and market data",
                "/guide/use_cases/market_data.html",
            ],
            [
                "Interactive pivot tables and charts in Jupyter",
                "/guide/use_cases/jupyter.html",
            ],
            [
                "A UI for DuckDB, ClickHouse and PostgreSQL",
                "/guide/use_cases/database_ui.html",
            ],
            [
                "Case study: a multi-billion row tick history in a browser tab with DuckLake and DuckDB-WASM",
                "/guide/use_cases/ducklake.html",
            ],
            [
                "Embedded analytics in a web application",
                "/guide/use_cases/embedded_analytics.html",
            ],
            ["LLM and agent-driven analytics", "/guide/use_cases/agent.html"],
        ],
    ],
    [
        "Get started",
        [
            [
                "JavaScript installation",
                "/guide/how_to/javascript/installation.html",
            ],
            ["React", "/guide/how_to/javascript/react.html"],
            ["Python installation", "/guide/how_to/python/installation.html"],
            [
                "PerspectiveWidget for Jupyter",
                "/guide/how_to/python/jupyterlab.html",
            ],
            ["Example gallery", "/gallery/index.html"],
        ],
    ],
    [
        "API reference",
        [
            [
                "perspective-viewer Web Component",
                "/viewer/modules/perspective-viewer.html",
            ],
            [
                "JavaScript client",
                "/browser/modules/src_ts_perspective.browser.ts.html",
            ],
            ["React", "/react/index.html"],
            ["Python", "/python/index.html"],
            ["Rust", "https://docs.rs/perspective/latest/perspective/"],
        ],
    ],
];

function isFeature(project) {
    return project.id.startsWith("feature-");
}

function isBenchmark(project) {
    return project.id.startsWith("benchmarks-");
}

function pageName(project) {
    return isFeature(project) && project.description
        ? `${project.title} — ${project.description}`
        : project.title;
}

export function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function inline(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * Render the Markdown subset the README's site spans use: `##` headings,
 * paragraphs and flat `-` lists, with inline code, bold and links.
 *
 * @param markdown the source text.
 */
export function renderMarkdown(markdown) {
    const out = [];
    let paragraph = [];
    let items = null;
    const flush = () => {
        if (paragraph.length > 0) {
            out.push(`<p>${inline(paragraph.join(" "))}</p>`);
            paragraph = [];
        }

        if (items) {
            out.push(
                `<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`,
            );

            items = null;
        }
    };

    for (const raw of markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
        const line = raw.trimEnd();
        const heading = /^(#{2,4})\s+(.*)$/.exec(line);
        if (heading) {
            flush();
            const level = heading[1].length;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        } else if (line.trim() === "") {
            if (!items) {
                flush();
            }
        } else if (/^- /.test(line)) {
            if (paragraph.length > 0) {
                flush();
            }

            items = items ?? [];
            items.push(line.slice(2));
        } else if (items && /^\s+\S/.test(line)) {
            items[items.length - 1] += ` ${line.trim()}`;
        } else {
            if (items) {
                flush();
            }

            paragraph.push(line.trim());
        }
    }

    flush();
    return out.join("\n");
}

function readmeSpans() {
    const source = fs.readFileSync(README, "utf8");
    const spans = [...source.matchAll(SPAN)].map((m) => m[1]);
    if (spans.length === 0) {
        throw new Error("README.md has no `<!-- site:begin -->` spans");
    }

    return spans;
}

function version() {
    const pkg = path.join(__dirname, "package.json");
    return JSON.parse(fs.readFileSync(pkg, "utf8")).version;
}

function jsonLd(data) {
    const body = JSON.stringify(data).replaceAll("<", "\\u003c");
    return `<script type="application/ld+json">${body}</script>`;
}

/**
 * The `<head>` tags a page's title, description, canonical URL and share
 * image expand to.
 *
 * @param page `title`, `description`, site-relative `url` and `image`, and
 * optional `jsonld` objects.
 */
export function headTags(page) {
    const url = SITE + page.url;
    const image = SITE + page.image;
    const tags = [
        `<title>${escapeHtml(page.title)}</title>`,
        `<meta name="description" content="${escapeHtml(truncate(page.description))}" />`,
        `<link rel="canonical" href="${url}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${BRAND}" />`,
        `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
        `<meta property="og:description" content="${escapeHtml(truncate(page.description))}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:image" content="${image}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(truncate(page.description))}" />`,
        `<meta name="twitter:image" content="${image}" />`,
        ...(page.jsonld ?? []).map(jsonLd),
    ];

    return tags.join("\n        ");
}

function homeJsonLd() {
    return [
        {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: BRAND,
            description: SENTENCE,
            url: `${SITE}/`,
            image: `${SITE}/projects/light/collage.png`,
            applicationCategory: "DeveloperApplication",
            applicationSubCategory: "Data visualization",
            operatingSystem: "Web, Windows, macOS, Linux",
            softwareVersion: version(),
            license: "https://www.apache.org/licenses/LICENSE-2.0",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            sameAs: [
                REPO,
                "https://www.npmjs.com/package/@perspective-dev/client",
                "https://pypi.org/project/perspective-python/",
                "https://crates.io/crates/perspective",
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "SoftwareSourceCode",
            name: BRAND,
            description: SENTENCE,
            codeRepository: REPO,
            license: "https://www.apache.org/licenses/LICENSE-2.0",
            programmingLanguage: ["C++", "Rust", "TypeScript", "Python"],
            runtimePlatform: ["WebAssembly", "Node.js", "Python"],
        },
    ];
}

function installHtml() {
    const rows = INSTALL.map(
        ([label, command]) =>
            `<dt>${escapeHtml(label)}</dt><dd><pre><code>${escapeHtml(command)}</code></pre></dd>`,
    );

    return `<h2>Install</h2>\n<dl class="about__install">${rows.join("")}</dl>`;
}

function linksHtml() {
    const groups = LINKS.map(([title, links]) => {
        const items = links.map(
            ([label, href]) =>
                `<li><a href="${href}">${escapeHtml(label)}</a></li>`,
        );

        return `<section><h3>${escapeHtml(title)}</h3><ul>${items.join("")}</ul></section>`;
    });

    return `<h2>Documentation</h2>\n<nav class="about__links">${groups.join("")}</nav>`;
}

function footerHtml() {
    return `<footer class="about__footer"><p>
        <a href="${REPO}">GitHub</a> ·
        <a href="https://www.npmjs.com/package/@perspective-dev/client">npm</a> ·
        <a href="https://pypi.org/project/perspective-python/">PyPI</a> ·
        <a href="https://crates.io/crates/perspective">crates.io</a> ·
        Apache-2.0 · A member project of the
        <a href="https://openjsf.org/">OpenJS Foundation</a>.
    </p></footer>`;
}

function aboutFrame(body) {
    return `<article class="about__body">
    <button type="button" class="about__close" data-role="close" aria-label="Close">×</button>
    ${body}
    ${footerHtml()}
</article>`;
}

function homeAbout(projects) {
    const [intro, ...rest] = readmeSpans();
    const examples = projects
        .filter((p) => !isFeature(p))
        .map(
            (p) =>
                `<li><a href="${galleryUrl(p)}">${escapeHtml(pageName(p))}</a></li>`,
        );

    return aboutFrame(`<h1>${BRAND}: an open-source data grid, pivot table and charts for real-time data</h1>
    ${renderMarkdown(intro)}
    <p><img
        class="about__collage"
        loading="lazy"
        decoding="async"
        width="1200"
        alt="A collage of Perspective data grids, pivot tables, charts and maps"
        src="/projects/light/collage.png"
    /></p>
    ${installHtml()}
    ${rest.map(renderMarkdown).join("\n")}
    <h2>Examples</h2>
    <ul class="about__examples">${examples.join("")}</ul>
    <p><a href="/gallery/index.html">All ${projects.length} examples</a></p>
    ${linksHtml()}`);
}

const AGGREGATE_FREE = new Set(["Datagrid"]);

function list(values) {
    const names = values.filter((x) => typeof x === "string");
    if (names.length <= 1) {
        return names.join("");
    }

    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function filterClause(filter) {
    const [column, op, value] = filter;
    const shown = Array.isArray(value) ? value.join(", ") : value;
    return shown === null || shown === undefined
        ? `${column} ${op}`
        : `${column} ${op} ${shown}`;
}

/**
 * One panel's `ViewerConfig` as an English clause, e.g. "Y Bar chart of
 * Sales, grouped by Region".
 *
 * @param config the panel's `ViewerConfig`.
 */
export function describePanel(config) {
    const plugin = config.plugin ?? "Datagrid";
    const columns = list((config.columns ?? []).slice(0, 4));
    const parts = [
        AGGREGATE_FREE.has(plugin) ? "Data grid" : `${plugin} chart`,
    ];

    if (columns) {
        parts[0] += ` of ${columns}`;
    }

    if (config.group_by?.length > 0) {
        parts.push(`grouped by ${list(config.group_by)}`);
    }

    if (config.split_by?.length > 0) {
        parts.push(`split by ${list(config.split_by)}`);
    }

    if (config.filter?.length > 0) {
        parts.push(`filtered to ${config.filter.map(filterClause).join(", ")}`);
    }

    if (config.sort?.length > 0) {
        parts.push(`sorted by ${list(config.sort.map((x) => x[0]))}`);
    }

    const expressions = Object.keys(config.expressions ?? {});
    if (expressions.length > 0) {
        parts.push(
            `with ${expressions.length} computed expression column${expressions.length > 1 ? "s" : ""}`,
        );
    }

    return parts.join(", ");
}

/**
 * A `WorkspaceConfig` as an English sentence — one clause for a single
 * panel, a plugin roster for a multi-panel dashboard.
 *
 * @param workspace the Project's `WorkspaceConfig`.
 */
export function describeWorkspace(workspace) {
    const panels = Object.values(workspace.panels ?? {});
    if (panels.length === 1) {
        return `${describePanel(panels[0])}.`;
    }

    const plugins = panels.map((x) => x.plugin ?? "Datagrid");
    const counts = new Map();
    for (const plugin of plugins) {
        counts.set(plugin, (counts.get(plugin) ?? 0) + 1);
    }

    const roster = [...counts].map(([plugin, n]) =>
        n > 1 ? `${n} × ${plugin}` : plugin,
    );

    const clauses = panels.map(describePanel).join("; ");
    return `${panels.length}-panel dashboard of ${list(roster)}: ${clauses}.`;
}

function galleryUrl(project) {
    return `/gallery/${project.id}.html`;
}

function sourceNote(source) {
    if (source.kind === "fetch") {
        return `Loaded from <code>${escapeHtml(source.url)}</code> as ${escapeHtml(source.format)} into the <code>${escapeHtml(source.engine)}</code> engine.`;
    }

    return source.kind === "eval"
        ? "Generated continuously in the browser by a JavaScript simulation streaming into a Perspective <code>Table</code>."
        : "Generated in the browser when the example loads.";
}

function projectAbout(project, summary, sourceText) {
    const own =
        project.description && !isFeature(project)
            ? `<p>${escapeHtml(project.description)}</p>`
            : "";

    const config = JSON.stringify(project.workspace, null, 4);
    return aboutFrame(`<p class="about__crumbs"><a href="/">${BRAND}</a> › <a href="/gallery/index.html">Examples</a></p>
    <h1>${escapeHtml(pageName(project))}</h1>
    <p>${escapeHtml(summary)}</p>
    ${own}
    <p><img
        class="about__thumb"
        loading="lazy"
        decoding="async"
        alt="${escapeHtml(`${pageName(project)}: ${summary}`)}"
        src="/projects/light/${escapeHtml(project.id)}.png"
    /></p>
    <h2>Data</h2>
    <p>${escapeHtml(sourceText)}</p>
    <p>${sourceNote(project.source)}</p>
    <h2>Configuration</h2>
    <p>This example is a saved <code>&lt;perspective-viewer&gt;</code> workspace. Pass this JSON to <code>viewer.restoreWorkspace()</code> to reproduce it over the same table:</p>
    <pre><code>${escapeHtml(config)}</code></pre>
    <h2>About Perspective</h2>
    <p>${escapeHtml(SENTENCE)}</p>
    ${linksHtml()}`);
}

function galleryAbout(projects, summaries) {
    const groups = GALLERY_GROUPS.map(([title, test]) => {
        const items = projects
            .filter(test)
            .map(
                (p) =>
                    `<li><a href="${galleryUrl(p)}">${escapeHtml(pageName(p))}</a> — ${escapeHtml(summaries.get(p.id))}</li>`,
            );

        return `<h2>${escapeHtml(title)}</h2>\n<ul>${items.join("")}</ul>`;
    });

    return aboutFrame(`<p class="about__crumbs"><a href="/">${BRAND}</a></p>
    <h1>${BRAND} example gallery</h1>
    <p>${projects.length} live, editable examples of Perspective data grids, pivot tables, WebGL charts, maps and real-time dashboards. Every example runs entirely in the browser on WebAssembly.</p>
    ${groups.join("\n")}
    ${linksHtml()}`);
}

/**
 * The Project corpus and per-source descriptions, bundled out of the app's
 * TypeScript so the build and the app read one definition.
 */
export async function loadCorpus() {
    const result = await esbuild.build({
        stdin: {
            contents:
                'export { PROJECTS } from "./corpus.ts";\n' +
                'export { SOURCE_DESCRIPTIONS } from "./descriptions.ts";\n' +
                'export { HOME_TITLE, pageTitle } from "./types.ts";',
            resolveDir: PROJECTS_SRC,
            loader: "ts",
        },
        bundle: true,
        write: false,
        format: "esm",
        platform: "node",
        logLevel: "silent",
    });

    const code = Buffer.from(result.outputFiles[0].contents).toString("base64");
    return import(`data:text/javascript;base64,${code}`);
}

function fill(template, head, about) {
    if (!template.includes(HEAD_SLOT) || !template.includes(ABOUT_SLOT)) {
        throw new Error(`index.html is missing ${HEAD_SLOT} or ${ABOUT_SLOT}`);
    }

    return template.replace(HEAD_SLOT, head).replace(ABOUT_SLOT, about);
}

/**
 * Write `index.html`, one `gallery/<id>.html` per described Project and
 * `gallery/index.html` — each the app's own HTML with its `<head>` and
 * About dialog filled in.
 *
 * @param template the contents of `src/index.html`.
 * @param dist the output directory.
 * @returns the site-relative URLs written.
 */
export async function writePages(template, dist) {
    const { PROJECTS, SOURCE_DESCRIPTIONS, HOME_TITLE, pageTitle } =
        await loadCorpus();
    const summaries = new Map(
        PROJECTS.map((p) => [p.id, describeWorkspace(p.workspace)]),
    );

    const home = fill(
        template,
        headTags({
            title: HOME_TITLE,
            description: SENTENCE,
            url: "/",
            image: "/projects/light/collage.png",
            jsonld: homeJsonLd(),
        }),
        homeAbout(PROJECTS),
    );

    fs.writeFileSync(path.join(dist, "index.html"), home);
    fs.mkdirSync(path.join(dist, "gallery"), { recursive: true });
    const urls = ["/", "/gallery/index.html"];
    const listed = [];
    for (const project of PROJECTS) {
        const sourceText = SOURCE_DESCRIPTIONS[project.source.name];
        if (!sourceText) {
            console.warn(
                `No source description for "${project.source.name}"; ` +
                    `skipping gallery/${project.id}.html`,
            );

            continue;
        }

        const summary = summaries.get(project.id);
        const page = fill(
            template,
            headTags({
                title: pageTitle(project),
                description: `${summary} ${sourceText}`,
                url: galleryUrl(project),
                image: `/projects/light/${project.id}.png`,
            }),
            projectAbout(project, summary, sourceText),
        );

        fs.writeFileSync(
            path.join(dist, "gallery", `${project.id}.html`),
            page,
        );
        urls.push(galleryUrl(project));
        listed.push(project);
    }

    const gallery = fill(
        template,
        headTags({
            title: `Example gallery — ${BRAND} data grids, pivot tables and charts`,
            description: `${listed.length} live examples of Perspective data grids, pivot tables, WebGL charts, maps and real-time dashboards, running in the browser on WebAssembly.`,
            url: "/gallery/index.html",
            image: "/projects/light/collage.png",
        }),
        galleryAbout(listed, summaries),
    );

    fs.writeFileSync(path.join(dist, "gallery", "index.html"), gallery);
    return urls;
}

function walk(dir, test, found = []) {
    if (!fs.existsSync(dir)) {
        return found;
    }

    for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, child.name);
        if (child.name === "node_modules") {
            continue;
        }

        if (child.isDirectory()) {
            walk(full, test, found);
        } else if (test(full)) {
            found.push(full);
        }
    }

    return found;
}

function guideTitles() {
    const summary = fs.readFileSync(path.join(GUIDE_SRC, "SUMMARY.md"), "utf8");
    const entries = [];
    let section = "Overview";
    for (const line of summary.split("\n")) {
        const heading = /^# (.+)$/.exec(line);
        const link = /\[(.+?)\]\(\.\/(.+?)\.md\)/.exec(line);
        if (heading && heading[1] !== "Summary") {
            section = heading[1];
        } else if (link) {
            entries.push({
                section,
                title: link[1].replaceAll("`", ""),
                file: link[2],
            });
        }
    }

    return entries;
}

const ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
};

function plainText(html) {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (x) => ENTITIES[x])
        .replace(/\s+/g, " ")
        .trim();
}

function truncate(text, max = 300) {
    return text.length > max
        ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`
        : text;
}

function pageDescription(html) {
    const authored = /<!--\s*description:\s*([\s\S]*?)-->/.exec(html);
    if (authored) {
        return truncate(plainText(authored[1]));
    }

    const main = /<main>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "";
    for (const match of main.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
        const text = plainText(match[1]);
        if (text.length >= 40) {
            return truncate(text);
        }
    }

    return SENTENCE;
}

function faqJsonLd(html) {
    const main = /<main>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "";
    const pairs = main.matchAll(
        /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[23][\s>]|$)/g,
    );

    const questions = [...pairs]
        .map(([, question, answer]) => ({
            "@type": "Question",
            name: plainText(question),
            acceptedAnswer: { "@type": "Answer", text: plainText(answer) },
        }))
        .filter((x) => x.acceptedAnswer.text.length > 0);

    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: questions,
    };
}

const GUIDE_SUFFIX = "Perspective data grid, pivot table & charts";

const GUIDE_LANGUAGES = new Set(["JavaScript", "Python", "Rust"]);

const GUIDE_HEADINGS = new Map([
    ["perspective", "What is Perspective"],
    ["explanation/table", "Table: streaming, columnar data storage"],
    ["explanation/view", "View: live pivots, aggregates, filters and sorts"],
    ["explanation/join", "Join: reactive joins across streaming tables"],
    ["explanation/view/config/expressions", "Expression columns"],
    [
        "explanation/virtual_servers",
        "Virtual servers: Perspective over your database",
    ],
]);

function guideHeading(entry) {
    const heading = GUIDE_HEADINGS.get(entry.file) ?? entry.title;
    return GUIDE_LANGUAGES.has(entry.section)
        ? `${heading} (${entry.section})`
        : heading;
}

const GUIDE_ALIASES = new Map([["perspective.html", "index.html"]]);

/**
 * Give every mdBook page a description, canonical URL, share tags,
 * breadcrumbs and a Markdown alternate; `noindex` the print page; and
 * publish each page's Markdown source beside it.
 *
 * @param dist the output directory holding `guide/`.
 * @returns the site-relative URLs of the indexable guide pages.
 */
export function postprocessGuide(dist) {
    const guide = path.join(dist, "guide");
    const entries = new Map(guideTitles().map((x) => [`${x.file}.html`, x]));
    const urls = [];
    for (const file of walk(guide, (x) => x.endsWith(".html"))) {
        const rel = path.relative(guide, file).split(path.sep).join("/");
        let html = fs.readFileSync(file, "utf8");
        if (rel === "print.html" || rel === "404.html" || rel === "toc.html") {
            if (!html.includes('name="robots"')) {
                html = html.replace(
                    "</head>",
                    `    <meta name="robots" content="noindex" />\n    </head>`,
                );

                fs.writeFileSync(file, html);
            }

            continue;
        }

        const canonical = `/guide/${GUIDE_ALIASES.get(rel) ?? rel}`;
        if (!GUIDE_ALIASES.has(rel)) {
            urls.push(canonical);
        }

        if (html.includes('rel="canonical"')) {
            continue;
        }

        const entry = entries.get(
            rel === "index.html" ? "perspective.html" : rel,
        );
        const heading = entry ? guideHeading(entry) : BRAND;
        const title = `${heading} — ${GUIDE_SUFFIX}`;
        const description = pageDescription(html);
        const markdown = entry ? `/guide/${entry.file}.md` : null;
        const crumbs = entry && {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { name: BRAND, item: `${SITE}/` },
                { name: "Guide", item: `${SITE}/guide/index.html` },
                { name: entry.section },
                { name: entry.title, item: SITE + canonical },
            ].map((x, i) => ({ "@type": "ListItem", position: i + 1, ...x })),
        };

        const tags = [
            `<meta name="description" content="${escapeHtml(description)}" />`,
            `<link rel="canonical" href="${SITE}${canonical}" />`,
            `<meta property="og:type" content="article" />`,
            `<meta property="og:site_name" content="${BRAND}" />`,
            `<meta property="og:title" content="${escapeHtml(title)}" />`,
            `<meta property="og:description" content="${escapeHtml(description)}" />`,
            `<meta property="og:url" content="${SITE}${canonical}" />`,
            `<meta property="og:image" content="${SITE}/projects/light/collage.png" />`,
            `<meta name="twitter:card" content="summary_large_image" />`,
            markdown &&
                `<link rel="alternate" type="text/markdown" href="${markdown}" />`,
            crumbs && jsonLd(crumbs),
            rel === "FAQ.html" && jsonLd(faqJsonLd(html)),
        ].filter(Boolean);

        html = html
            .replace(
                /<title>[\s\S]*?<\/title>/,
                `<title>${escapeHtml(title)}</title>`,
            )
            .replace(/<meta name="description" content="[^"]*"\s*\/?>\s*/, "")
            .replace("</head>", `    ${tags.join("\n        ")}\n    </head>`);

        fs.writeFileSync(file, html);
    }

    for (const file of walk(GUIDE_SRC, (x) => x.endsWith(".md"))) {
        const rel = path.relative(GUIDE_SRC, file);
        if (rel === "SUMMARY.md") {
            continue;
        }

        const out = path.join(guide, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, expandIncludes(file));
    }

    return urls;
}

function expandIncludes(file) {
    return fs
        .readFileSync(file, "utf8")
        .replace(/\{\{#include (.+?)\}\}/g, (_, target) =>
            fs.readFileSync(path.resolve(path.dirname(file), target), "utf8"),
        );
}

/**
 * Write `llms.txt`, an annotated index of the guide, and `llms-full.txt`,
 * the whole guide as one Markdown document.
 *
 * @param dist the output directory.
 */
export function writeLlms(dist) {
    const entries = guideTitles();
    const index = [`# ${BRAND}`, "", `> ${SENTENCE}`, ""];
    index.push(
        "Perspective is Apache-2.0 licensed and a member project of the OpenJS Foundation. " +
            "npm packages are published under `@perspective-dev/*` (formerly `@finos/perspective*`); " +
            "the Python package is `perspective-python`; the Rust crate is `perspective`.",
        "",
    );

    let section = null;
    for (const entry of entries) {
        if (entry.section !== section) {
            section = entry.section;
            index.push("", `## ${section}`, "");
        }

        index.push(`- [${entry.title}](${SITE}/guide/${entry.file}.md)`);
    }

    index.push(
        "",
        "## Examples",
        "",
        `- [Example gallery](${SITE}/gallery/index.html): live examples, each with its full viewer configuration as JSON`,
        "",
        "## Optional",
        "",
        `- [Full guide as one document](${SITE}/llms-full.txt)`,
        `- [Source code](${REPO})`,
        `- [Changelog](${REPO}/blob/master/CHANGELOG.md)`,
        "",
    );

    fs.writeFileSync(path.join(dist, "llms.txt"), index.join("\n"));
    const full = entries.map((entry) => {
        const file = path.join(GUIDE_SRC, `${entry.file}.md`);
        return fs.existsSync(file) ? expandIncludes(file) : "";
    });

    fs.writeFileSync(
        path.join(dist, "llms-full.txt"),
        [`# ${BRAND}`, "", `> ${SENTENCE}`, "", ...full].join("\n\n"),
    );
}

/**
 * Write `robots.txt` and `sitemap.xml`.
 *
 * @param dist the output directory.
 * @param urls the site-relative URLs to list.
 */
export function writeCrawlFiles(dist, urls) {
    const agents = ["*", ...AI_CRAWLERS].map(
        (agent) =>
            `User-agent: ${agent}\nAllow: /\nDisallow: /guide/print.html\n`,
    );

    fs.writeFileSync(
        path.join(dist, "robots.txt"),
        `${agents.join("\n")}\nSitemap: ${SITE}/sitemap.xml\n`,
    );

    const today = new Date().toISOString().slice(0, 10);
    const rows = [...new Set(urls)].map(
        (url) =>
            `  <url><loc>${escapeHtml(SITE + url)}</loc><lastmod>${today}</lastmod></url>`,
    );

    fs.writeFileSync(
        path.join(dist, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
            `${rows.join("\n")}\n</urlset>\n`,
    );
}
