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

import {
    test,
    expect,
    DEFAULT_CONFIG,
    compareContentsToSnapshot,
    getShadowContents,
} from "../helpers.ts";

const get_contents = getShadowContents;

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer").restore({
            plugin: "Debug",
        });
    });
});

test.describe("Filter Config", () => {
    test("not_in > renders filtered results correctly", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                group_by: ["State"],
                columns: ["Sales"],
                settings: true,
                filter: [
                    ["State", "not in", ["California", "Texas", "New York"]],
                ],
            });
        });

        const contents = await get_contents(page);

        await compareContentsToSnapshot(contents);
    });

    test("in > generates correct config from dropdown selection", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                group_by: ["State"],
                columns: ["Sales"],
                settings: true,
                filter: [["State", "in", []]],
            });

            const filter = viewer.shadowRoot.querySelector(
                ".pivot-column input[type=search]",
            );
            filter.value = "C";
            const event = new Event("input", {
                bubbles: true,
                cancelable: true,
            });

            filter.dispatchEvent(event);
        });

        const elem = await page.waitForSelector("perspective-dropdown");
        await page.evaluate((elem) => {
            let node = elem.shadowRoot.querySelector("span:first-of-type");
            var clickEvent = document.createEvent("MouseEvents");
            clickEvent.initEvent("mousedown", true, true);
            node.dispatchEvent(clickEvent);
        }, elem);

        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.flush();
            return await viewer.save();
        });

        expect(config).toEqual({
            ...DEFAULT_CONFIG,
            columns: ["Sales"],
            filter: [["State", "in", ["California"]]],
            group_by: ["State"],
            plugin: "Debug",
            settings: true,
        });

        const contents = await get_contents(page);
        await compareContentsToSnapshot(contents);
    });

    test("numeric input > appends digits without re-rendering on trailing zeroes", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                filter: [["Sales", ">", 1.1]],
                settings: true,
            });
        });

        const numFilter = page.locator("perspective-viewer input.num-filter");
        await numFilter.focus();
        await numFilter.pressSequentially("0001");
        await numFilter.blur();

        const value = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.flush();
            return viewer.shadowRoot.querySelector("input.num-filter").value;
        });

        expect(value).toEqual("1.10001");
        const contents = await get_contents(page);
        await compareContentsToSnapshot(contents);
    });

    test.describe("string autocomplete", () => {
        const search = (page) =>
            page.locator("perspective-viewer input[type=search]");

        const dropdown = (page) => page.locator("perspective-dropdown");

        async function saved_filter(page) {
            return await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                await viewer.flush();
                return (await viewer.save()).filter;
            });
        }

        test.beforeEach(async ({ page }) => {
            await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                const table = await window["__TEST_WORKER__"].table([
                    { area: "EE" },
                    { area: "LT" },
                    { area: "LV" },
                ]);

                await viewer.load(table);
                await viewer.restore({
                    plugin: "Debug",
                    settings: true,
                    filter: [["area", "==", ""]],
                });
            });
        });

        test("Enter after typing an exact value keeps it", async ({ page }) => {
            await search(page).focus();
            await search(page).pressSequentially("L");
            await expect(dropdown(page)).toBeVisible();
            await search(page).pressSequentially("V");
            await expect(dropdown(page)).toBeHidden();
            await search(page).press("Enter");
            expect(await saved_filter(page)).toEqual([["area", "==", "LV"]]);
            await expect(search(page)).toHaveValue("LV");
        });

        test("ArrowDown after typing an exact value is a no-op", async ({
            page,
        }) => {
            await search(page).focus();
            await search(page).pressSequentially("LV");
            await expect(dropdown(page)).toBeHidden();
            await search(page).press("ArrowDown");
            expect(await saved_filter(page)).toEqual([["area", "==", "LV"]]);
            await expect(search(page)).toHaveValue("LV");
        });

        test("Enter on a visible list accepts the highlighted suggestion", async ({
            page,
        }) => {
            await search(page).focus();
            await search(page).pressSequentially("L");
            const highlighted = await page
                .locator("perspective-dropdown span.selected")
                .textContent();

            await search(page).press("Enter");
            expect(await saved_filter(page)).toEqual([
                ["area", "==", highlighted],
            ]);

            await expect(dropdown(page)).toBeHidden();
        });

        test("Tab dismisses the list without accepting", async ({ page }) => {
            await search(page).focus();
            await search(page).pressSequentially("L");
            await expect(dropdown(page)).toBeVisible();
            await search(page).press("Tab");
            await expect(dropdown(page)).toBeHidden();
            expect(await saved_filter(page)).toEqual([["area", "==", "L"]]);
        });

        test("in > Enter after an exact last token keeps it", async ({
            page,
        }) => {
            await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                await viewer.restore({ filter: [["area", "in", []]] });
            });

            await search(page).focus();
            await search(page).pressSequentially("E");
            await expect(dropdown(page)).toBeVisible();
            await search(page).pressSequentially("E");
            await expect(dropdown(page)).toBeHidden();
            await search(page).press("Enter");
            expect(await saved_filter(page)).toEqual([["area", "in", ["EE"]]]);
        });
    });
});
