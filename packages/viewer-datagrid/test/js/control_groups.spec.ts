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

import { PageView as PspViewer, expect, test } from "@perspective-dev/test";

test.describe("Datagrid column style control groups", function () {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    async function openNumericStyleTab(page: any, view: PspViewer) {
        await view.openSettingsPanel();
        const editBtn = view.dataGrid.regularTable.editBtnRow
            .locator("th.psp-menu-enabled span")
            .first();

        await editBtn.click();
        await view.columnSettingsSidebar.container.waitFor();
    }

    test("numeric column nests its color controls in a default-open group", async function ({
        page,
    }) {
        const view = new PspViewer(page);
        await openNumericStyleTab(page, view);

        const sidebar = view.columnSettingsSidebar.container;
        const groups = sidebar.locator("details.control-group");

        await expect(groups).toHaveCount(2);
        await expect(
            groups.last().locator("summary #format-group-label"),
        ).toHaveCount(1);

        const color = groups.first();
        await expect(color).toHaveJSProperty("open", true);
        await expect(color.locator("summary #color-group-label")).toHaveCount(
            1,
        );

        await expect(color.locator("#number_fg_mode-label")).toHaveCount(1);
        await expect(color.locator("#fg_colors-label")).toHaveCount(1);
        await expect(color.locator("#fg_gradient-label")).toHaveCount(0);
        await expect(color.locator("#number_bg_mode-label")).toHaveCount(1);
        await expect(color.locator("#bg_colors-label")).toHaveCount(0);

        await expect(
            sidebar.locator(
                "details.control-group #column_size_override-label",
            ),
        ).toHaveCount(0);
    });

    test("dynamic gating works inside a group and serializes flat", async function ({
        page,
    }) {
        const view = new PspViewer(page);
        await openNumericStyleTab(page, view);

        const sidebar = view.columnSettingsSidebar.container;
        const color = sidebar.locator("details.control-group").first();
        await color
            .locator("div.row", {
                has: page.locator("label#number_fg_mode-label"),
            })
            .locator("select")
            .selectOption("label-bar");

        await expect(color.locator("#fg_gradient-label")).toHaveCount(1);
        await expect(color).toHaveJSProperty("open", true);

        const token = (await view.save()) as any;
        const config = token.columns_config["Row ID"];

        expect(config.number_fg_mode).toEqual("label-bar");
        expect(config.fg_gradient).toBeUndefined();
        expect(config.color).toBeUndefined();
        expect(token.plugin_config.color).toBeUndefined();

        const received = await page.evaluate(() => {
            const rt = (
                document.querySelector("perspective-viewer-datagrid") as any
            ).shadowRoot.querySelector("regular-table");
            const sym = Object.getOwnPropertySymbols(rt).find((s) =>
                String(s).includes("Perspective Column Config"),
            );
            return sym ? rt[sym] : undefined;
        });

        expect(received?.["Row ID"]?.fg_gradient).not.toBeUndefined();
    });
});
