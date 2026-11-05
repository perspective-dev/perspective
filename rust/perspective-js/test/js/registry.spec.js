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

const HOST = "http://localhost:6598";
const CLIENT = `${HOST}/node_modules/@perspective-dev/client`;
const SERVER = `${HOST}/node_modules/@perspective-dev/server`;
const VIEWER = `${HOST}/node_modules/@perspective-dev/viewer`;

const URLS = {
    esm: `${CLIENT}/dist/esm/perspective.js`,
    cdn: `${CLIENT}/dist/cdn/perspective.js`,
    viewer_cdn: `${VIEWER}/dist/cdn/perspective-viewer.js`,
    client_wasm: `${CLIENT}/dist/wasm/perspective-js.wasm`,
    migrate_wasm: `${CLIENT}/dist/wasm/perspective-migrate.wasm`,
    wasm32: `${SERVER}/dist/wasm/perspective-server.wasm`,
    wasm64: `${SERVER}/dist/wasm/perspective-server.memory64.wasm`,
};

const V2_VIEW = {
    row_pivot: ["State"],
    expressions: ['//profit\n"Sales" - "Cost"'],
};

async function in_page(page, fn, args = {}) {
    await page.goto(`${CLIENT}/test/html/test.html`);
    return await page.evaluate(fn, { urls: URLS, ...args });
}

test.describe("wasm registry", () => {
    test("server thunk is deferred until the first worker()", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            const perspective = await import(urls.esm);
            const invoked = [];
            await perspective.init({
                client: fetch(urls.client_wasm),
                server: () => {
                    invoked.push("server");
                    return fetch(urls.wasm32);
                },
            });

            const before = [...invoked];
            const client = await perspective.worker();
            const table = await client.table({ x: [1, 2, 3] });
            return { before, after: invoked, size: await table.size() };
        });

        test.expect(result).toEqual({
            before: [],
            after: ["server"],
            size: 3,
        });
    });

    test("server32 / server64 invoke only the selected thunk", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            const perspective = await import(urls.esm);
            const has_wasm64 = (await fetch(urls.wasm64, { method: "HEAD" }))
                .ok;

            const supports_memory64 = perspective.host_supports_memory64();
            const invoked = [];
            await perspective.init({
                client: fetch(urls.client_wasm),
                server32: () => {
                    invoked.push("server32");
                    return fetch(urls.wasm32);
                },
                server64: () => {
                    invoked.push("server64");
                    return fetch(urls.wasm64);
                },
            });

            const client = await perspective.worker();
            const table = await client.table({ x: [1, 2, 3] });
            return {
                has_wasm64,
                supports_memory64,
                invoked,
                size: await table.size(),
            };
        });

        test.skip(
            result.supports_memory64 && !result.has_wasm64,
            "memory64 host but no wasm64 asset built (PSP_WASM64 not set)",
        );

        test.expect(result.size).toEqual(3);
        test.expect(result.invoked).toEqual([
            result.supports_memory64 ? "server64" : "server32",
        ]);
    });

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

    test("re-registering a resolved server throws", async ({ page }) => {
        const result = await in_page(page, async ({ urls }) => {
            const perspective = await import(urls.esm);
            await perspective.init({
                client: fetch(urls.client_wasm),
                server: fetch(urls.wasm32),
            });

            await perspective.worker();
            try {
                await perspective.init({ server32: fetch(urls.wasm32) });
                return "registered";
            } catch (e) {
                return e.message;
            }
        });

        test.expect(result).toContain("server32 wasm is already initialized");
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

    test("another version on the page imports, then rejects init()", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            globalThis[Symbol.for("@perspective-dev/wasm")] = new Map([
                ["0.0.0", { sources: {}, consumed: new Set() }],
            ]);

            const perspective = await import(urls.esm);
            try {
                await perspective.init({ server: fetch(urls.wasm32) });
                return "initialized";
            } catch (e) {
                return e.message;
            }
        });

        test.expect(result).toContain(
            "cannot share a page with Perspective 0.0.0",
        );
    });

    test("another version on the page leaves this version's worker() working", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            globalThis[Symbol.for("@perspective-dev/wasm")] = new Map([
                ["0.0.0", { sources: {}, consumed: new Set() }],
            ]);

            const perspective = await import(urls.cdn);
            const client = await perspective.worker();
            const table = await client.table({ x: [1, 2, 3] });
            return await table.size();
        });

        test.expect(result).toEqual(3);
    });

    test("the ESM build links the published registry module", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            const registry_url = urls.esm.replace(
                "perspective.js",
                "wasm/registry.js",
            );

            const text = async (url) => await (await fetch(url)).text();
            return {
                esm: (await text(urls.esm)).includes("cannot share a page"),
                registry: (await text(registry_url)).includes(
                    "cannot share a page",
                ),
                cdn: (await text(urls.cdn)).includes("cannot share a page"),
            };
        });

        test.expect(result).toEqual({ esm: false, registry: true, cdn: true });
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

    test("a user server registration survives the CDN defaults", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            const esm = await import(urls.esm);
            const invoked = [];
            await esm.init({
                client: fetch(urls.client_wasm),
                server: () => {
                    invoked.push("user");
                    return fetch(urls.wasm32);
                },
            });

            const cdn = await import(urls.cdn);
            const client = await cdn.default.worker();
            const table = await client.table({ x: [1, 2, 3] });
            return { invoked, size: await table.size() };
        });

        test.expect(result).toEqual({ invoked: ["user"], size: 3 });
    });

    test("server cannot be combined with server32 / server64", async ({
        page,
    }) => {
        const result = await in_page(page, async ({ urls }) => {
            const perspective = await import(urls.esm);
            const errors = [];
            try {
                await perspective.init({
                    server: fetch(urls.wasm32),
                    server32: fetch(urls.wasm32),
                });
            } catch (e) {
                errors.push(e.message);
            }

            await perspective.init({ server: fetch(urls.wasm32) });
            try {
                await perspective.init({ server64: fetch(urls.wasm64) });
            } catch (e) {
                errors.push(e.message);
            }

            return errors;
        });

        test.expect(result).toEqual([
            "`server` cannot be combined with `server32` or `server64`",
            "`server` cannot be combined with `server32` or `server64`",
        ]);
    });

    test("unknown keys are rejected", async ({ page }) => {
        const result = await in_page(page, async ({ urls }) => {
            const perspective = await import(urls.esm);
            try {
                await perspective.init({ wasm32: fetch(urls.wasm32) });
                return "registered";
            } catch (e) {
                return e.message;
            }
        });

        test.expect(result).toContain("Unknown perspective wasm key(s) wasm32");
    });
});
