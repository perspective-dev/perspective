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
import { compareContentsToSnapshot } from "@perspective-dev/test";
import * as prettier from "prettier";

async function get_contents(page) {
    const raw = await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer").shadowRoot;
        return viewer.innerHTML;
    });

    return await prettier.format(raw, {
        parser: "html",
    });
}

test.describe("Settings", () => {
    test.describe("Toggle", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto(
                "/rust/perspective-viewer/test/html/superstore.html",
            );
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

        test("opens settings when field is set to true", async ({ page }) => {
            await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                await viewer.getTable();
                await viewer.restore({ settings: true });
            });

            const contents = await get_contents(page);

            await compareContentsToSnapshot(contents, [
                "opens-settings-when-field-is-set-to-true.txt",
            ]);
        });

        test("opens settings when field is set to false", async ({ page }) => {
            await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                await viewer.getTable();
                await viewer.restore({ settings: false });
            });

            const contents = await get_contents(page);

            await compareContentsToSnapshot(contents, [
                "opens-settings-when-field-is-set-to-false.txt",
            ]);
        });
    });

    test.describe("Close button", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto(
                "/rust/perspective-viewer/test/html/superstore.html",
            );
            await page.evaluate(async () => {
                while (!window["__TEST_PERSPECTIVE_READY__"]) {
                    await new Promise((x) => setTimeout(x, 10));
                }
            });

            await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                await viewer.restore({ plugin: "Debug" });
                await viewer.getTable();
                await viewer.restore({ settings: true });
            });
        });

        test("close button hides the settings panel", async ({ page }) => {
            const shadowRoot = page.locator("perspective-viewer");
            await shadowRoot
                .locator("#settings_close_button")
                .first()
                .click();

            const saved = await page.evaluate(async () =>
                document.querySelector("perspective-viewer").save(),
            );

            expect(saved.settings).toBe(false);
        });

        test("settings panel round-trips open/close via save()", async ({
            page,
        }) => {
            // Open → close via API → open again.  save() must reflect each state.
            const saved1 = await page.evaluate(async () =>
                document.querySelector("perspective-viewer").save(),
            );
            expect(saved1.settings).toBe(true);

            await page.evaluate(async () =>
                document.querySelector("perspective-viewer").restore({
                    settings: false,
                }),
            );

            const saved2 = await page.evaluate(async () =>
                document.querySelector("perspective-viewer").save(),
            );
            expect(saved2.settings).toBe(false);

            await page.evaluate(async () =>
                document.querySelector("perspective-viewer").restore({
                    settings: true,
                }),
            );

            const saved3 = await page.evaluate(async () =>
                document.querySelector("perspective-viewer").save(),
            );
            expect(saved3.settings).toBe(true);
        });
    });

    test.describe("Regressions", () => {
        test("load and restore with settings called at the same time does not throw", async ({
            page,
            consoleLogs,
        }) => {
            const errors = [];
            page.on("pageerror", async (msg) => {
                errors.push(`${msg.name}::${msg.message}`);
            });

            await page.goto("/rust/perspective-viewer/test/html/blank.html", {
                waitUntil: "networkidle",
            });

            await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer");
                viewer.load(
                    new Promise((_, reject) =>
                        reject("Intentional Load Error"),
                    ),
                );
                try {
                    await viewer.restore({
                        settings: true,
                        plugin: "Debug",
                    });
                } catch (e) {
                    // We need to catch this error else the `evaluate()` fails.
                    // We need to await the call because we want it to fail
                    // before continuing the test.
                    console.error("Caught error:", e);
                }

                await new Promise((x) => setTimeout(x, 1000));
            });

            const contents = await get_contents(page);
            expect(errors).toEqual([
                'Error::Failed to construct table from JsValue("Intentional Load Error")',
            ]);
            consoleLogs.expectedLogs.push("error", /Intentional Load Error/);
        });
    });
});
