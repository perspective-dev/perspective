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

import { test } from "@perspective-dev/test";
import { compareContentsToSnapshot } from "@perspective-dev/test";
import type { Page } from "@playwright/test";
import * as prettier from "prettier";

async function getDatagridContents(page: Page): Promise<string> {
    const raw = await page.evaluate(async () => {
        const datagrid = document.querySelector(
            "perspective-viewer perspective-viewer-datagrid",
        ) as any;
        if (!datagrid) {
            return "MISSING DATAGRID";
        }

        const regularTable = datagrid.shadowRoot.querySelector("regular-table");
        return regularTable?.innerHTML || "";
    });

    return await prettier.format(raw, {
        parser: "html",
    });
}

async function getScrollState(page: Page) {
    return await page.evaluate(async () => {
        const datagrid = document.querySelector(
            "perspective-viewer perspective-viewer-datagrid",
        ) as any;
        const regularTable = datagrid.shadowRoot.querySelector("regular-table");
        return {
            scrollTop: regularTable.scrollTop,
            scrollLeft: regularTable.scrollLeft,
            scrollHeight: regularTable.scrollHeight,
            scrollWidth: regularTable.scrollWidth,
            clientHeight: regularTable.clientHeight,
            clientWidth: regularTable.clientWidth,
        };
    });
}

async function getVisibleCellData(page: Page) {
    return await page.evaluate(async () => {
        const datagrid = document.querySelector(
            "perspective-viewer perspective-viewer-datagrid",
        ) as any;
        const regularTable = datagrid.shadowRoot.querySelector("regular-table");
        const tbody = regularTable.querySelector("table tbody");
        const thead = regularTable.querySelector("table thead");

        const headerCells = Array.from(
            thead.querySelectorAll("tr:last-child th"),
        ).map((th: any) => th.textContent.trim());

        const firstRow = tbody.querySelector("tr");
        const firstRowCells = firstRow
            ? Array.from(firstRow.querySelectorAll("td")).map((td: any) =>
                  td.textContent.trim(),
              )
            : [];

        const lastRow = tbody.querySelector("tr:last-child");
        const lastRowCells = lastRow
            ? Array.from(lastRow.querySelectorAll("td")).map((td: any) =>
                  td.textContent.trim(),
              )
            : [];

        return {
            headerCells,
            firstRowCells,
            lastRowCells,
            rowCount: tbody.querySelectorAll("tr").length,
        };
    });
}

test.describe("Datagrid scroll tests with superstore data", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                plugin: "Datagrid",
            });
        });
    });

    test.describe("Vertical scroll", () => {
        test("Scrolling down updates visible rows", async ({ page }) => {
            const initialData = await getVisibleCellData(page);

            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");

                regularTable.scrollTop = 1000;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrolledData = await getVisibleCellData(page);
            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollTop).toBe(1000);
            test.expect(scrolledData.firstRowCells).not.toEqual(
                initialData.firstRowCells,
            );
        });

        test("Scrolling to bottom shows last rows", async ({ page }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop =
                    regularTable.scrollHeight - regularTable.clientHeight;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollTop).toBeGreaterThan(0);
            test.expect(
                scrollState.scrollTop + scrollState.clientHeight,
            ).toBeGreaterThanOrEqual(scrollState.scrollHeight - 1);

            await compareContentsToSnapshot(await getDatagridContents(page));
        });

        test("Vertical scroll position is preserved after flush", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop = 500;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollStateAfterFlush = await getScrollState(page);
            test.expect(scrollStateAfterFlush.scrollTop).toBe(500);
        });
    });

    test.describe("Horizontal scroll", () => {
        test("Scrolling right updates visible columns", async ({ page }) => {
            const initialData = await getVisibleCellData(page);

            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollLeft = 450;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrolledData = await getVisibleCellData(page);
            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollLeft).toBe(450);
            test.expect(scrolledData.headerCells).not.toEqual(
                initialData.headerCells,
            );
        });

        test("Scrolling to rightmost edge shows last columns", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");

                // Dimensions change as new columns are rendered
                for (let i = 0; i < 3; i++) {
                    regularTable.scrollLeft =
                        regularTable.scrollWidth - regularTable.clientWidth;
                    await regularTable.draw();
                }
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollLeft).toBeGreaterThan(0);
            test.expect(
                scrollState.scrollLeft + scrollState.clientWidth,
            ).toBeGreaterThanOrEqual(scrollState.scrollWidth - 1);

            await compareContentsToSnapshot(await getDatagridContents(page));
        });

        test("Horizontal scroll position is preserved after flush", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollLeft = 300;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollStateAfterFlush = await getScrollState(page);
            test.expect(scrollStateAfterFlush.scrollLeft).toBe(300);
        });
    });

    test.describe("Combined scroll", () => {
        test("Scrolling both vertically and horizontally updates viewport", async ({
            page,
        }) => {
            const initialData = await getVisibleCellData(page);

            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop = 800;
                regularTable.scrollLeft = 400;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrolledData = await getVisibleCellData(page);
            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollTop).toBe(800);
            test.expect(scrollState.scrollLeft).toBe(400);
            test.expect(scrolledData.firstRowCells).not.toEqual(
                initialData.firstRowCells,
            );
            test.expect(scrolledData.headerCells).not.toEqual(
                initialData.headerCells,
            );

            await compareContentsToSnapshot(await getDatagridContents(page));
        });

        test("Scroll to bottom-right corner", async ({ page }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop =
                    regularTable.scrollHeight - regularTable.clientHeight;
                regularTable.scrollLeft =
                    regularTable.scrollWidth - regularTable.clientWidth;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollTop).toBeGreaterThan(0);
            test.expect(scrollState.scrollLeft).toBeGreaterThan(0);

            await compareContentsToSnapshot(await getDatagridContents(page));
        });
    });

    test.describe("Scroll with grouped data", () => {
        test("Vertical scroll with group_by preserves tree structure", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.restore({
                    plugin: "Datagrid",
                    group_by: ["State", "City"],
                    columns: ["Sales", "Quantity", "Profit"],
                });
            });

            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop = 500;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            await compareContentsToSnapshot(await getDatagridContents(page));
        });

        test("Horizontal scroll with split_by shows correct column groups", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.restore({
                    plugin: "Datagrid",
                    split_by: ["Ship Mode"],
                    columns: ["Sales", "Quantity", "Profit"],
                });
            });

            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollLeft = 300;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            await compareContentsToSnapshot(await getDatagridContents(page));
        });
    });

    test.describe("Scroll state after operations", () => {
        test("Scroll position resets only horizontally after changing columns", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop = 500;
                regularTable.scrollLeft = 300;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.restore({
                    columns: ["State", "City"],
                });
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollTop).toBe(500);
            test.expect(scrollState.scrollLeft).toBe(0);
        });

        test("Scroll position resets after applying filter", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const regularTable =
                    datagrid.shadowRoot.querySelector("regular-table");
                regularTable.scrollTop = 500;
                await regularTable.draw();
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.restore({
                    filter: [["State", "==", "California"]],
                });
            });

            await page.evaluate(async () => {
                await document.querySelector("perspective-viewer")!.flush();
            });

            const scrollState = await getScrollState(page);

            test.expect(scrollState.scrollTop).toBe(0);
        });
    });
});
