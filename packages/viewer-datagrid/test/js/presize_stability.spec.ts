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

import { expect, test } from "@perspective-dev/test";

async function goto_ready(page: any) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

test.describe("Datagrid presize label-bar stability", () => {
    test("a staged presize does not repaint mounted label-bar cells before commit", async ({
        page,
    }) => {
        await goto_ready(page);
        const result = await page.evaluate(async () => {
            const snapshot_all = (rt: HTMLElement) =>
                Array.from(rt.querySelectorAll("tbody tr")).map((tr) =>
                    Array.from(tr.children)
                        .filter((c) => c.tagName === "TD")
                        .map(
                            (td) =>
                                td.getAttribute("data-psp-label") ??
                                td
                                    .querySelector("div.psp-bar")
                                    ?.getAttribute("style")
                                    ?.match(/--label:\s*"([^"]*)"/)?.[1] ??
                                "",
                        )
                        .join("|"),
                );

            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                columns: ["Sales", "Profit"],
                sort: [["Row ID", "asc"]],
                columns_config: {
                    Sales: { number_fg_mode: "label-bar", fg_gradient: 1000 },
                    Profit: { number_fg_mode: "label-bar", fg_gradient: 100 },
                },
            });

            await viewer.flush();
            await new Promise((x) => setTimeout(x, 500));

            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const rt = datagrid.regular_table;
            const before = snapshot_all(rt);
            const rect = datagrid.getBoundingClientRect();
            const commit = await datagrid.presize(
                rect.width,
                rect.height + 200,
            );

            const staged = snapshot_all(rt);
            if (typeof commit === "function") {
                commit();
            }

            const after = snapshot_all(rt);
            return {
                before,
                staged,
                after,
                committed: typeof commit === "function",
            };
        });

        expect(result.committed).toEqual(true);
        expect(result.before.length).toBeGreaterThan(2);
        expect(result.before[0]).toMatch(/\d/);
        expect(result.staged).toEqual(result.before);
        expect(result.after.slice(0, result.before.length)).toEqual(
            result.before,
        );

        expect(result.after.length).toBeGreaterThan(result.before.length);
        for (const row of result.after) {
            expect(row).toMatch(/\d/);
        }
    });
});
