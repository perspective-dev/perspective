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

const GRID = "perspective-viewer-datagrid regular-table";

async function setup(
    page: Page,
    config: Record<string, unknown>,
    scopes: string[],
) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    const { plugin_config, ...view_config } = config;
    await page.evaluate(
        async ({ config, plugin_config, scopes }) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin: "Datagrid", ...config });
            await viewer.flush();
            const g = window as any;
            g.__CONTEXTS__ = [];
            g.__COMMANDS__ = [];
            g.__CLICKS__ = 0;
            g.__LABEL__ = "Flag";
            g.__TITLE__ = undefined;
            g.__DISABLED__ = false;
            viewer.addEventListener("perspective-command", (event) => {
                g.__COMMANDS__.push(event.detail);
            });

            viewer.addEventListener("perspective-click", () => {
                g.__CLICKS__ += 1;
            });

            await viewer.setCommandSchema(
                (context) => {
                    g.__CONTEXTS__.push(context);
                    return {
                        commands: [
                            {
                                kind: "Command",
                                key: "flag",
                                label: g.__LABEL__,
                                disabled: g.__DISABLED__,
                                ...(g.__TITLE__ ? { title: g.__TITLE__ } : {}),
                            },
                        ],
                    };
                },
                { scopes },
            );

            await viewer.flush();
            if (plugin_config) {
                await viewer.restore({ plugin_config });
                await viewer.flush();
            }
        },
        { config: view_config, plugin_config, scopes },
    );
}

async function countEngineCalls(page: Page, run: () => Promise<void>) {
    await page.evaluate(async () => {
        const plugin = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const view = plugin.model._view;
        (window as any).__CALLS__ = 0;
        for (const name of ["to_json", "to_columns_string", "column_paths"]) {
            const original = view[name].bind(view);
            view[name] = (...args: unknown[]) => {
                (window as any).__CALLS__ += 1;
                return original(...args);
            };
        }
    });

    await run();
    return await page.evaluate(() => (window as any).__CALLS__);
}

async function rowButtons(page: Page) {
    return page.locator(`${GRID} tbody tr th .psp-command-button`);
}

