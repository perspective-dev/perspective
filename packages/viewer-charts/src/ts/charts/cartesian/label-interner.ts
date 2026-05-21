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

/**
 * Slot-indexed string store for the scatter "Label" column. Strings
 * are deduplicated across split-by facets so identical labels share a
 * dictionary entry; the per-slot `Int32Array` then holds dictionary
 * indices (`-1` means "no label for this slot").
 */
export class LabelInterner {
    readonly data: Int32Array;
    readonly dictionary: string[] = [];
    private readonly dictMap: Map<string, number> = new Map();

    constructor(capacity: number) {
        this.data = new Int32Array(capacity);
        this.data.fill(-1);
    }

    /**
     * Insert (or look up) `label` and write its dictionary index into
     * the slot at `flatIdx`. Returns the assigned dictionary index.
     */
    set(flatIdx: number, label: string): number {
        let mapped = this.dictMap.get(label);
        if (mapped === undefined) {
            mapped = this.dictionary.length;
            this.dictionary.push(label);
            this.dictMap.set(label, mapped);
        }

        this.data[flatIdx] = mapped;
        return mapped;
    }

    /**
     * Resolve a slot's label string, or `null` if unset.
     */
    get(flatIdx: number): string | null {
        const idx = this.data[flatIdx];
        if (idx < 0) {
            return null;
        }

        return this.dictionary[idx];
    }
}
