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

import { duckdb } from "../data/engines.js";
import { addSource, listSources, nextSourceId } from "../data/sources.js";
import { errorText, html, query, readLocalJson } from "./dom.js";
import { initSplitter } from "./splitter.js";
import { type SqlScrollback, newScrollback } from "./sql_scrollback.js";

const OPEN_KEY = "perspective-sql-open";
const HEIGHT_KEY = "perspective-sql-height";
const HISTORY_KEY = "perspective-sql-history";
const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 280;
const HISTORY_MAX = 100;

const TEMPLATE = `<section class="sqldrawer">
    <div
        class="sqldrawer__splitter"
        role="separator"
        aria-orientation="horizontal"
        tabindex="0"
    ></div>
    <div class="sqldrawer__header">
        <span>DuckDB SQL</span>
        <button
            type="button"
            class="sqldrawer__close"
            aria-label="Close SQL panel"
        >×</button>
    </div>
    <div class="sqldrawer__scrollback" aria-live="polite"></div>
    <form class="sqldrawer__input">
        <label class="sqldrawer__editor" data-value="">
            <textarea
                rows="1"
                spellcheck="false"
                aria-label="SQL query"
                placeholder="SELECT … — ⌘⏎ to run"
            ></textarea>
        </label>
        <button type="submit" class="btn btn--primary">Run</button>
    </form>
</section>`;

export interface SqlDrawerHandle {
    toggle(): void;
}

function newConnection(): () => Promise<{ duck: any; conn: any }> {
    let conn: any;
    return async () => {
        const duck = await duckdb();
        conn ??= await duck.db.connect();
        return { duck, conn };
    };
}

function autosize(editor: HTMLTextAreaElement) {
    (editor.parentElement as HTMLElement).dataset.value = editor.value;
}

function loadHistory(): string[] {
    const parsed = readLocalJson<string[]>(HISTORY_KEY);
    return Array.isArray(parsed) ? parsed : [];
}

function newHistory(editor: HTMLTextAreaElement): (text: string) => void {
    let entries = loadHistory();
    let index = entries.length;
    let draft = "";

    editor.addEventListener("keydown", (event: KeyboardEvent) => {
        const atStart =
            editor.selectionStart === 0 && editor.selectionEnd === 0;

        if (event.key === "ArrowUp" && atStart && index > 0) {
            if (index === entries.length) {
                draft = editor.value;
            }

            index -= 1;
            editor.value = entries[index];
            autosize(editor);
            event.preventDefault();
        } else if (
            event.key === "ArrowDown" &&
            editor.selectionStart === editor.value.length &&
            index < entries.length
        ) {
            index += 1;
            editor.value = index === entries.length ? draft : entries[index];
            autosize(editor);
            event.preventDefault();
        }
    });

    return (text: string) => {
        entries = [...entries.filter((h) => h !== text), text].slice(
            -HISTORY_MAX,
        );

        localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
        index = entries.length;
        draft = "";
    };
}

function newResizer(shell: HTMLElement, splitter: HTMLElement) {
    function height(): number {
        return Number(localStorage.getItem(HEIGHT_KEY) ?? DEFAULT_HEIGHT);
    }

    function apply(px: number) {
        const max = Math.max(MIN_HEIGHT, shell.clientHeight * 0.6);
        const clamped = Math.min(Math.max(px, MIN_HEIGHT), max);
        shell.style.setProperty("--sql-height", `${clamped}px`);
        localStorage.setItem(HEIGHT_KEY, String(clamped));
    }

    initSplitter(splitter, {
        toPx: (e) => shell.getBoundingClientRect().bottom - e.clientY,
        current: height,
        growKey: "ArrowUp",
        shrinkKey: "ArrowDown",
        apply,
    });

    apply(height());
}

function stripTrailingSemis(text: string): string {
    return text.replace(/[\s;]+$/g, "");
}

function nextResultId(): number {
    const taken = listSources()
        .map((s) => /^memory\.sql_result_(\d+)$/.exec(s.table)?.[1])
        .filter((n): n is string => !!n)
        .map(Number);

    return taken.length ? Math.max(...taken) + 1 : 1;
}

async function hostedNames(client: any): Promise<Set<string>> {
    try {
        return new Set(await client.get_hosted_table_names());
    } catch {
        return new Set();
    }
}

