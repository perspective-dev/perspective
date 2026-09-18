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
import type { Page } from "@playwright/test";

const TABLE = "split-by-format";

const COLUMNS_CONFIG = {
    dt: {
        date_format: {
            format: "custom",
            timeZone: "UTC",
            second: "disabled",
            minute: "disabled",
            hour: "disabled",
        },
    },
    i: {
        number_format: {
            minimumFractionDigits: 1,
        },
    },
};

async function setup(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async (name) => {
        const worker = (window as any).__TEST_WORKER__;
        const table = await worker.table(
            {
                dt: "datetime",
                d: "date",
                i: "integer",
                v: "float",
                w: "float",
            },
            { name },
        );

        await table.update({
            dt: [
                Date.UTC(2024, 0, 15, 9, 0),
                Date.UTC(2024, 0, 15, 17, 30),
                Date.UTC(2024, 6, 1, 12, 0),
            ],
            d: ["2024-01-15", "2024-01-15", "2024-07-01"],
            i: [5, 1234567, 5],
            v: [1, 2, 3],
            w: [4, 5, 6],
        });
    }, TABLE);
}

async function restore(page: Page, config: Record<string, unknown>) {
    await page.evaluate(
        async ({ name, config }) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({
                table: name,
                plugin: "Datagrid",
                group_by: [],
                split_by: [],
                columns: ["v"],
                ...config,
            });

            await viewer.flush();
        },
        { name: TABLE, config },
    );
}

async function read_split_headers(
    page: Page,
): Promise<{ text: string; colspan: number }[]> {
    return await page.evaluate(() => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        )! as any;

        const table = datagrid.shadowRoot.querySelector("regular-table");
        return (
            Array.from(
                table.querySelectorAll("thead tr:first-child th"),
            ) as any[]
        )
            .filter((th) => {
                const meta = table.getMeta(th);
                return meta?.type === "column_header";
            })
            .map((th) => ({
                text: th.textContent.trim(),
                colspan: th.colSpan,
            }));
    });
}

async function read_row_labels(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        )! as any;

        return (
            Array.from(
                datagrid.shadowRoot.querySelectorAll(
                    "regular-table tbody th.psp-tree-leaf",
                ),
            ) as any[]
        ).map((th) => th.textContent.trim());
    });
}

async function configure(page: Page, column: string) {
    await restore(page, {
        columns: [column, "v"],
        columns_config: COLUMNS_CONFIG,
    });
}

async function split_matches_group_by(page: Page, column: string) {
    await configure(page, column);
    await restore(page, { group_by: [column], columns: ["v"] });
    const labels = await read_row_labels(page);
    await restore(page, { split_by: [column], columns: ["v"] });
    const headers = await read_split_headers(page);
    return { labels, headers: headers.map((x) => x.text) };
}

test.describe("split_by header formatting", () => {
    test("datetime split_by headers use the column's date_format", async ({
        page,
    }) => {
        await setup(page);
        const { labels, headers } = await split_matches_group_by(page, "dt");
        expect(labels.length).toBe(3);
        expect(headers).toEqual(labels);
        for (const header of headers) {
            expect(header).not.toContain(":");
        }
    });

    test("date split_by headers use the date formatter", async ({ page }) => {
        await setup(page);
        const { labels, headers } = await split_matches_group_by(page, "d");
        expect(labels.length).toBe(2);
        expect(headers).toEqual(labels);
        expect(headers).not.toContain("2024-01-15");
    });

    test("integer split_by headers use the column's number_format", async ({
        page,
    }) => {
        await setup(page);
        const { labels, headers } = await split_matches_group_by(page, "i");
        expect(labels.length).toBe(2);
        expect(headers).toEqual(labels);
        expect(headers).not.toContain("1234567");
    });

    test("groups that format identically stay separate header cells", async ({
        page,
    }) => {
        await setup(page);
        await configure(page, "dt");
        await restore(page, { split_by: ["dt"], columns: ["v", "w"] });

        const headers = await read_split_headers(page);
        expect(headers.map((x) => x.colspan)).toEqual([2, 2, 2]);
        expect(headers[0].text).toEqual(headers[1].text);
        expect(headers[1].text).not.toEqual(headers[2].text);
    });
});
