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

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        await viewer.restore({ plugin: "Debug" });
        // Explicitly register both themes so the memoized theme cache contains
        // "Pro Dark" even though superstore.html only loads pro-light.css.
        await viewer.resetThemes(["Pro Light", "Pro Dark"]);
    });
});

test.describe("Theme", () => {
    test("restore sets the theme attribute on the host element", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({ theme: "Pro Dark" });
        });

        const themeAttr = await page.evaluate(() =>
            document.querySelector("perspective-viewer")!.getAttribute("theme"),
        );

        expect(themeAttr).toBe("Pro Dark");
    });

    test("save returns the correct theme after restore", async ({ page }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({ theme: "Pro Dark" });
            return await viewer.save();
        });

        expect(saved.theme).toBe("Pro Dark");
    });

    test("theme is preserved across settings panel open/close toggle", async ({
        page,
    }) => {
        // Set theme, then toggle settings open and closed.
        // This exercises the UpdateSettingsOpen path which must NOT wipe
        // available_themes from the PresentationProps snapshot.
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({ theme: "Pro Dark" });
            await viewer.restore({ settings: true });
            await viewer.restore({ settings: false });
            return await viewer.save();
        });

        expect(saved.theme).toBe("Pro Dark");
        expect(saved.settings).toBe(false);
    });

    test("save reports the applied host theme with no per-panel theme", async ({
        page,
    }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.resetThemes(["Pro Light", "Pro Dark"]);
            await viewer.restore({ theme: "Pro Dark" });
            return await viewer.save();
        });

        expect(saved.theme).toBe("Pro Dark");
    });

    test("save reports the applied host theme with no per-panel theme default", async ({
        page,
    }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.resetThemes(["Pro Dark"]);
            return await viewer.save();
        });

        expect(saved.theme).toBe("Pro Dark");
    });

    test("save reports the applied host theme with no per-panel theme 3", async ({
        page,
    }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.resetThemes(["Pro Light", "Pro Dark"]);
            await viewer.restore({ theme: "Pro Dark" });
            return await viewer.save();
        });

        expect(saved.theme).toBe("Pro Dark");
    });

    test("save reports the applied host theme with no per-panel theme 4", async ({
        page,
    }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.resetThemes(["Pro Light", "Pro Dark"]);
            return await viewer.save();
        });

        expect(saved.theme).toBe("Pro Light");
    });

    test("switching theme updates the theme attribute", async ({ page }) => {
        const themeAttr = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({ theme: "Pro Dark" });
            await viewer.restore({ theme: "Pro Light" });
            return viewer.getAttribute("theme");
        });

        expect(themeAttr).toBe("Pro Light");
    });

    test("theme picker stamps the tab host in the same task as the plugin", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({ theme: "Pro Light", settings: true });
            const plugin = viewer.querySelector("perspective-viewer-plugin")!;
            const tab = viewer.querySelector("perspective-viewer-tab")!;
            const before = tab.getAttribute("theme");
            const at_plugin_stamp = new Promise<string | null>((resolve) => {
                const observer = new MutationObserver((records) => {
                    if (records.some((r) => r.target === plugin)) {
                        observer.disconnect();
                        resolve(tab.getAttribute("theme"));
                    }
                });

                observer.observe(viewer, {
                    attributes: true,
                    attributeFilter: ["theme"],
                    subtree: true,
                });
            });

            const select = viewer.shadowRoot!.querySelector(
                "#theme_selector",
            ) as HTMLSelectElement;
            select.value = "Pro Dark";
            select.dispatchEvent(new Event("input", { bubbles: true }));
            return { before, at_plugin_stamp: await at_plugin_stamp };
        });

        expect(result.before).toBe("Pro Light");
        expect(result.at_plugin_stamp).toBe("Pro Dark");
    });
});
