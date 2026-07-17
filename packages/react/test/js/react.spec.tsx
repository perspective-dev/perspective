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
        const workspace = comp.locator("perspective-viewer");
        await toggleMount.waitFor();
        await addViewer.click();
        await addViewer.click();
        await addViewer.click();
        await page.waitForFunction(
            (expected) =>
                (
                    document.querySelector("perspective-viewer") as any
                )?.getPanelNames?.().length === expected,
            3,
        );

        await toggleMount.click();
        await workspace.waitFor({ state: "detached" });

        // TODO: This test gets stuck in CI
        await page.waitForTimeout(10);
        await toggleMount.click();
        await workspace.waitFor();
        await page.waitForFunction(
            (expected) =>
                (
                    document.querySelector("perspective-viewer") as any
                )?.getPanelNames?.().length === expected,
            3,
        );
    });

    test("Adding a panel to a lone-panel viewer", async ({ page, mount }) => {
        const name = "abcdef";
        const comp = await mount(<SingleView name={name} />);
        const addViewer = comp.locator("button.add-viewer");
        const settingsBtn = comp.locator(`perspective-viewer #settings_button`);

        await settingsBtn.waitFor();
        await addViewer.waitFor();
        await addViewer.click();
        await page.waitForFunction(
            (expected) =>
                (
                    document.querySelector("perspective-viewer") as any
                )?.getPanelNames?.().length === expected,
            2,
        );

        await addViewer.click();
        await page.waitForFunction(
            (expected) =>
                (
                    document.querySelector("perspective-viewer") as any
                )?.getPanelNames?.().length === expected,
            3,
        );
    });
});
