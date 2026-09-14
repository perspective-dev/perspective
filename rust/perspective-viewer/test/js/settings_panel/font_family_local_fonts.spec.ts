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
import type { Locator, Page } from "@playwright/test";

type Access = "prompt" | "granted" | "denied" | "unsupported";

const STUB_FAMILIES = ["Stub Sans", "Stub Mono"];
const GENERIC = ["inherit", "monospace", "sans-serif", "serif", "system-ui"];

type Answer = "allow" | "dismiss" | "block";

async function install_local_fonts_stub(
    page: Page,
    state: Access,
    answer: Answer = "allow",
) {
    await page.addInitScript(
        ({ state, answer }: { state: Access; answer: Answer }) => {
            const w = window as any;
            const stub = {
                state,
                calls: 0,
                status: { onchange: null as null | (() => void) },
            };

            Object.defineProperty(stub.status, "state", {
                get: () => stub.state,
            });

            w.__local_fonts_stub__ = stub;
            if (state === "unsupported") {
                Object.defineProperty(window, "queryLocalFonts", {
                    configurable: true,
                    value: undefined,
                });
                return;
            }

            Object.defineProperty(navigator, "permissions", {
                configurable: true,
                value: {
                    query: async (desc: { name?: string }) => {
                        if (desc?.name !== "local-fonts") {
                            throw new TypeError("unsupported permission");
                        }

                        return stub.status;
                    },
                },
            });

            Object.defineProperty(window, "queryLocalFonts", {
                configurable: true,
                value: async () => {
                    stub.calls += 1;
                    if (stub.state === "denied") {
                        return [];
                    }

                    if (stub.state === "prompt" && answer !== "allow") {
                        stub.state = answer === "block" ? "denied" : "prompt";
                        return [];
                    }

                    stub.state = "granted";
                    return [
                        { family: "Stub Sans" },
                        { family: "Stub Mono" },
                        { family: "Stub Sans" },
                    ];
                },
            });
        },
        { state, answer },
    );
}

async function goto_ready(page: Page) {
    await page.goto("/rust/perspective-viewer/test/html/superstore-all.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function open_font_control(
    page: Page,
    state: Access,
    config = {},
    answer: Answer = "allow",
) {
    await install_local_fonts_stub(page, state, answer);
    await goto_ready(page);
    const view = new PageView(page);
    await view.restore({ settings: true, plugin: "Datagrid", ...config });
    await view.container.locator("#plugin_tabbar_tab").click();
    const tab = view.container.locator("#plugin-tab");
    await tab.waitFor({ state: "visible" });
    await tab.locator("#font_family-label").waitFor({ state: "visible" });
    return { view, tab };
}

function font_select(tab: Locator): Locator {
    return tab.locator("#font_family-label + div select");
}

function request_button(tab: Locator): Locator {
    return tab.locator("#request-local-fonts");
}

async function option_values(select: Locator): Promise<string[]> {
    return await select.evaluate((el: HTMLSelectElement) =>
        [...el.options].map((x) => x.value),
    );
}

async function stub_calls(page: Page): Promise<number> {
    return await page.evaluate(
        () => (window as any).__local_fonts_stub__.calls,
    );
}

test.describe("font_family control and Local Font Access", () => {
    test("prompt state shows the request button and no local families", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "prompt");
        await expect(request_button(tab)).toHaveCount(1);

        const values = await option_values(font_select(tab));
        expect(values.slice(0, GENERIC.length)).toEqual(GENERIC);
        for (const family of STUB_FAMILIES) {
            expect(values).not.toContain(family);
        }

        expect(await stub_calls(page)).toEqual(0);
    });

    test("clicking the request button queries fonts once and removes itself", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "prompt");
        await request_button(tab).click();
        await expect(request_button(tab)).toHaveCount(0);

        const values = await option_values(font_select(tab));
        for (const family of STUB_FAMILIES) {
            expect(values).toContain(family);
        }

        expect(await stub_calls(page)).toEqual(1);
    });

    test("a dismissed prompt that resolves empty keeps the button and the fallback list", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "prompt", {}, "dismiss");
        const before = await option_values(font_select(tab));
        expect(before.length).toBeGreaterThan(GENERIC.length);
        await request_button(tab).click();
        await expect.poll(async () => await stub_calls(page)).toEqual(1);
        await expect(request_button(tab)).toHaveCount(1);
        await expect(request_button(tab)).not.toHaveClass(/blocked/);
        expect(await option_values(font_select(tab))).toEqual(before);

        await request_button(tab).click();
        await expect.poll(async () => await stub_calls(page)).toEqual(2);
        await expect(request_button(tab)).toHaveCount(1);
    });

    test("a blocked prompt that resolves empty shows the hint and keeps the fallback list", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "prompt", {}, "block");
        const before = await option_values(font_select(tab));
        expect(before.length).toBeGreaterThan(GENERIC.length);
        await request_button(tab).click();
        await expect(request_button(tab)).toHaveClass(/blocked/);
        expect(await option_values(font_select(tab))).toEqual(before);
        expect(await stub_calls(page)).toEqual(1);
    });

    test("granted state lists local families without a button", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "granted");
        await expect(request_button(tab)).toHaveCount(0);

        await expect
            .poll(async () => await option_values(font_select(tab)))
            .toEqual([...GENERIC, "Stub Mono", "Stub Sans"]);
    });

    test("denied state shows an inert blocked hint and no local families", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "denied");
        await expect(request_button(tab)).toHaveCount(1);
        await expect(request_button(tab)).toHaveClass(/blocked/);
        await request_button(tab).click();

        const values = await option_values(font_select(tab));
        expect(values.slice(0, GENERIC.length)).toEqual(GENERIC);
        for (const family of STUB_FAMILIES) {
            expect(values).not.toContain(family);
        }

        expect(await stub_calls(page)).toEqual(0);
        await page.evaluate(() => {
            const stub = (window as any).__local_fonts_stub__;
            stub.state = "granted";
            stub.status.onchange?.();
        });

        await expect(request_button(tab)).toHaveCount(0);
        await expect
            .poll(async () => await option_values(font_select(tab)))
            .toEqual([...GENERIC, "Stub Mono", "Stub Sans"]);
    });

    test("unsupported browser shows neither button nor local families", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "unsupported");
        await expect(request_button(tab)).toHaveCount(0);

        const values = await option_values(font_select(tab));
        expect(values.slice(0, GENERIC.length)).toEqual(GENERIC);
        for (const family of STUB_FAMILIES) {
            expect(values).not.toContain(family);
        }
    });

    test("a stored family absent from every list stays selectable and the default is stripped", async ({
        page,
    }) => {
        const { view, tab } = await open_font_control(page, "prompt", {
            plugin_config: { font_family: "Zapf Chancery" },
        });

        const select = font_select(tab);
        await expect(select).toHaveValue("Zapf Chancery");
        expect(await option_values(select)).toContain("Zapf Chancery");

        await view.restore({ plugin_config: { font_family: "inherit" } });
        const saved = await view.save();
        expect(saved.plugin_config).not.toHaveProperty("font_family");
    });

    test("a permission change event without a click updates the control", async ({
        page,
    }) => {
        const { tab } = await open_font_control(page, "prompt");
        await expect(request_button(tab)).toHaveCount(1);

        await page.evaluate(() => {
            const stub = (window as any).__local_fonts_stub__;
            stub.state = "granted";
            stub.status.onchange?.();
        });

        await expect(request_button(tab)).toHaveCount(0);
        await expect
            .poll(async () => await option_values(font_select(tab)))
            .toEqual([...GENERIC, "Stub Mono", "Stub Sans"]);
    });
});
