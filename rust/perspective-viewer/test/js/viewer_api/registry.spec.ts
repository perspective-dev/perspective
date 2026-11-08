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

import { test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

const HOST = "http://localhost:6598";
const CLIENT = `${HOST}/node_modules/@perspective-dev/client`;
const SERVER = `${HOST}/node_modules/@perspective-dev/server`;
const VIEWER = `${HOST}/node_modules/@perspective-dev/viewer`;

const URLS = {
    esm: `${CLIENT}/dist/esm/perspective.js`,
    viewer_cdn: `${VIEWER}/dist/cdn/perspective-viewer.js`,
    client_wasm: `${CLIENT}/dist/wasm/perspective-js.wasm`,
    migrate_wasm: `${CLIENT}/dist/wasm/perspective-migrate.wasm`,
    wasm32: `${SERVER}/dist/wasm/perspective-server.wasm`,
};

const V2_VIEW = {
    row_pivot: ["State"],
    expressions: ['//profit\n"Sales" - "Cost"'],
};

async function in_page(
    page: Page,
    fn: (args: any) => Promise<any>,
    args: Record<string, unknown> = {},
) {
    await page.goto(`${CLIENT}/test/html/test.html`);
    return await page.evaluate(fn, { urls: URLS, ...args });
}

test.describe("wasm registry with the viewer on the page", () => {
    test("viewer backs every Client and the client thunk never runs", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            await import(urls.viewer_cdn);
            const perspective = await import(urls.esm);
            let client_invoked = false;
            await perspective.init({
                client: () => {
                    client_invoked = true;
                    return fetch(urls.client_wasm);
                },
                server: fetch(urls.wasm32),
            });

            const client = await perspective.worker();
            const table = await client.table({ x: [1, 2, 3] });
            const viewer = document.createElement("perspective-viewer");
            document.body.append(viewer);
            await viewer.load(table);
            const loaded = await viewer.getTable();
            return { client_invoked, size: await loaded.size() };
        });

        test.expect(result).toEqual({ client_invoked: false, size: 3 });
    });

    test("getCompiledClientWasm() resolves from a viewer-only page", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            await import(urls.viewer_cdn);
            const perspective = await import(urls.esm);
            const module = await perspective.getCompiledClientWasm();
            return module instanceof WebAssembly.Module;
        });

        test.expect(result).toEqual(true);
    });

    test("viewer after a client-wasm Client throws", async ({ page }) => {
        const result = await in_page(page, async ({ urls }) => {
            const perspective = await import(urls.esm);
            await perspective.init({
                client: fetch(urls.client_wasm),
                server: fetch(urls.wasm32),
            });

            await perspective.worker();
            try {
                await import(urls.viewer_cdn);
                return "registered";
            } catch (e) {
                return e.message;
            }
        });

        test.expect(result).toContain(
            "viewer wasm must be registered before any Client is created from client wasm",
        );
    });

    test("client and viewer migrate() share one download", async ({ page }) => {
        const result = await in_page(
            page,
            async ({ urls, config }) => {
                const perspective = await import(urls.esm);
                let downloads = 0;
                await perspective.init({
                    migrate: () => {
                        downloads += 1;
                        return fetch(urls.migrate_wasm);
                    },
                });

                const viewer = await import(urls.viewer_cdn);
                const a = await perspective.migrate("view", config, "2.6.0");
                const b = await viewer.default.migrate("view", config, "2.6.0");
                return {
                    downloads,
                    same: JSON.stringify(a) === JSON.stringify(b),
                };
            },
            { config: V2_VIEW },
        );

        test.expect(result).toEqual({ downloads: 1, same: true });
    });

    test("make_client() Clients load into the viewer", async ({ page }) => {
        const result = await in_page(page, async ({ urls }) => {
            await import(urls.viewer_cdn);
            const perspective = await import(urls.esm);
            await perspective.init({ server: fetch(urls.wasm32) });
            const local = await perspective.worker();
            await local.table({ x: [1, 2, 3] }, { name: "proxied" });
            let proxy_client;
            const session = local.new_proxy_session((bytes) =>
                proxy_client.handle_response(bytes),
            );

            proxy_client = await perspective.make_client(async (bytes) => {
                await session.handle_request(bytes.slice());
            });

            const table = await proxy_client.open_table("proxied");
            const viewer = document.createElement("perspective-viewer");
            document.body.append(viewer);
            await viewer.load(table);
            const loaded = await viewer.getTable();
            return await loaded.size();
        });

        test.expect(result).toEqual(3);
    });
});
