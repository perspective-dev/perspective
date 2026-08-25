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

import { errorText, escape, html, query } from "./dom.js";

const PREVIEW_ROWS = 1000;

export interface SqlEntry {
    /** Append a success line. */
    ok(text: string): void;

    /** Append an error line. */
    error(text: string): void;

    /** Append a placeholder line, returning its remover. */
    pending(text: string): () => void;

    /** Append a bounded preview grid of an Arrow result. */
    preview(result: any): void;

    /**
     * Append a labelled button whose handler renames it on success.
     *
     * @param text a leading caption, or the empty string for none.
     * @param label the button's text.
     * @param run the click handler, resolving to the button's new text.
     */
    action(text: string, label: string, run: () => Promise<string>): void;
}

export interface SqlScrollback {
    /** Open a new block, echoing `sql` unless it is empty. */
    entry(sql: string): SqlEntry;

    scrollToEnd(): void;
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) {
        return "NULL";
    }

    return String(value);
}

function previewMarkup(result: any, shown: number): string {
    const fields = result.schema.fields as { name: string }[];
    const head = fields.map((f) => `<th>${escape(f.name)}</th>`).join("");
    const body = result
        .slice(0, shown)
        .toArray()
        .map((row: any) => {
            const json = row.toJSON();
            const cells = fields
                .map((f) => `<td>${escape(formatCell(json[f.name]))}</td>`)
                .join("");

            return `<tr>${cells}</tr>`;
        })
        .join("");

    return `<div class="sqldrawer__grid">
        <table>
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
        </table>
    </div>`;
}

function newEntry(root: HTMLElement, sql: string): SqlEntry {
    const block = html(`<div class="sqldrawer__entry">
        ${sql ? `<div class="sqldrawer__query"></div>` : ""}
    </div>`);

    if (sql) {
        query(block, ".sqldrawer__query").textContent = sql;
    }

    root.appendChild(block);

    function line(cls: string, text: string): HTMLElement {
        const el = html(`<div class="${cls}"></div>`);
        el.textContent = text;
        block.appendChild(el);
        return el;
    }

    return {
        ok(text) {
            line("sqldrawer__ok", text);
        },

        error(text) {
            line("sqldrawer__error", text);
        },

        pending(text) {
            const el = line("sqldrawer__ok", text);
            return () => el.remove();
        },

        preview(result) {
            const total = result.numRows as number;
            const shown = Math.min(total, PREVIEW_ROWS);
            block.appendChild(html(previewMarkup(result, shown)));
            if (total > shown) {
                line(
                    "sqldrawer__ok",
                    `… ${(total - shown).toLocaleString()} more rows not ` +
                        `shown — open as a panel to explore all of them.`,
                );
            }
        },

        action(text, label, run) {
            const actions = html(`<div class="sqldrawer__actions">
                ${text ? `<span class="sqldrawer__ok">${escape(text)}</span>` : ""}
                <button type="button" class="btn">${escape(label)}</button>
            </div>`);

            const button = query<HTMLButtonElement>(actions, "button");
            button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                    button.textContent = await run();
                } catch (err) {
                    button.disabled = false;
                    line("sqldrawer__error", errorText(err));
                }
            });

            block.appendChild(actions);
        },
    };
}

/**
 * The drawer's result log.
 *
 * @param root the scrolling container entries are appended to.
 */
export function newScrollback(root: HTMLElement): SqlScrollback {
    return {
        entry: (sql: string) => newEntry(root, sql),
        scrollToEnd() {
            root.scrollTop = root.scrollHeight;
        },
    };
}
