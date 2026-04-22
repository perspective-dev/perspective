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

import type { ColumnDataMap } from "./view-reader";

export interface SplitGroup {
    /** Composite prefix (e.g., "East", "East|Enterprise" for multi-level). */
    prefix: string;
    /** Map of base column name → full Arrow column name ("prefix|base"). */
    colNames: Map<string, string>;
}

/**
 * Group Arrow column names by their split prefix (everything before the
 * last "|"). A split exists for a prefix only when every `requiredBases`
 * entry has a non-empty column present for that prefix. `optionalBases`
 * are included when present but do not gate group inclusion.
 *
 * Empty/falsy entries in either base list are skipped.
 */
export function buildSplitGroups(
    columns: ColumnDataMap,
    requiredBases: string[],
    optionalBases: string[] = [],
): SplitGroup[] {
    const prefixCols = new Map<string, Set<string>>();
    for (const key of columns.keys()) {
        if (key.startsWith("__")) continue;
        const pipeIdx = key.lastIndexOf("|");
        if (pipeIdx === -1) continue;
        const prefix = key.substring(0, pipeIdx);
        if (!prefixCols.has(prefix)) prefixCols.set(prefix, new Set());
        prefixCols.get(prefix)!.add(key);
    }

    const out: SplitGroup[] = [];
    for (const [prefix, keys] of prefixCols) {
        const resolved = new Map<string, string>();
        let ok = true;
        for (const base of requiredBases) {
            if (!base) continue;
            const full = `${prefix}|${base}`;
            const col = columns.get(full);
            if (!keys.has(full) || !col?.values) {
                ok = false;
                break;
            }
            resolved.set(base, full);
        }
        if (!ok) continue;

        for (const base of optionalBases) {
            if (!base) continue;
            const full = `${prefix}|${base}`;
            if (keys.has(full) && columns.get(full)?.values) {
                resolved.set(base, full);
            }
        }
        out.push({ prefix, colNames: resolved });
    }
    return out;
}