function createdTables(before: Set<string>, after: Set<string>): string[] {
    const registered = new Set(listSources().map((s) => s.table));
    return [...after].filter(
        (name) =>
            !before.has(name) &&
            !registered.has(name) &&
            name.startsWith("memory.") &&
            !/^memory\.(sql_result_|__sql_preview)/.test(name),
    );
}

function newRunner(
    viewer: any,
    scrollback: SqlScrollback,
    connection: () => Promise<{ duck: any; conn: any }>,
) {
    async function openAsPanel(sql: string): Promise<string> {
        const { duck, conn } = await connection();
        const name = `sql_result_${nextResultId()}`;
        await conn.query(
            `CREATE OR REPLACE TABLE memory.main."${name}" AS (\n${stripTrailingSemis(sql)}\n)`,
        );

        const table = duck.qualify(name);
        await viewer.addPanel({ table, title: name });
        addSource({
            id: nextSourceId(),
            engine: "duckdb-wasm",
            table,
            label: name,
            kind: "sql",
        });

        return `Opened as "${name}"`;
    }

    async function registerTable(table: string): Promise<string> {
        const label = table.replace(/^memory\./, "");
        await viewer.addPanel({ table, title: label });
        addSource({
            id: nextSourceId(),
            engine: "duckdb-wasm",
            table,
            label,
            kind: "sql",
        });

        return "Registered";
    }

    return async function run(sql: string) {
        const entry = scrollback.entry(sql);
        const done = entry.pending("Running…");
        try {
            const { duck, conn } = await connection();
            const before = await hostedNames(duck.client());
            const start = performance.now();
            const result = await conn.query(sql);
            const ms = Math.round(performance.now() - start);
            done();

            if (result.numRows > 0) {
                entry.ok(
                    `${result.numRows.toLocaleString()} row(s) in ${ms}ms`,
                );

                entry.preview(result);
                entry.action("", "Open as panel", () => openAsPanel(sql));
            } else {
                entry.ok(`OK in ${ms}ms`);
            }

            const after = await hostedNames(duck.client());
            for (const table of createdTables(before, after)) {
                entry.action(`Created ${table} — `, "Register as source", () =>
                    registerTable(table),
                );
            }

            return true;
        } catch (err) {
            done();
            entry.error(errorText(err));
            return false;
        } finally {
            scrollback.scrollToEnd();
        }
    };
}

/**
 * The DuckDB SQL drawer, an editor over the engine with inline results.
 *
 * @param shell the app shell the drawer overlays.
 * @param viewer the `perspective-viewer` results are opened into.
 */
export function initSqlDrawer(
    shell: HTMLElement,
    viewer: any,
): SqlDrawerHandle {
    const drawer = html(TEMPLATE);
    const editor = query<HTMLTextAreaElement>(drawer, "textarea");
    const form = query<HTMLFormElement>(drawer, "form");
    const submit = query<HTMLButtonElement>(drawer, "button[type=submit]");
    shell.appendChild(drawer);

    const scrollback = newScrollback(query(drawer, ".sqldrawer__scrollback"));
    const connection = newConnection();
    const record = newHistory(editor);
    const run = newRunner(viewer, scrollback, connection);
    newResizer(shell, query(drawer, ".sqldrawer__splitter"));

    let running = false;
    async function execute(text: string) {
        if (running || !text.trim()) {
            return;
        }

        running = true;
        submit.disabled = true;
        try {
            if (await run(text)) {
                record(text);
                editor.value = "";
                autosize(editor);
            }
        } finally {
            running = false;
            submit.disabled = false;
        }
    }

    function setOpen(open: boolean) {
        shell.dataset.sql = open ? "open" : "closed";
        localStorage.setItem(OPEN_KEY, String(open));
        if (!open) {
            return;
        }

        void connection().catch((err) => {
            scrollback
                .entry("")
                .error(`DuckDB engine failed to start: ${errorText(err)}`);
        });

        editor.focus();
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void execute(editor.value);
    });

    editor.addEventListener("input", () => autosize(editor));
    editor.addEventListener("keydown", (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void execute(editor.value);
        }
    });

    query(drawer, ".sqldrawer__close").addEventListener("click", () =>
        setOpen(false),
    );

    if (localStorage.getItem(OPEN_KEY) === "true") {
        setOpen(true);
    } else {
        shell.dataset.sql = "closed";
    }

    return {
        toggle() {
            setOpen(shell.dataset.sql !== "open");
        },
    };
}
