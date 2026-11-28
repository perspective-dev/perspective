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

import { test, expect, PageView } from "../helpers.ts";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-debug.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function delivered(
    page: Page,
    tag = "perspective-viewer-debug-defaults",
) {
    return await page.evaluate(async (tag) => {
        const viewer = document.querySelector("perspective-viewer")!;
        await viewer.flush();
        const plugin = viewer.querySelector(tag) as any;
        return {
            plugin_config: plugin._restored_plugin_config,
            columns_config: plugin._restored_columns_config,
            restore_count: plugin._restore_count,
        };
    }, tag);
}

async function setDefaults(
    page: Page,
    kind: "plugin" | "column",
    defaults: Record<string, unknown> | null,
    options?: Record<string, unknown>,
): Promise<string | null> {
    return await page.evaluate(
        ({ kind, defaults, options }) => {
            const Viewer = customElements.get("perspective-viewer") as any;
            try {
                if (kind === "plugin") {
                    Viewer.setPluginConfigDefaults(defaults, options);
                } else {
                    Viewer.setColumnConfigDefaults(defaults, options);
                }

                return null;
            } catch (e: any) {
                return e.message ?? String(e);
            }
        },
        { kind, defaults, options },
    );
}

async function snapshot(page: Page) {
    return await page.evaluate(() => {
        const Viewer = customElements.get("perspective-viewer") as any;
        return {
            plugin: Viewer.getPluginConfigDefaults(),
            column: Viewer.getColumnConfigDefaults(),
        };
    });
}

test.describe("Config defaults registry", () => {
    test("calls merge by key and null removes", async ({ page }) => {
        await setDefaults(page, "plugin", { group_pad: 0.5 });
        await setDefaults(page, "plugin", { legend_on: true });
        expect((await snapshot(page)).plugin).toEqual([
            { defaults: { group_pad: 0.5, legend_on: true } },
        ]);

        await setDefaults(page, "plugin", { group_pad: null });
        expect((await snapshot(page)).plugin).toEqual([
            { defaults: { legend_on: true } },
        ]);

        await setDefaults(page, "plugin", null);
        expect((await snapshot(page)).plugin).toEqual([]);
    });

    test("a nested null removes one sub-key and an emptied object", async ({
        page,
    }) => {
        await setDefaults(
            page,
            "column",
            { date_format: { timeZone: "Asia/Tokyo", hour12: false } },
            { type: "datetime" },
        );

        await setDefaults(
            page,
            "column",
            { date_format: { timeZone: null } },
            { type: "datetime" },
        );

        expect((await snapshot(page)).column).toEqual([
            { type: "datetime", defaults: { date_format: { hour12: false } } },
        ]);

        await setDefaults(
            page,
            "column",
            { date_format: { hour12: null } },
            { type: "datetime" },
        );

        expect((await snapshot(page)).column).toEqual([]);
    });

    test("plugin names normalize to the registered name", async ({ page }) => {
        await setDefaults(
            page,
            "plugin",
            { group_pad: 1 },
            { plugin: "debugdefaults" },
        );
        expect((await snapshot(page)).plugin).toEqual([
            { plugin: "Debug Defaults", defaults: { group_pad: 1 } },
        ]);
    });

    test("call-time rejections throw and change nothing", async ({ page }) => {
        expect(
            await setDefaults(
                page,
                "plugin",
                { group_pad: 1 },
                { plugin: "Nope" },
            ),
        ).toMatch(/No plugin named `Nope`/);

        expect(
            await setDefaults(page, "column", { width: 1 }, { type: "money" }),
        ).toMatch(/`type` must be one of/);

        expect(await setDefaults(page, "plugin", 5 as any)).toMatch(
            /must be an object or `null`/,
        );

        expect(
            await setDefaults(
                page,
                "column",
                { date_format: { dateStyle: "long", year: "numeric" } },
                { type: "datetime" },
            ),
        ).toMatch(/cannot be combined/);

        expect(
            await setDefaults(
                page,
                "column",
                { number_format: 4 },
                { type: "float" },
            ),
        ).toMatch(/must be an object or `null`/);

        expect(await snapshot(page)).toEqual({ plugin: [], column: [] });
    });
});

