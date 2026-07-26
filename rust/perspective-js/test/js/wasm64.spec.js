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

const URLS = {
    esm: `${CLIENT}/dist/esm/perspective.js`,
    client_wasm: `${CLIENT}/dist/wasm/perspective-js.wasm`,
    worker: `${CLIENT}/dist/cdn/perspective-server.worker.js`,
    wasm32: `${SERVER}/dist/wasm/perspective-server.wasm`,
    wasm64: `${SERVER}/dist/wasm/perspective-server.memory64.wasm`,
};

async function get_host_state(page) {
    await page.goto(`${CLIENT}/test/html/test.html`);
    return await page.evaluate(async (urls) => {
        const perspective = await import(urls.esm);
        const has_wasm64_asset = (await fetch(urls.wasm64, { method: "HEAD" }))
            .ok;

        return {
            supports_memory64: perspective.host_supports_memory64(),
            has_wasm64_asset,
        };
    }, URLS);
}

// Boots a real `worker()` in-page with instrumented server wasm sources and
// returns which thunks ran plus a table round-trip. `sources` values are
// "wasm32" | "wasm64" | "reject"; `sole` registers positionally.
async function boot_with_sources(page, sources) {
    await page.goto(`${CLIENT}/test/html/test.html`);
    return await page.evaluate(
        async ({ urls, sources }) => {
            const perspective = await import(urls.esm);
            perspective.init_client(fetch(urls.client_wasm));

            const invoked = [];
            const make_thunk = (slot, kind) => () => {
                invoked.push(slot);
                if (kind === "reject") {
                    return Promise.reject(
                        new Error(`intentional ${slot} failure`),
                    );
                }

                return fetch(urls[kind]);
            };

            const registration = {};
            for (const [slot, kind] of Object.entries(sources)) {
                registration[slot] = make_thunk(slot, kind);
            }

            perspective.init_server(registration);
            try {
                const client = await perspective.worker(
                    Promise.resolve(new Worker(urls.worker)),
                );

                const table = await client.table({ x: [1, 2, 3] });
                const size = await table.size();
                await table.delete();
                return { invoked, size };
            } catch (e) {
                return { invoked, error: e.message || String(e) };
            }
        },
        { urls: URLS, sources },
    );
}

test.describe("wasm64 selection", () => {
    test("host_supports_memory64 returns a boolean", async ({ page }) => {
        const state = await get_host_state(page);
        test.expect(typeof state.supports_memory64).toEqual("boolean");
    });

    test("dual registration selects by probe and never invokes the loser", async ({
        page,
    }) => {
        const state = await get_host_state(page);
        test.skip(
            state.supports_memory64 && !state.has_wasm64_asset,
            "memory64 host but no wasm64 asset built (PSP_WASM64 not set)",
        );

        const result = await boot_with_sources(page, {
            wasm32: "wasm32",
            wasm64: "wasm64",
        });

        test.expect(result.error).toBeUndefined();
        test.expect(result.size).toEqual(3);
        test.expect(result.invoked).toEqual([
            state.supports_memory64 ? "wasm64" : "wasm32",
        ]);
    });

    test("failing wasm64 source falls back to wasm32", async ({ page }) => {
        const state = await get_host_state(page);
        const result = await boot_with_sources(page, {
            wasm32: "wasm32",
            wasm64: "reject",
        });

        test.expect(result.error).toBeUndefined();
        test.expect(result.size).toEqual(3);
        test.expect(result.invoked).toEqual(
            state.supports_memory64 ? ["wasm64", "wasm32"] : ["wasm32"],
        );
    });

    test("lone failing wasm64 registration fails loudly", async ({ page }) => {
        const result = await boot_with_sources(page, { wasm64: "reject" });
        test.expect(result.invoked).toEqual(["wasm64"]);
        test.expect(result.error).toContain("intentional wasm64 failure");
    });

    test("lone wasm64 registration boots the memory64 engine", async ({
        page,
    }) => {
        const state = await get_host_state(page);
        test.skip(
            !state.supports_memory64,
            "host does not support WebAssembly Memory64",
        );

        test.skip(
            !state.has_wasm64_asset,
            "no wasm64 asset built (PSP_WASM64 not set)",
        );

        const result = await boot_with_sources(page, { wasm64: "wasm64" });
        test.expect(result.error).toBeUndefined();
        test.expect(result.size).toEqual(3);
        test.expect(result.invoked).toEqual(["wasm64"]);
    });
});
