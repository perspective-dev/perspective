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

// Window-function streaming benchmark (WINDOW_FUNCTIONS_PLAN Phase 4):
// sustained tail-append and mid-edit throughput with k active window
// columns vs. a windowless baseline view on the same stream. Run manually:
//
//     pnpm run --filter @perspective-dev/bench bench_windows

import perspective from "@perspective-dev/client";

const SCHEMA = {
    id: "integer",
    sym: "string",
    t: "integer",
    price: "float",
};

const SYMS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const BATCH = 1_000;
const BATCHES = 200;
const EDIT_BATCHES = 50;

function window_specs(k) {
    const all = [
        ["w_cumsum", { aggregate: "sum", cumulative: true }],
        ["w_sma", { aggregate: "avg", rows: 20 }],
        ["w_ema", { aggregate: "ema", alpha: 0.1 }],
        ["w_rsum", { aggregate: "sum", range: 100 }],
        ["w_min", { aggregate: "min", rows: 50 }],
        ["w_std", { aggregate: "stddev", rows: 20 }],
    ];

    return Object.fromEntries(
        all.slice(0, k).map(([name, w]) => [
            name,
            {
                column: "price",
                order_by: ["t", "asc"],
                partition_by: ["sym"],
                ...w,
            },
        ])
    );
}

function batch(start, mutate) {
    const rows = new Array(BATCH);
    for (let i = 0; i < BATCH; i++) {
        const id = mutate ? Math.floor(Math.random() * start) : start + i;
        rows[i] = {
            id,
            sym: SYMS[id % SYMS.length],
            t: mutate ? Math.floor(Math.random() * start) : start + i,
            price: Math.random() * 100,
        };
    }

    return rows;
}

async function scenario(k) {
    const table = await perspective.table(SCHEMA, { index: "id" });
    const windows = window_specs(k);
    const window_names = Object.keys(windows);
    const view = await table.view(
        window_names.length > 0
            ? { columns: ["id", ...window_names], windows }
            : {}
    );

    // tail appends
    let t0 = performance.now();
    for (let b = 0; b < BATCHES; b++) {
        await table.update(batch(b * BATCH, false));
    }
    await view.num_rows();
    const append_ms = performance.now() - t0;

    // random mid-edits over the accumulated history
    const size = BATCHES * BATCH;
    t0 = performance.now();
    for (let b = 0; b < EDIT_BATCHES; b++) {
        await table.update(batch(size, true));
    }
    await view.num_rows();
    const edit_ms = performance.now() - t0;

    await view.delete();
    await table.delete();
    return { append_ms, edit_ms };
}

const results = [];
for (const k of [0, 1, 3, 6]) {
    const { append_ms, edit_ms } = await scenario(k);
    results.push({
        windows: k,
        "append rows/s": Math.round((BATCHES * BATCH * 1000) / append_ms),
        "append ms": Math.round(append_ms),
        "edit rows/s": Math.round((EDIT_BATCHES * BATCH * 1000) / edit_ms),
        "edit ms": Math.round(edit_ms),
    });
    console.log(`k=${k} done`);
}

console.table(results);
