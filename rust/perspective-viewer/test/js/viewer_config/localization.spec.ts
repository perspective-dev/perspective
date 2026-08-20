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

import { PageView as PspViewer, expect, test } from "../helpers.ts";
import fs from "node:fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("Localization", function () {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    test("labels > renders no visible label text", async function ({ page }) {
        const view = new PspViewer(page);
        await view.openSettingsPanel();
        const editBtn = view.dataGrid.regularTable.editBtnRow
            .locator("th.psp-menu-enabled span")
            .first();

        await editBtn.click();
        await view.columnSettingsSidebar.container.waitFor();
        const contents = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer");
            return Array.from(viewer.shadowRoot.querySelectorAll("label"))
                .map((x) => x.textContent)
                .filter((x) => x != "");
        });

        expect(contents).toEqual([]);
    });

    const intl = fs
        .readFileSync(`${__dirname}/../../../src/themes/intl.css`)
        .toString();

    const keys = Array.from(intl.matchAll(/--[a-zA-Z0-9\-]+/g)).flat();
    const langfiles = fs.readdirSync(`${__dirname}/../../../src/themes/intl`);
    for (const file of langfiles) {
        test(`${file} > contains all required intl keys`, async function ({
            page,
        }) {
            const langfile = fs
                .readFileSync(`${__dirname}/../../../src/themes/intl/${file}`)
                .toString();
            for (const key of keys) {
                const re = new RegExp(key, "g");
                const x = langfile.match(re);
                expect(x).toEqual([key]);
            }
        });
    }
});
