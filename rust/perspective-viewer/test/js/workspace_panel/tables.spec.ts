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

import type { Page } from "@playwright/test";

import { test, expect, openWorkspaceTab } from "../helpers.ts";
import { TABLE, ready, saveWorkspace } from "./helpers.ts";

test.beforeEach(async ({ page }) => {
    await ready({ page });
    await openWorkspaceTab(page, "tables");
});

function row(page: Page, table: string) {
    return page.locator(`perspective-viewer .ws-table[data-table="${table}"]`);
}

function panelNames(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        (document.querySelector("perspective-viewer")! as any).getPanelNames(),
    );
}

test.describe("Workspace panel tables tab", () => {
    test("lists hosted tables and follows creates and deletes", async ({
        page,
    }) => {
        await expect(row(page, TABLE)).toBeVisible();
        await expect(
            row(page, TABLE).locator(".ws-table-consumers"),
        ).toHaveText("1");

        await page.evaluate(async () => {
            window["__extra__"] = await window["__TEST_WORKER__"].table(
                "x\n1",
                { name: "tables-extra" },
            );
        });

        await expect(row(page, "tables-extra")).toBeVisible();
        await page.evaluate(async () => {
            await window["__extra__"].delete();
        });

        await expect(row(page, "tables-extra")).toHaveCount(0);
    });

    test("a row's new-panel button adds a panel on that table", async ({
        page,
    }) => {
        const before = await panelNames(page);
        await row(page, TABLE).hover();
        await row(page, TABLE).locator(".ws-table-new").click();
        await expect
            .poll(async () => (await panelNames(page)).length)
            .toBe(before.length + 1);

        await expect(
            row(page, TABLE).locator(".ws-table-consumers"),
        ).toHaveText("2");
    });

    test("deriving from a panel nests the derived table under its parent", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({ group_by: ["Region"] });
        });

        await page
            .locator("perspective-viewer .ws-derive-panel")
            .first()
            .click();
        const derived = page.locator("perspective-viewer .ws-table.is-derived");
        await expect(derived).toHaveCount(1);
        await expect(derived.locator(".ws-table-delete")).toHaveCount(0);
        const name = await derived.getAttribute("data-table");
        expect((await saveWorkspace(page)).derived_tables[name!].table).toBe(
            TABLE,
        );
    });

    test("a join is created, listed, unsaved and deletable", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const worker = window["__TEST_WORKER__"];
            await worker.table("id,left\n1,a\n2,b", { name: "join-left" });
            await worker.table("id,right\n1,c\n2,d", { name: "join-right" });
        });

        await expect(row(page, "join-right")).toBeVisible();
        await page.locator("perspective-viewer .ws-client-join").click();
        const form = page.locator("perspective-viewer #workspace-join-form");
        await form.locator("#workspace-join-left").selectOption("join-left");
        await form.locator("#workspace-join-right").selectOption("join-right");
        await expect(form.locator("#workspace-join-on")).toHaveValue("id");
        await form.locator("#workspace-join-name").fill("join-result");
        await form.locator("#workspace-join-create").click();

        const joined = row(page, "join-result");
        await expect(joined).toHaveClass(/is-join/);
        await expect(form).toHaveCount(0);
        const saved = await saveWorkspace(page);
        expect(JSON.stringify(saved)).not.toContain("join-result");

        await joined.hover();
        await joined.locator(".ws-table-delete").click();
        await expect(joined).toHaveCount(0);
    });

    test("a failed join reports its error in the form", async ({ page }) => {
        await page.locator("perspective-viewer .ws-client-join").click();
        const form = page.locator("perspective-viewer #workspace-join-form");
        await expect(form.locator("#workspace-join-on")).not.toHaveValue("");
        await form.locator("#workspace-join-create").click();
        await expect(form.locator("#workspace-join-error")).not.toBeEmpty();
        await expect(form).toBeVisible();
    });
});
