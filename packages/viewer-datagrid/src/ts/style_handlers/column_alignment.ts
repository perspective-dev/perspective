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

import { RegularTableElement } from "regular-table";

export type ColumnAlignment = "left" | "right";

interface AlignmentSheetState {
    table: Element | undefined;
    scope: string | undefined;
    sheet: CSSStyleSheet;
    rules: Map<number, { rule: CSSStyleRule; last: ColumnAlignment }>;
}

const STATE: WeakMap<RegularTableElement, AlignmentSheetState> = new WeakMap();

/**
 * Column alignment via `regular-table`'s dedicated column classes
 * (`setDataListener()`'s `column_classes` option): one generated rule per
 * visible column `size_key` targeting `td.rt-col-{k}, th.rt-col-{k}`,
 * instead of a per-cell alignment class on every cell of every draw.
 */
export function sync_column_alignment(
    regularTable: RegularTableElement,
    wanted: Map<number, ColumnAlignment>,
): void {
    const root = regularTable.getRootNode() as {
        adoptedStyleSheets?: CSSStyleSheet[];
    };

    if (!root || !root.adoptedStyleSheets) {
        return;
    }

    let state = STATE.get(regularTable);
    if (!state) {
        state = {
            table: undefined,
            scope: undefined,
            sheet: new CSSStyleSheet(),
            rules: new Map(),
        };

        STATE.set(regularTable, state);
    }

    const table = regularTable.children[0];
    if (!table) {
        return;
    }

    if (state.table !== table) {
        state.table = table;
        state.scope = Array.from(table.classList).find((x) =>
            x.startsWith("rt-scope-"),
        );

        state.sheet.replaceSync("");
        state.rules.clear();
    }

    if (!state.scope) {
        return;
    }

    if (!root.adoptedStyleSheets.includes(state.sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, state.sheet];
    }

    for (const [size_key, align] of wanted) {
        let entry = state.rules.get(size_key);
        if (entry === undefined) {
            const index = state.sheet.cssRules.length;
            state.sheet.insertRule(
                `.${state.scope} td.rt-col-${size_key}, .${state.scope} th.rt-col-${size_key}{text-align:${align}}`,
                index,
            );

            entry = {
                rule: state.sheet.cssRules[index] as CSSStyleRule,
                last: align,
            };

            state.rules.set(size_key, entry);
        } else if (entry.last !== align) {
            entry.rule.style.textAlign = align;
            entry.last = align;
        }
    }
}