test.describe("Datagrid command buttons", () => {
    test("without a datagrid scope the grid has no buttons and one read per draw", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] }, ["context-menu"]);
        await expect(page.locator(`${GRID} .psp-command-button`)).toHaveCount(
            0,
        );

        const calls = await countEngineCalls(page, async () => {
            await page.evaluate(async () => {
                const plugin = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                await plugin.regular_table.draw();
            });
        });

        expect(calls).toBe(1);
    });

    test("datagrid-row renders one button per visible row at the left", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] }, ["datagrid-row"]);
        const rows = page.locator(`${GRID} tbody tr`);
        const buttons = await rowButtons(page);
        await expect(buttons.first()).toBeVisible();
        expect(await buttons.count()).toBe(await rows.count());
        const first = page.locator(`${GRID} tbody tr`).first();
        await expect(first.locator("> *").first()).toHaveClass(
            /psp-command-header/,
        );

        const context = await page.evaluate(
            () => (window as any).__CONTEXTS__[0],
        );

        expect(context.location).toBe("datagrid-row");
        expect(context.hit.kind).toBe("row");
        expect(context.hit.y).toBe(0);
        expect(Array.isArray(context.hit.id)).toBe(true);
        expect(context.hit).not.toHaveProperty("value");
        expect(context.hit).not.toHaveProperty("row");
    });

    test("command_column places the button column after the tree columns", async ({
        page,
    }) => {
        await setup(
            page,
            {
                group_by: ["Region"],
                columns: ["Sales"],
                plugin_config: { command_column: "tree" },
            },
            ["datagrid-row"],
        );

        const row = page.locator(`${GRID} tbody tr`).nth(1);
        const headers = row.locator("th");
        const n = await headers.count();
        await expect(headers.nth(n - 1)).toHaveClass(/psp-command-header/);
        await expect(
            headers.nth(n - 1).locator(".psp-command-button"),
        ).toHaveText("Flag");

        await expect(row.locator("th.psp-tree-leaf")).toHaveCount(1);
        const context = await page.evaluate(
            () => (window as any).__CONTEXTS__[1],
        );

        expect(context.hit.row_path).toEqual(["Central"]);
    });

    test("command_column places the button column at the right", async ({
        page,
    }) => {
        await setup(
            page,
            {
                columns: ["State", "Sales"],
                plugin_config: { command_column: "right" },
            },
            ["datagrid-row"],
        );

        const row = page.locator(`${GRID} tbody tr`).first();
        await expect(row.locator("th .psp-command-button")).toHaveCount(0);
        const cells = row.locator("td");
        const n = await cells.count();
        expect(n).toBe(3);
        await expect(
            cells.nth(n - 1).locator(".psp-command-button"),
        ).toHaveText("Flag");

        const headers = page.locator(`${GRID} thead tr`).last().locator("th");
        await expect(headers.nth((await headers.count()) - 1)).toHaveText("");
        await expect(headers.last()).toHaveClass(/psp-command-column/);
        await expect(headers.last()).not.toHaveClass(/psp-sort-enabled/);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.toggleConfig(true);
            await viewer.flush();
        });

        const menu_row = page.locator(`${GRID} thead tr`).last().locator("th");
        await expect(menu_row.first()).toHaveClass(/psp-menu-enabled/);
        await expect(menu_row.last()).not.toHaveClass(/psp-menu-enabled/);
    });

    test("datagrid-cell renders buttons beside each value with a cell hit", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] }, ["datagrid-cell"]);
        const cell = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td")
            .first();
        await expect(
            cell.locator(".psp-command-cell .psp-command-value"),
        ).toHaveCount(1);

        await expect(cell.locator(".psp-command-button")).toHaveText("Flag");
        const text = (
            await cell.locator(".psp-command-value").innerText()
        ).trim();

        const context = await page.evaluate(
            () => (window as any).__CONTEXTS__[0],
        );

        expect(context.location).toBe("datagrid-cell");
        expect(context.hit.kind).toBe("cell");
        expect(context.hit.column_names).toEqual(["State"]);
        expect(context.hit.value).toBe(text);
    });

    test("clicking a button invokes with its context and neither selects nor clicks the row", async ({
        page,
    }) => {
        await setup(
            page,
            {
                columns: ["State", "Sales"],
                plugin_config: { edit_mode: "SELECT_ROW" },
            },
            ["datagrid-row"],
        );

        const button = (await rowButtons(page)).nth(2);
        await button.click();
        const result = await page.evaluate(() => {
            const g = window as any;
            return {
                keys: g.__COMMANDS__.map((d) => d.key),
                y: g.__COMMANDS__[0]?.context.hit.y,
                clicks: g.__CLICKS__,
            };
        });

        expect(result).toEqual({ keys: ["flag"], y: 2, clicks: 0 });
        await expect(
            page
                .locator(`${GRID} tbody tr`)
                .nth(2)
                .locator("td.psp-select-region"),
        ).toHaveCount(0);
    });

    test("a disabled spec renders a disabled button that dispatches nothing", async ({
        page,
    }) => {
        await setup(page, { columns: ["State"] }, ["datagrid-row"]);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            (window as any).__DISABLED__ = true;
            await viewer.invalidate();
        });

        const button = (await rowButtons(page)).first();
        await expect(button).toBeDisabled();
        await button.click({ force: true });
        expect(
            await page.evaluate(() => (window as any).__COMMANDS__.length),
        ).toBe(0);
    });

    test("a title is the button's tooltip and the label its text", async ({
        page,
    }) => {
        await setup(page, { columns: ["State"] }, ["datagrid-row"]);
        const button = (await rowButtons(page)).first();
        await expect(button).toHaveAttribute("title", "Flag");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            (window as any).__TITLE__ = "Flag this row";
            await viewer.invalidate();
        });

        await expect(button).toHaveAttribute("title", "Flag this row");
        await expect(button).toHaveText("Flag");
    });

    test("a redraw with unchanged commands keeps the same button elements", async ({
        page,
    }) => {
        await setup(page, { columns: ["Row ID", "Sales"] }, [
            "datagrid-row",
            "datagrid-cell",
        ]);

        const marked = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const buttons = plugin.regular_table.querySelectorAll(
                "tbody tr:first-child .psp-command-button",
            );

            for (const button of buttons) {
                button.__MARK__ = true;
            }

            return buttons.length;
        });

        expect(marked).toBe(3);
        const first_id = (
            await page
                .locator(`${GRID} tbody tr`)
                .first()
                .locator("td .psp-command-value")
                .first()
                .innerText()
        ).trim();

        await page.evaluate(async (id) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const table = await viewer.getTable();
            await table.update([{ "Row ID": Number(id), Sales: 123456 }]);
        }, first_id);

        const sales = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td .psp-command-value")
            .nth(1);

        await expect(sales).toHaveText(/123,?456/);
        const kept = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            return [
                ...plugin.regular_table.querySelectorAll(
                    "tbody tr:first-child .psp-command-button",
                ),
            ].map((button) => button.__MARK__ === true);
        });

        expect(kept).toEqual([true, true, true]);
        await page.evaluate(async () => {
            const plugin = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            (window as any).__LABEL__ = "Unflag";
            await plugin.regular_table.draw();
        });

        const replaced = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            return [
                ...plugin.regular_table.querySelectorAll(
                    "tbody tr:first-child .psp-command-button",
                ),
            ].map((button) => [button.textContent, button.__MARK__ === true]);
        });

        expect(replaced).toEqual([
            ["Unflag", false],
            ["Unflag", false],
            ["Unflag", false],
        ]);
    });

    test("a press that spans a redraw still clicks the button", async ({
        page,
    }) => {
        await setup(page, { columns: ["State"] }, ["datagrid-row"]);
        const button = (await rowButtons(page)).first();
        const box = (await button.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(async () => {
            const plugin = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            await plugin.regular_table.draw();
        });

        await page.mouse.up();
        expect(
            await page.evaluate(() => (window as any).__COMMANDS__.length),
        ).toBe(1);
    });

    test("enabling a row scope after the first draw keeps the data column widths", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales", "Profit"] }, [
            "context-menu",
        ]);

        const widths = async () =>
            await page.evaluate(() => {
                const plugin = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const cells = plugin.regular_table.querySelectorAll(
                    "tbody tr:first-child td",
                );

                return [...cells].map((td) => td.clientWidth);
            });

        const before = await widths();
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setCommandSchema(
                () => ({
                    commands: [{ kind: "Command", key: "flag", label: "Flag" }],
                }),
                { scopes: ["datagrid-row"] },
            );

            await viewer.flush();
        });

        await expect((await rowButtons(page)).first()).toBeVisible();
        expect(await widths()).toEqual(before);
    });

    test("the command column is bordered like a cell beside the data, not before a tree", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] }, ["datagrid-row"]);
        const flat = page
            .locator(`${GRID} tbody tr`)
            .nth(1)
            .locator("th.psp-command-header");

        await expect(flat).toHaveClass(/psp-command-header-leaf/);
        await expect(flat).toHaveCSS("border-top-width", "1px");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ group_by: ["Region"] });
            await viewer.flush();
        });

        const before_tree = page
            .locator(`${GRID} tbody tr`)
            .nth(1)
            .locator("th.psp-command-header");

        await expect(before_tree).not.toHaveClass(/psp-command-header-leaf/);
        await expect(before_tree).toHaveCSS("border-top-width", "0px");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin_config: { command_column: "tree" } });
            await viewer.flush();
        });

        const after_tree = page
            .locator(`${GRID} tbody tr`)
            .nth(1)
            .locator("th.psp-command-header");

        await expect(after_tree).toHaveClass(/psp-command-header-leaf/);
        await expect(after_tree).toHaveCSS("border-top-width", "1px");
    });

    test("a left command column leaves the hover left border on the tree cell", async ({
        page,
    }) => {
        await setup(page, { group_by: ["Region"], columns: ["Sales"] }, [
            "datagrid-row",
        ]);

        const row = page.locator(`${GRID} tbody tr`).nth(1);
        await row.locator("td").first().hover();
        await expect(row.locator("th.psp-command-header")).toHaveCSS(
            "border-left-width",
            "0px",
        );

        await expect(row.locator("th.psp-tree-leaf")).toHaveCSS(
            "border-left-width",
            "1px",
        );
    });

    test("the plugin config schema offers the command fields only for declared scopes", async ({
        page,
    }) => {
        await setup(page, { columns: ["State"] }, ["context-menu"]);
        const keys = async () =>
            await page.evaluate(() => {
                const plugin = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const walk = (fields: any[]): string[] =>
                    fields.flatMap((f) =>
                        f.kind === "Group" ? walk(f.fields) : [f.key],
                    );

                return walk(plugin.plugin_config_schema({}, null).fields);
            });

        expect(await keys()).not.toContain("command_column");
        expect(await keys()).not.toContain("command_cells");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setCommandSchema(() => ({ commands: [] }), {
                scopes: ["datagrid-row"],
            });
        });

        expect(await keys()).toContain("command_column");
        expect(await keys()).not.toContain("command_cells");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setCommandSchema(() => ({ commands: [] }), {
                scopes: ["datagrid-cell"],
            });
        });

        expect(await keys()).not.toContain("command_column");
        expect(await keys()).toContain("command_cells");
    });

    test("command_column round-trips through save and restore", async ({
        page,
    }) => {
        await setup(
            page,
            { columns: ["State"], plugin_config: { command_column: "right" } },
            ["datagrid-row"],
        );

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const first = (await viewer.save()).plugin_config.command_column;
            await viewer.restore({ plugin_config: { command_column: "left" } });
            const second = (await viewer.save()).plugin_config.command_column;
            return [first, second];
        });

        expect(saved).toEqual(["right", undefined]);
    });

    test("command_column restored before a row scope is declared is dropped", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["State"],
                plugin_config: { command_column: "right" },
            });

            await viewer.flush();
            const before = (await viewer.save()).plugin_config.command_column;
            await viewer.setCommandSchema(
                () => ({
                    commands: [{ kind: "Command", key: "flag", label: "Flag" }],
                }),
                { scopes: ["datagrid-row"] },
            );

            await viewer.flush();
            const after = (await viewer.save()).plugin_config.command_column;
            return [before, after];
        });

        expect(saved).toEqual([undefined, undefined]);
        await expect((await rowButtons(page)).first()).toBeVisible();
        await expect(
            page.locator(`${GRID} tbody tr`).first().locator("td"),
        ).toHaveCount(1);
    });

    test("invalidate re-renders the buttons from the new schema result", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] }, ["datagrid-row"]);
        await expect((await rowButtons(page)).first()).toHaveText("Flag");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            (window as any).__LABEL__ = "Unflag";
            await viewer.invalidate();
        });

        await expect((await rowButtons(page)).first()).toHaveText("Unflag");
    });

    test("a right-click on a button row resolves the same row as the button", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] }, [
            "context-menu",
            "datagrid-row",
        ]);

        const cell = page
            .locator(`${GRID} tbody tr`)
            .nth(1)
            .locator("td")
            .first();
        await cell.click({ button: "right" });
        await page.locator("perspective-context-menu").waitFor();
        const context = await page.evaluate(() =>
            (window as any).__CONTEXTS__.at(-1),
        );

        expect(context.location).toBe("context-menu");
        expect(context.hit.kind).toBe("cell");
        expect(context.hit.y).toBe(1);
    });
});