test.describe("Config defaults delivery", () => {
    test("an unqualified plugin default is delivered and never saved", async ({
        page,
    }) => {
        await setDefaults(page, "plugin", { group_pad: 0.5 });
        const view = new PageView(page);
        await view.restore({ plugin: "Debug Defaults", columns: ["Sales"] });
        expect((await delivered(page)).plugin_config.group_pad).toBe(0.5);
        expect(((await view.save()) as any).plugin_config).toEqual({});
    });

    test("a plugin-qualified default applies to that plugin only", async ({
        page,
    }) => {
        await setDefaults(
            page,
            "plugin",
            { edit_mode: "EDIT" },
            { plugin: "Debug Defaults" },
        );

        const view = new PageView(page);
        await view.restore({ plugin: "Debug Defaults", columns: ["Sales"] });
        expect((await delivered(page)).plugin_config.edit_mode).toBe("EDIT");

        await view.restore({ plugin: "Debug Styled" });
        const styled = await delivered(page, "perspective-viewer-debug-styled");
        expect(styled.plugin_config.edit_mode).toBeUndefined();
    });

    test("column defaults resolve by precedence", async ({ page }) => {
        await setDefaults(page, "column", { width: 20 });
        await setDefaults(page, "column", { width: 30 }, { type: "float" });
        await setDefaults(
            page,
            "column",
            { width: 40 },
            { plugin: "Debug Defaults" },
        );
        await setDefaults(
            page,
            "column",
            { width: 50 },
            { plugin: "Debug Defaults", type: "float" },
        );

        const view = new PageView(page);
        await view.restore({ plugin: "Debug Defaults", columns: ["Sales"] });
        expect((await delivered(page)).columns_config.Sales.width).toBe(50);

        await setDefaults(page, "column", null, {
            plugin: "Debug Defaults",
            type: "float",
        });

        expect((await delivered(page)).columns_config.Sales.width).toBe(40);

        await setDefaults(page, "column", null, { plugin: "Debug Defaults" });
        expect((await delivered(page)).columns_config.Sales.width).toBe(30);

        await setDefaults(page, "column", null, { type: "float" });
        expect((await delivered(page)).columns_config.Sales.width).toBe(20);
    });

    test("column defaults reach columns with and without stored entries", async ({
        page,
    }) => {
        await setDefaults(page, "column", { width: 20 });
        const view = new PageView(page);
        await view.restore({
            plugin: "Debug Defaults",
            columns: ["Sales", "Profit"],
            columns_config: { Profit: { color: "#ff0000" } },
        });

        const { columns_config } = await delivered(page);
        expect(columns_config.Sales).toEqual({ width: 20 });
        expect(columns_config.Profit).toEqual({ color: "#ff0000", width: 20 });
        expect(((await view.save()) as any).columns_config).toEqual({
            Profit: { color: "#ff0000" },
        });
    });

    test("a change after render re-delivers on flush without a config update", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({ plugin: "Debug Defaults", columns: ["Sales"] });
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.flush();
            (window as any).__config_updates__ = 0;
            viewer.addEventListener("perspective-config-update", () => {
                (window as any).__config_updates__++;
            });
        });

        await setDefaults(page, "plugin", { group_pad: 1 });
        expect((await delivered(page)).plugin_config.group_pad).toBe(1);
        expect(
            await page.evaluate(() => (window as any).__config_updates__),
        ).toBe(0);
    });

    test("a call that changes nothing does not re-deliver", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({ plugin: "Debug Defaults", columns: ["Sales"] });
        await setDefaults(page, "plugin", { group_pad: 1 });
        const before = (await delivered(page)).restore_count;
        await setDefaults(page, "plugin", { group_pad: 1 });
        await setDefaults(page, "plugin", {});
        await setDefaults(page, "column", null, { type: "float" });
        expect((await delivered(page)).restore_count).toBe(before);
    });

    test("panels and elements created after a call apply it", async ({
        page,
    }) => {
        await setDefaults(page, "plugin", { group_pad: 1 });
        const pads = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Debug Defaults",
                columns: ["Sales"],
            });
            await viewer.addPanel({
                table: "load-viewer-csv",
                plugin: "Debug Defaults",
                columns: ["Profit"],
            } as any);

            const second = document.createElement("perspective-viewer");
            document.body.appendChild(second);
            await second.load((window as any).__TEST_WORKER__);
            await second.restore({
                table: "load-viewer-csv",
                plugin: "Debug Defaults",
                columns: ["Sales"],
            });

            await viewer.flush();
            await second.flush();
            return Array.from(
                document.querySelectorAll("perspective-viewer-debug-defaults"),
            ).map((x: any) => x._restored_plugin_config?.group_pad);
        });

        expect(pads.length).toBe(3);
        expect(pads.every((x) => x === 1)).toBe(true);
    });

    test("a restore before the call loses values equal to the plugin default", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            plugin: "Debug Defaults",
            columns: ["Sales"],
            plugin_config: { group_pad: 0 },
        });

        await setDefaults(page, "plugin", { group_pad: 1 });
        expect((await delivered(page)).plugin_config.group_pad).toBe(1);
        expect(((await view.save()) as any).plugin_config).toEqual({});
    });

    test("a restore after the call keeps values equal to the plugin default", async ({
        page,
    }) => {
        await setDefaults(page, "plugin", { group_pad: 1 });
        const view = new PageView(page);
        await view.restore({
            plugin: "Debug Defaults",
            columns: ["Sales"],
            plugin_config: { group_pad: 0 },
        });

        expect((await delivered(page)).plugin_config.group_pad).toBe(0);
        expect(((await view.save()) as any).plugin_config).toEqual({
            group_pad: 0,
        });
    });

    test("invalid defaults are reported and leave the plugin default", async ({
        page,
        consoleLogs,
    }) => {
        for (const key of [
            "mode",
            "anchor",
            "width",
            "color",
            "aggregate_depth",
        ]) {
            consoleLogs.expectedLogs.push(
                "error",
                new RegExp(
                    `Ignoring default override \`${key}\` for plugin \`Debug Defaults\` column \`Sales\``,
                ),
            );
        }

        await setDefaults(page, "column", {
            mode: "nope",
            anchor: "center",
            width: 500,
            color: "not-a-color",
            aggregate_depth: 1,
        });

        const view = new PageView(page);
        await view.restore({ plugin: "Debug Defaults", columns: ["Sales"] });
        expect((await delivered(page)).columns_config.Sales).toBeUndefined();
    });
});
