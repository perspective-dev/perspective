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

import { test, expect } from "@perspective-dev/test";
import { describeDuckDB } from "./setup.js";

/**
 * Arrow validity-bitmap test — bit `i` of the LSB-ordered bitfield.
 */
function isValid(validity, i) {
    return !validity || !!((validity[i >> 3] >> i % 8) & 1);
}

describeDuckDB("typed_arrays", (getClient) => {
    test("invalid slots read 0, never NaN, in a sparse split_by pivot", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region", "City"],
            split_by: ["Category"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        let invalidSlots = 0;
        let checkedCols = 0;
        await view.with_typed_arrays(
            {},
            (names, values, validities, dictionaries) => {
                for (let c = 0; c < names.length; c++) {
                    if (names[c].startsWith("__") || dictionaries[c]) {
                        continue;
                    }

                    checkedCols++;
                    const vals = values[c];
                    const validity = validities[c];
                    for (let i = 0; i < vals.length; i++) {
                        expect(Number.isNaN(vals[i])).toBe(false);
                        if (!isValid(validity, i)) {
                            invalidSlots++;
                            expect(vals[i]).toBe(0);
                        }
                    }
                }
            },
        );

        expect(checkedCols).toBe(3);
        expect(invalidSlots).toBeGreaterThan(0);
        await view.delete();
    });

    test("invalid dictionary keys are clamped in-bounds", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region", "City"],
            aggregates: { Sales: "sum" },
        });

        await view.with_typed_arrays(
            {},
            (names, values, validities, dictionaries) => {
                for (let c = 0; c < names.length; c++) {
                    const dict = dictionaries[c];
                    if (!dict) {
                        continue;
                    }

                    const keys = values[c];
                    for (let i = 0; i < keys.length; i++) {
                        expect(keys[i]).toBeGreaterThanOrEqual(0);
                        expect(keys[i]).toBeLessThan(dict.length);
                    }
                }
            },
        );

        await view.delete();
    });
});
