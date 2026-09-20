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

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

const BAD_COLUMNS_CONFIG = { Sales: { fg_mode: "not-a-mode" } };

async function attempt(
    page: Page,
    config: Record<string, unknown>,
    options?: Record<string, unknown>,
) {
    return page.evaluate(
        async ({ config, options }) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const grid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            let renders = 0;
            const restore_fns: Array<() => void> = [];
            if (grid) {
                for (const name of ["draw", "update"]) {
                    const original = grid[name];
                    grid[name] = function (...args: unknown[]) {
                        renders++;
                        return original.apply(this, args);
                    };

                    restore_fns.push(() => (grid[name] = original));
                }
            }

            await viewer.flush();
            const before = await viewer.save();
            let error: string | null = null;
            try {
                await viewer.restore(config, options);
            } catch (e: any) {
                error = String(e?.message ?? e);
            }

            await viewer.flush();
            const after = await viewer.save();
            restore_fns.forEach((f) => f());
            return { before, after, error, renders };
        },
        { config, options },
    );
}

test.describe("Transactional restore", function () {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Sales", "Profit"],
                group_by: ["Region"],
                title: "Before",
            });

            await viewer.flush();
        });
    });

    test("an invalid columns_config rejects and changes nothing", async ({
        page,
    }) => {
        const result = await attempt(page, {
            columns_config: BAD_COLUMNS_CONFIG,
        });

        expect(result.error).toContain("columns_config");
        expect(result.after).toEqual(result.before);
        expect(result.renders).toBe(0);
    });

    test("a valid view config beside an invalid columns_config is not applied", async ({
        page,
    }) => {
        const result = await attempt(page, {
            group_by: ["State"],
            split_by: ["Category"],
            columns_config: BAD_COLUMNS_CONFIG,
        });

        expect(result.error).not.toBeNull();
        expect(result.after).toEqual(result.before);
        expect(result.renders).toBe(0);
    });

    test("a valid plugin_config beside an invalid columns_config is not applied", async ({
        page,
    }) => {
        const result = await attempt(page, {
            plugin_config: { edit_mode: "EDIT" },
            columns_config: BAD_COLUMNS_CONFIG,
        });

        expect(result.error).not.toBeNull();
        expect(result.after).toEqual(result.before);
    });

    test("a title beside an invalid columns_config is not applied", async ({
        page,
    }) => {
        const result = await attempt(page, {
            title: "After",
            columns_config: BAD_COLUMNS_CONFIG,
        });

        expect(result.error).not.toBeNull();
        expect(result.after.title).toBe("Before");
    });

    test("an invalid expression rejects and changes nothing", async ({
        page,
    }) => {
        const result = await attempt(page, {
            expressions: { broken: '"Sales" +' },
            columns: ["broken"],
        });

        expect(result.error).not.toBeNull();
        expect(result.after).toEqual(result.before);
        expect(result.renders).toBe(0);
    });

    test("an unknown column rejects and changes nothing", async ({ page }) => {
        const result = await attempt(page, { group_by: ["Not A Column"] });
        expect(result.error).toContain("Not A Column");
        expect(result.after).toEqual(result.before);
        expect(result.renders).toBe(0);
    });

    test("an unknown plugin name rejects and changes nothing", async ({
        page,
    }) => {
        const result = await attempt(page, {
            plugin: "Not A Plugin",
            group_by: ["State"],
        });

        expect(result.error).toContain('Unknown plugin "Not A Plugin"');
        expect(result.after).toEqual(result.before);
        expect(result.renders).toBe(0);
    });

    test("a plugin swap beside an invalid columns_config does not swap", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({ plugin: "Y Bar" });
            await viewer.flush();
        });

        const result = await attempt(page, {
            plugin: "Datagrid",
            columns_config: BAD_COLUMNS_CONFIG,
        });

        expect(result.error).toContain("columns_config");
        expect(result.before.plugin).toBe("Y Bar");
        expect(result.after.plugin).toBe("Y Bar");
        expect(result.after).toEqual(result.before);
    });

    test("a rejected restore leaves the panel usable without suppress_errors", async ({
        page,
    }) => {
        const rejected = await attempt(page, {
            columns_config: BAD_COLUMNS_CONFIG,
        });

        expect(rejected.error).not.toBeNull();
        const accepted = await attempt(page, { group_by: ["State"] });
        expect(accepted.error).toBeNull();
        expect(accepted.after.group_by).toEqual(["State"]);
    });

    test("a rejected restore behaves the same with suppress_errors", async ({
        page,
    }) => {
        const result = await attempt(
            page,
            { group_by: ["State"], columns_config: BAD_COLUMNS_CONFIG },
            { suppress_errors: true },
        );

        expect(result.error).not.toBeNull();
        expect(result.after).toEqual(result.before);
    });

    test("a valid restore applies every part together", async ({ page }) => {
        const result = await attempt(page, {
            group_by: ["State"],
            title: "After",
            plugin_config: { edit_mode: "EDIT" },
            columns_config: { Sales: { fg_mode: "bar" } },
        });

        expect(result.error).toBeNull();
        expect(result.after.group_by).toEqual(["State"]);
        expect(result.after.title).toBe("After");
        expect(result.after.plugin_config.edit_mode).toBe("EDIT");
        expect(result.after.columns_config.Sales.fg_mode).toBe("bar");
    });
});
