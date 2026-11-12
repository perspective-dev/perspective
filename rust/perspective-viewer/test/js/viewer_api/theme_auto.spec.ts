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

const PRO = "/node_modules/@perspective-dev/viewer/dist/css/pro.css";
const PRO_DARK = "/node_modules/@perspective-dev/viewer/dist/css/pro-dark.css";
const LIGHT_BACKGROUND = "rgb(255, 255, 255)";
const DARK_BACKGROUND = "rgb(36, 37, 38)";

async function goto_ready(page: any, hrefs: string[] = [PRO]) {
    await page.goto("/rust/perspective-viewer/test/html/superstore-all.html");
    await page.evaluate(async (hrefs: string[]) => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }

        for (const href of hrefs) {
            await new Promise((resolve, reject) => {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = href;
                link.onload = resolve;
                link.onerror = reject;
                document.head.appendChild(link);
            });
        }

        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.resetThemes();
    }, hrefs);
}

async function read_host(page: any) {
    return await page.evaluate(() => {
        const viewer = document.querySelector(
            "perspective-viewer",
        ) as HTMLElement;
        return {
            theme: viewer.getAttribute("theme"),
            background: getComputedStyle(viewer)
                .getPropertyValue("--psp--background-color")
                .trim(),
            page_scheme: viewer.style
                .getPropertyValue("--psp-page-color-scheme")
                .trim(),
        };
    });
}

async function read_panel(page: any, id?: string) {
    return await page.evaluate((id?: string) => {
        const norm = (color: string) => {
            const el = document.createElement("div");
            el.style.color = color;
            document.body.appendChild(el);
            const out = getComputedStyle(el).color;
            el.remove();
            return out;
        };

        const viewer = document.querySelector("perspective-viewer") as any;
        const slot = id ?? viewer.getPanelNames()[0];
        const plugin = viewer.querySelector(`[slot="${slot}"]`) as any;
        const frame = viewer.shadowRoot.querySelector(
            `regular-layout-frame[name="${slot}"]`,
        ) as HTMLElement;
        const td = plugin.regular_table?.querySelector("tbody td");
        const style = getComputedStyle(plugin);
        const frame_background = frame.style
            .getPropertyValue("--psp--background-color")
            .trim();

        return {
            plugin_background: style
                .getPropertyValue("--psp--background-color")
                .trim(),
            frame_background:
                frame_background.length > 0 ? norm(frame_background) : null,
            cell: td ? norm(td.style.color) : null,
            neg_var: norm(
                style.getPropertyValue("--psp-datagrid--neg-cell--color"),
            ),
        };
    }, id);
}

async function restyle(page: any) {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restyleElement();
        await viewer.flush();
    });
}

async function set_root_scheme(page: any, scheme: string) {
    await page.evaluate((scheme: string) => {
        document.documentElement.style.colorScheme = scheme;
    }, scheme);
}

