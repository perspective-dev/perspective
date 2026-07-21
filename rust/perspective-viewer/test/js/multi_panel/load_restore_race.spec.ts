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

// Regression spec for the `load()` → immediate `restore()` lost-update race

import { test, expect } from "../helpers.ts";

const TABLE = "load-viewer-csv";
const COLUMNS = ["Quantity", "Postal Code"];
const VIEWER_COUNT = 20;

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

for (const plugin of ["Datagrid", "Debug"]) {
    test(`load + immediate restore holds \`columns\` across ${VIEWER_COUNT} viewers (${plugin})`, async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const results = await page.evaluate(
            async ({ tableName, columns, plugin, count }) => {
                const worker = (window as any).__TEST_WORKER__;
                const out: {
                    i: number;
                    immediate: string[];
                    settled: string[];
                }[] = [];
                const viewers: any[] = [];
                for (let i = 0; i < count; i++) {
                    const table = await worker.open_table(tableName);
                    const v = document.createElement(
                        "perspective-viewer",
                    ) as any;
                    document.body.appendChild(v);
                    viewers.push(v);
                    await v.load(table);
                    await v.restore({ plugin, columns });
                    out.push({
                        i,
                        immediate: (await v.save()).columns,
                        settled: [],
                    });
                }

                // A late clobber (post-resolution async work) surfaces only
                // after settle; re-read every viewer.
                await new Promise((x) => setTimeout(x, 200));
                for (let i = 0; i < count; i++) {
                    out[i].settled = (await viewers[i].save()).columns;
                }

                return out;
            },
            { tableName: TABLE, columns: COLUMNS, plugin, count: VIEWER_COUNT },
        );

        for (const { i, immediate, settled } of results) {
            expect
                .soft(immediate, `viewer ${i} immediately after restore`)
                .toEqual(COLUMNS);
            expect
                .soft(settled, `viewer ${i} after 200ms settle`)
                .toEqual(COLUMNS);
        }
    });
}

test("public mutators are render-quiescent at resolution (I6)", async ({
    page,
}) => {
    test.setTimeout(120_000);
    const violations = await page.evaluate(
        async ({ tableName }) => {
            const worker = (window as any).__TEST_WORKER__;
            const table = await worker.open_table(tableName);
            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            const violations: string[] = [];

            const raf = () =>
                new Promise((x) => requestAnimationFrame(() => x(undefined)));

            const canon = (x: any): any =>
                Array.isArray(x)
                    ? x.map(canon)
                    : x && typeof x === "object"
                      ? Object.fromEntries(
                            Object.keys(x)
                                .sort()
                                .map((k) => [k, canon(x[k])]),
                        )
                      : x;

            const quiesce = async (tag: string, task: () => Promise<any>) => {
                await task();
                const before = JSON.stringify(canon(await v.save()));
                await raf();
                await raf();
                await v.flush();
                const after = JSON.stringify(canon(await v.save()));
                if (before !== after) {
                    violations.push(`${tag}: config changed after resolution`);
                }
            };

            await quiesce("load", () => v.load(table));
            await quiesce("restore", () =>
                v.restore({ plugin: "Datagrid", columns: ["Sales"] }),
            );
            await quiesce("reset", () => v.reset());
            await quiesce("restore", () =>
                v.restore({ columns: ["Profit", "Sales"] }),
            );
            await quiesce("reset", () => v.reset());
            await quiesce("resize", () => v.resize());
            await quiesce("restyleElement", () => v.restyleElement());
            await quiesce("toggleConfig(open)", () => v.toggleConfig(true));
            await quiesce("toggleConfig(close)", () => v.toggleConfig(false));

            // Panel lifecycle: addPanel/setActivePanel/removePanel now return
            // promises that resolve at render completion.
            const id = await quiesce("addPanel", () =>
                v.addPanel({ table: tableName, columns: ["Sales"] }),
            );
            void id;
            const names = await v.getPanelNames();
            await quiesce("setActivePanel", () => v.setActivePanel(names[0]));
            await quiesce("removePanel", () =>
                v.removePanel(names[names.length - 1]),
            );

            return violations;
        },
        { tableName: TABLE },
    );

    expect(violations).toEqual([]);
});
