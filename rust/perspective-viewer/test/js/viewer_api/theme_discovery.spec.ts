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

const PRO_DARK = "/node_modules/@perspective-dev/viewer/dist/css/pro-dark.css";

async function inject_style(page: any, css: string) {
    await page.evaluate((css: string) => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
    }, css);
}

async function inject_link(page: any, href: string) {
    await page.evaluate(async (href: string) => {
        await new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }, href);
}

async function get_themes(page: any, reset = false): Promise<string[]> {
    return await page.evaluate(async (reset: boolean) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        if (reset) {
            await viewer.resetThemes();
        }

        return await viewer.getThemes();
    }, reset);
}

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Theme discovery", () => {
    test("registers a theme nested in @media", async ({ page }) => {
        expect(await get_themes(page)).toEqual(["Pro Light"]);
        await inject_style(
            page,
            `@media (min-width: 0px) { perspective-viewer { --psp-theme-name: "Nested"; } }`,
        );

        expect(await get_themes(page, true)).toEqual(["Pro Light", "Nested"]);
    });

    test("registers a theme nested in @layer", async ({ page }) => {
        await inject_style(
            page,
            `@layer themes { perspective-viewer[theme="Layered"] { --psp-theme-name: "Layered"; } }`,
        );

        expect(await get_themes(page, true)).toEqual(["Pro Light", "Layered"]);
    });

    test("registers a theme reached through @import", async ({ page }) => {
        await inject_style(page, `@import url("${PRO_DARK}");`);
        await page.evaluate(async () => {
            while (
                !Array.from(document.styleSheets).some((sheet) => {
                    try {
                        const rule = sheet.cssRules[0] as CSSImportRule;
                        return rule?.styleSheet?.cssRules?.length > 0;
                    } catch {
                        return false;
                    }
                })
            ) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        expect(await get_themes(page, true)).toEqual(["Pro Light", "Pro Dark"]);
    });

    test("registers a theme from an adopted stylesheet", async ({ page }) => {
        await page.evaluate(() => {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(
                `perspective-viewer { --psp-theme-name: "Adopted"; }`,
            );
            document.adoptedStyleSheets = [
                ...document.adoptedStyleSheets,
                sheet,
            ];
        });

        expect(await get_themes(page, true)).toEqual(["Pro Light", "Adopted"]);
    });

    test("registers a theme from the hosting shadow root only", async ({
        page,
    }) => {
        const themes = await page.evaluate(async () => {
            const host = document.createElement("div");
            document.body.appendChild(host);
            const root = host.attachShadow({ mode: "open" });
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(
                `perspective-viewer { --psp-theme-name: "Shadowed"; }`,
            );
            root.adoptedStyleSheets = [sheet];
            const inner = document.createElement("perspective-viewer") as any;
            root.appendChild(inner);
            const outer = document.querySelector("perspective-viewer") as any;
            await outer.resetThemes();
            return {
                inner: await inner.getThemes(),
                outer: await outer.getThemes(),
            };
        });

        expect(themes.inner).toEqual(["Pro Light", "Shadowed"]);
        expect(themes.outer).toEqual(["Pro Light"]);
    });

    test("a late stylesheet registers only after resetThemes()", async ({
        page,
    }) => {
        expect(await get_themes(page)).toEqual(["Pro Light"]);
        await inject_link(page, PRO_DARK);
        expect(await get_themes(page)).toEqual(["Pro Light"]);
        expect(await get_themes(page, true)).toEqual(["Pro Light", "Pro Dark"]);
    });

    test("an explicit theme list is not overridden by a late stylesheet", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.resetThemes(["Pro Light"]);
        });

        await inject_link(page, PRO_DARK);
        expect(await get_themes(page)).toEqual(["Pro Light"]);
        expect(await get_themes(page, true)).toEqual(["Pro Light", "Pro Dark"]);
    });

    test("duplicate registrations collapse to one name", async ({ page }) => {
        await inject_style(
            page,
            `perspective-viewer { --psp-theme-name: "Pro Light"; } perspective-viewer [theme="Pro Light"] { --psp-theme-name: 'Pro Light'; }`,
        );

        expect(await get_themes(page, true)).toEqual(["Pro Light"]);
    });
});
