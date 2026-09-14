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

export type TextAlignment = "left" | "right" | "center";
export type VerticalAlignment = "top" | "middle" | "bottom";

/** The resolved alignment of one column's cells. */
export interface ColumnAlignment {
    text: TextAlignment;
    vertical: VerticalAlignment;
}

interface AlignmentRules {
    /** `text-align`, on the column's header and body cells alike. */
    text: CSSStyleRule;

    /** `vertical-align`, on the column's `tbody` cells only. */
    vertical: CSSStyleRule;
    last: ColumnAlignment;
}

interface AlignmentSheetState {
    table: Element | undefined;
    scope: string | undefined;
    sheet: CSSStyleSheet;
    rules: Map<number, AlignmentRules>;
}

const STATE: WeakMap<RegularTableElement, AlignmentSheetState> = new WeakMap();

const FLEX_PLACEMENT: Record<TextAlignment | VerticalAlignment, string> = {
    left: "flex-start",
    top: "flex-start",
    center: "center",
    middle: "center",
    right: "flex-end",
    bottom: "flex-end",
};

function text_declarations(align: ColumnAlignment): string {
    return (
        `text-align:${align.text};` +
        `--psp-label-justify:${FLEX_PLACEMENT[align.text]};` +
        `--psp-label-align:${FLEX_PLACEMENT[align.vertical]}`
    );
}

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
            const scope = state.scope;
            const index = state.sheet.cssRules.length;
            state.sheet.insertRule(
                `.${scope} td.rt-col-${size_key}, .${scope} th.rt-col-${size_key}{${text_declarations(align)}}`,
                index,
            );

            state.sheet.insertRule(
                `.${scope} tbody td.rt-col-${size_key}, .${scope} tbody th.rt-col-${size_key}{vertical-align:${align.vertical}}`,
                index + 1,
            );

            entry = {
                text: state.sheet.cssRules[index] as CSSStyleRule,
                vertical: state.sheet.cssRules[index + 1] as CSSStyleRule,
                last: align,
            };

            state.rules.set(size_key, entry);
        } else {
            if (entry.last.text !== align.text) {
                entry.text.style.textAlign = align.text;
                entry.text.style.setProperty(
                    "--psp-label-justify",
                    FLEX_PLACEMENT[align.text],
                );
            }

            if (entry.last.vertical !== align.vertical) {
                entry.vertical.style.verticalAlign = align.vertical;
                entry.text.style.setProperty(
                    "--psp-label-align",
                    FLEX_PLACEMENT[align.vertical],
                );
            }

            entry.last = align;
        }
    }
}
