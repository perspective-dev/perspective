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
import perspective from "./perspective_client";

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const DISK_ROOT = path.join(os.tmpdir(), `perspective-${process.pid}`);

function disk_file_count() {
    const out = [];
    const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) walk(p);
            else out.push(p);
        }
    };
    try {
        walk(DISK_ROOT);
    } catch (e) {
        /* root not created yet */
    }
    return out.length;
}

const data = {
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [1.5, 2.5, 3.5, 4.5],
};

test.describe("page_to_disk", function () {
    test("produces results identical to an in-memory table", async function () {
        const mem = await perspective.table(data);
        const disk = await perspective.table(data, { page_to_disk: true });
        const vm = await mem.view();
        const vd = await disk.view();
        expect(await vd.to_columns()).toEqual(await vm.to_columns());
        expect(await disk.schema()).toEqual(await mem.schema());
        expect(await disk.size()).toEqual(await mem.size());
        await vm.delete();
        await vd.delete();
        await mem.delete();
        await disk.delete();
    });

    test("a small page_to_disk table stays in-heap (no files spilled)", async function () {
        const before = disk_file_count();
        const disk = await perspective.table(data, { page_to_disk: true });
        const view = await disk.view();
        await view.to_columns();
        expect(disk_file_count()).toEqual(before);
        await view.delete();
        await disk.delete();
    });

    test("supports update + aggregates", async function () {
        const disk = await perspective.table(data, { page_to_disk: true });
        await disk.update({ x: [5, 6], y: ["e", "f"], z: [5.5, 6.5] });
        const view = await disk.view({
            group_by: ["y"],
            aggregates: { z: "sum" },
            columns: ["z"],
        });
        const cols = await view.to_columns();
        expect(cols.z[0]).toEqual(1.5 + 2.5 + 3.5 + 4.5 + 5.5 + 6.5);
        await view.delete();
        await disk.delete();
    });

    test("supports expression columns", async function () {
        const disk = await perspective.table(data, { page_to_disk: true });
        const view = await disk.view({
            columns: ["w"],
            expressions: { w: `"x" + "z"` },
        });
        const cols = await view.to_columns();
        expect(cols.w).toEqual([2.5, 4.5, 6.5, 8.5]);
        await view.delete();
        await disk.delete();
    });

    // Forces actual eviction (table > 1gb resident) so the `node:fs` bridge
    // round-trips: columns are flushed to disk on eviction and re-read on access.
    test("evicts to disk over budget and restores correctly", async function () {
        const ROWS = 100_000;
        const COLS = 256;
        const UPDATES = 5; // 25M rows total
        const chunk = {};
        for (let c = 0; c < COLS; c++) {
            const col = new Array(ROWS);
            for (let i = 0; i < ROWS; i++) col[i] = c * 1000 + (i % 1000) + 0.5;
            chunk["c" + c] = col;
        }

        const before = disk_file_count();
        const table = await perspective.table(chunk, { page_to_disk: true });
        for (let u = 1; u < UPDATES; u++) await table.update(chunk);

        expect(await table.size()).toEqual(ROWS * UPDATES);

        // Eviction must have spilled column buffers to disk.
        expect(disk_file_count()).toBeGreaterThan(before);

        // Reading after eviction restores evicted columns from disk. Verify the
        // head of every column matches the source (a broken restore would read
        // zeros). `c[c][i] === c*1000 + i + 0.5` for i < 1000.
        const view = await table.view();
        const head = await view.to_columns({ start_row: 0, end_row: 4 });
        for (let c = 0; c < COLS; c++) {
            expect(head["c" + c]).toEqual([
                c * 1000 + 0.5,
                c * 1000 + 1.5,
                c * 1000 + 2.5,
                c * 1000 + 3.5,
            ]);
        }

        await view.delete();
        await table.delete();
        expect(disk_file_count()).toEqual(before);
    });
});
