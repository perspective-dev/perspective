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

    test("numeric column nests fg/bg triples in default-open groups", async function ({
        page,
    }) {
        const view = new PspViewer(page);
        await openNumericStyleTab(page, view);

        const sidebar = view.columnSettingsSidebar.container;
        const groups = sidebar.locator("details.control-group");

        await expect(groups).toHaveCount(3);
        await expect(
            groups.last().locator("summary #format-group-label"),
        ).toHaveCount(1);

        const fg = groups.first();
        const bg = groups.nth(1);
        await expect(fg).toHaveJSProperty("open", true);
        await expect(bg).toHaveJSProperty("open", true);
        await expect(fg.locator("summary #fg-group-label")).toHaveCount(1);
        await expect(bg.locator("summary #bg-group-label")).toHaveCount(1);

        await expect(fg.locator("#number_fg_mode-label")).toHaveCount(1);
        await expect(fg.locator("#fg_colors-label")).toHaveCount(1);
        await expect(fg.locator("#fg_gradient-label")).toHaveCount(0);
        await expect(bg.locator("#number_bg_mode-label")).toHaveCount(1);
        await expect(bg.locator("#bg_colors-label")).toHaveCount(0);

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
        const fg = sidebar.locator("details.control-group").first();
        await fg
            .locator("div.row", {
                has: page.locator("label#number_fg_mode-label"),
            })
            .locator("select")
            .selectOption("label-bar");

        await expect(fg.locator("#fg_gradient-label")).toHaveCount(1);
        await expect(fg).toHaveJSProperty("open", true);

        const token = (await view.save()) as any;
        const config = token.columns_config["Row ID"];

        expect(config.number_fg_mode).toEqual("label-bar");
        expect(config.fg_gradient).not.toBeUndefined();
        expect(config.fg).toBeUndefined();
        expect(token.plugin_config.fg).toBeUndefined();
    });
});
