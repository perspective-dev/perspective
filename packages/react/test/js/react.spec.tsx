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

import { test, expect } from "@playwright/experimental-ct-react";

import { App } from "./basic.story";
import { EmptyWorkspace, SingleView } from "./workspace.story";

test.describe("Perspective React", () => {
    test("The viewer loads with data in it", async ({ page, mount }) => {
        const comp = await mount(<App></App>);
        const count = await page.evaluate(async () => {
            await new Promise((x) => setTimeout(x, 1000));
            return document.querySelectorAll("perspective-viewer").length;
        });

        expect(count).toBe(2);
    });

    test("React workspace functionality", async ({ page, mount }) => {
        const comp = await mount(<EmptyWorkspace />);
        const toggleMount = comp.locator("button.toggle-mount");
        const addViewer = comp.locator("button.add-viewer");
        const workspace = comp.locator("perspective-workspace");
        const viewer = comp.locator("perspective-viewer");
        await toggleMount.waitFor();
        await addViewer.click();
        await addViewer.click();
        await addViewer.click();
        await page.waitForFunction(
            () =>
                document.querySelector("perspective-workspace")!.children
                    .length === 3,
        );

        await expect(viewer).toHaveCount(3);
        await toggleMount.click();
        await workspace.waitFor({ state: "detached" });

        // TODO: This test gets stuck in CI
        await page.waitForTimeout(10);
        await toggleMount.click();
        await workspace.waitFor();
        await page.waitForFunction(
            () =>
                document.querySelector("perspective-workspace")!.children
                    .length === 3,
        );
        await expect(viewer).toHaveCount(3);
    });

    test("Adding a viewer in single-document mode leaves SDM", async ({
        page,
        mount,
    }) => {
        const name = "abcdef";
        const comp = await mount(<SingleView name={name} />);
        const addViewer = comp.locator("button.add-viewer");
        const viewer = comp.locator("perspective-viewer");
        const settingsBtn = comp.locator(`perspective-viewer #settings_button`);

        await settingsBtn.waitFor();
        await addViewer.waitFor();
        await addViewer.click();
        await page.waitForFunction(
            () =>
                document.querySelector("perspective-workspace")!.children
                    .length === 2,
        );

        expect(await viewer.count()).toBe(2);
        await settingsBtn.first().click();
        const settingsPanel = viewer.locator("#settings_panel");
        await settingsPanel.waitFor();
        await addViewer.click();
        await page.waitForFunction(
            () =>
                document.querySelector("perspective-workspace")!.children
                    .length === 3,
        );
        expect(await viewer.count()).toBe(3);
        await settingsPanel.waitFor({ state: "detached" });
    });
});