test.describe("Pro theme", () => {
    test("registers and round-trips through save/restore", async ({ page }) => {
        await goto_ready(page);
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const themes = await viewer.getThemes();
            await viewer.restore({ theme: "Pro" });
            return {
                themes,
                attr: viewer.getAttribute("theme"),
                saved: (await viewer.save()).theme,
            };
        });

        expect(result.themes).toContain("Pro");
        expect(result.attr).toEqual("Pro");
        expect(result.saved).toEqual("Pro");
    });

    test("chrome follows the color scheme with no viewer call", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme: "Pro" });
        });

        const light = await read_host(page);
        expect(light.page_scheme).toEqual("light dark");
        expect(light.background).toEqual(LIGHT_BACKGROUND);
        await page.emulateMedia({ colorScheme: "dark" });
        expect((await read_host(page)).background).toEqual(DARK_BACKGROUND);
    });

    test("chrome follows color-scheme set on :root after restyleElement()", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme: "Pro" });
        });

        expect((await read_host(page)).background).toEqual(LIGHT_BACKGROUND);
        await set_root_scheme(page, "dark");
        expect((await read_host(page)).background).toEqual(LIGHT_BACKGROUND);

        await restyle(page);
        const dark = await read_host(page);
        expect(dark.page_scheme).toEqual("dark");
        expect(dark.background).toEqual(DARK_BACKGROUND);

        await set_root_scheme(page, "light");
        await page.emulateMedia({ colorScheme: "dark" });
        await restyle(page);
        const pinned = await read_host(page);
        expect(pinned.page_scheme).toEqual("light");
        expect(pinned.background).toEqual(LIGHT_BACKGROUND);
    });

    test("plugin cells are stale until restyleElement()", async ({ page }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                theme: "Pro",
                plugin: "Datagrid",
                columns: ["Profit"],
                filter: [["Profit", "<", 0]],
            });
            await viewer.flush();
        });

        const light = await read_panel(page);
        expect(light.cell).toEqual(light.neg_var);

        await page.emulateMedia({ colorScheme: "dark" });
        const flipped = await read_panel(page);
        expect(flipped.neg_var).not.toEqual(light.neg_var);
        expect(flipped.cell).toEqual(light.neg_var);

        await restyle(page);
        const dark = await read_panel(page);
        expect(dark.cell).toEqual(flipped.neg_var);
    });

    test("plugin cells follow a :root color-scheme after restyleElement()", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                theme: "Pro",
                plugin: "Datagrid",
                columns: ["Profit"],
                filter: [["Profit", "<", 0]],
            });
            await viewer.flush();
        });

        const light = await read_panel(page);
        expect(light.plugin_background).toEqual(LIGHT_BACKGROUND);
        expect(light.cell).toEqual(light.neg_var);

        await set_root_scheme(page, "dark");
        const stale = await read_panel(page);
        expect(stale.plugin_background).toEqual(LIGHT_BACKGROUND);
        expect(stale.frame_background).toEqual(LIGHT_BACKGROUND);
        expect(stale.neg_var).toEqual(light.neg_var);

        await restyle(page);
        const dark = await read_panel(page);
        expect(dark.plugin_background).toEqual(DARK_BACKGROUND);
        expect(dark.frame_background).toEqual(DARK_BACKGROUND);
        expect(dark.neg_var).not.toEqual(light.neg_var);
        expect(dark.cell).toEqual(dark.neg_var);
    });

    test("frame background follows the color scheme after restyleElement()", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme: "Pro", plugin: "Datagrid" });
            await viewer.flush();
        });

        const light = await read_panel(page);
        expect(light.frame_background).toEqual(LIGHT_BACKGROUND);

        await page.emulateMedia({ colorScheme: "dark" });
        const flipped = await read_panel(page);
        expect(flipped.plugin_background).toEqual(DARK_BACKGROUND);
        expect(flipped.frame_background).toEqual(LIGHT_BACKGROUND);

        await restyle(page);
        const dark = await read_panel(page);
        expect(dark.frame_background).toEqual(DARK_BACKGROUND);
    });

    test("only the Pro panel's frame follows a flip", async ({ page }) => {
        await goto_ready(page, [PRO, PRO_DARK]);
        const ids = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme: "Pro", plugin: "Datagrid" });
            const added = await viewer.addPanel({
                table: "load-viewer-csv",
                theme: "Pro Dark",
                plugin: "Datagrid",
            });

            await viewer.flush();
            return { auto: viewer.getPanelNames()[0], dark: added };
        });

        const auto = await read_panel(page, ids.auto);
        const dark = await read_panel(page, ids.dark);
        expect(auto.frame_background).toEqual(auto.plugin_background);
        expect(dark.frame_background).toEqual(dark.plugin_background);
        expect(dark.frame_background).toEqual(DARK_BACKGROUND);

        await page.emulateMedia({ colorScheme: "dark" });
        await restyle(page);
        const auto2 = await read_panel(page, ids.auto);
        const dark2 = await read_panel(page, ids.dark);
        expect(auto2.frame_background).toEqual(DARK_BACKGROUND);
        expect(dark2.frame_background).toEqual(DARK_BACKGROUND);
        expect(dark2.plugin_background).toEqual(dark.plugin_background);
    });

    test("a Pro panel ignores the scheme a Pro Dark host pins", async ({
        page,
    }) => {
        await goto_ready(page, [PRO, PRO_DARK]);
        const ids = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme: "Pro Dark", plugin: "Datagrid" });
            const added = await viewer.addPanel({
                table: "load-viewer-csv",
                theme: "Pro",
                plugin: "Datagrid",
            });

            const dark = viewer.getPanelNames()[0];
            await viewer.setActivePanel(dark);
            await viewer.flush();
            return { dark, auto: added };
        });

        const host = await read_host(page);
        expect(host.theme).toEqual("Pro Dark");
        expect(host.background).toEqual(DARK_BACKGROUND);
        const auto = await read_panel(page, ids.auto);
        expect(auto.plugin_background).toEqual(LIGHT_BACKGROUND);

        await page.emulateMedia({ colorScheme: "dark" });
        const flipped = await read_panel(page, ids.auto);
        expect(flipped.plugin_background).toEqual(DARK_BACKGROUND);

        await set_root_scheme(page, "light");
        await restyle(page);
        const pinned = await read_panel(page, ids.auto);
        expect(pinned.plugin_background).toEqual(LIGHT_BACKGROUND);
        expect((await read_host(page)).background).toEqual(DARK_BACKGROUND);
        expect((await read_panel(page, ids.dark)).plugin_background).toEqual(
            DARK_BACKGROUND,
        );
    });
});
