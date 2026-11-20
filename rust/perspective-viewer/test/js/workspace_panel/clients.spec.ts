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

const OTHER = "clients-other";

test.beforeEach(async ({ page }) => {
    await ready({ page });
    await page.evaluate(async (name) => {
        const { default: perspective } = await import(
            "/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
        );

        const worker = await perspective.worker();
        await worker.table("a,b\n1,2", { name });
        window["__other__"] = worker;
        const viewer = document.querySelector("perspective-viewer")! as any;
        await viewer.load(worker);
    }, OTHER);

    await openWorkspaceTab(page, "tables");
    await expect(row(page, OTHER)).toBeVisible();
});

function row(page: Page, table: string) {
    return page.locator(`perspective-viewer .ws-table[data-table="${table}"]`);
}

function section(page: Page, table: string) {
    return page.locator("perspective-viewer .ws-client", {
        has: page.locator(`.ws-table[data-table="${table}"]`),
    });
}

function panelNames(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        (document.querySelector("perspective-viewer")! as any).getPanelNames(),
    );
}

async function terminate(page: Page) {
    await page.evaluate(async () => {
        await window["__other__"].terminate();
    });
}

test.describe("Workspace panel clients", () => {
    test("a terminated client's section reports the loss unprompted", async ({
        page,
    }) => {
        await terminate(page);
        const lost = section(page, OTHER);
        await expect(lost).toHaveClass(/is-lost/);
        await expect(lost.locator(".ws-client-status")).toHaveClass(/errored/);
        await expect(lost.locator(".ws-client-error")).toBeVisible();
        await expect(lost.locator(".ws-client-reconnect")).toHaveCount(0);
        await expect(
            page.locator(
                "perspective-viewer #workspace_panel #status_reconnect",
            ),
        ).toHaveClass(/errored/);

        const open = section(page, TABLE);
        await expect(open).not.toHaveClass(/is-lost/);
        await expect(open.locator(".ws-client-status")).toHaveClass(
            /connected/,
        );
    });

    test("the other client still creates panels after a terminate", async ({
        page,
    }) => {
        await terminate(page);
        await expect(section(page, OTHER)).toHaveClass(/is-lost/);
        await row(page, OTHER).hover();
        await expect(row(page, OTHER).locator(".ws-table-new")).toHaveCount(0);

        const before = await panelNames(page);
        await row(page, TABLE).hover();
        await row(page, TABLE).locator(".ws-table-new").click();
        await expect
            .poll(async () => (await panelNames(page)).length)
            .toBe(before.length + 1);

        await expect(
            row(page, TABLE).locator(".ws-table-consumers"),
        ).toHaveText("2");

        const config = await saveWorkspace(page);
        expect(Object.keys(config.panels)).toHaveLength(before.length + 1);
    });

    test("a panel on the terminated client errors and the rest keep working", async ({
        page,
    }) => {
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.addPanel({ table });
        }, OTHER);

        await expect(
            section(page, OTHER).locator(".ws-client-panels"),
        ).toHaveText("1");

        await terminate(page);
        await expect(section(page, OTHER)).toHaveClass(/is-lost/);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.addPanel({ table });
            await viewer.flush();
        }, TABLE);

        expect(await panelNames(page)).toHaveLength(3);
        await expect(
            section(page, TABLE).locator(".ws-client-status"),
        ).toHaveClass(/connected/);
    });

    test("the settings panel still toggles after a terminate", async ({
        page,
    }) => {
        await terminate(page);
        await expect(section(page, OTHER)).toHaveClass(/is-lost/);
        const settings = page.locator("perspective-viewer #settings_panel");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.toggleConfig(false);
        });

        await expect(settings).toHaveCount(0);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.toggleConfig(true);
        });

        await expect(settings).toBeVisible();
    });
});
