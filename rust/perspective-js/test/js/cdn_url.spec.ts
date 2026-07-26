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

import { test, expect } from "@perspective-dev/test";
import { resolve_server_wasm_url } from "../../src/ts/wasm/cdn.ts";

test.describe("resolve_server_wasm_url", function () {
    test("preserves exact version tags on jsdelivr URLs", function () {
        expect(
            resolve_server_wasm_url(
                "https://cdn.jsdelivr.net/npm/@perspective-dev/client@4.5.1/dist/cdn/perspective.js",
            ),
        ).toEqual(
            "https://cdn.jsdelivr.net/npm/@perspective-dev/server@4.5.1/dist/wasm/perspective-server.wasm",
        );
    });

    test("preserves range and dist-tag aliases", function () {
        expect(
            resolve_server_wasm_url(
                "https://cdn.jsdelivr.net/npm/@perspective-dev/client@4/dist/cdn/perspective.js",
            ),
        ).toEqual(
            "https://cdn.jsdelivr.net/npm/@perspective-dev/server@4/dist/wasm/perspective-server.wasm",
        );

        expect(
            resolve_server_wasm_url(
                "https://cdn.jsdelivr.net/npm/@perspective-dev/client@latest/dist/cdn/perspective.js",
            ),
        ).toEqual(
            "https://cdn.jsdelivr.net/npm/@perspective-dev/server@latest/dist/wasm/perspective-server.wasm",
        );
    });

    test("resolves alternate binaries with the version tag preserved", function () {
        expect(
            resolve_server_wasm_url(
                "https://cdn.jsdelivr.net/npm/@perspective-dev/client@4.5.1/dist/cdn/perspective.js",
                "perspective-server.memory64.wasm",
            ),
        ).toEqual(
            "https://cdn.jsdelivr.net/npm/@perspective-dev/server@4.5.1/dist/wasm/perspective-server.memory64.wasm",
        );

        expect(
            resolve_server_wasm_url(
                "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js",
                "perspective-server.memory64.wasm",
            ),
        ).toEqual(
            "http://localhost:6598/node_modules/@perspective-dev/server/dist/wasm/perspective-server.memory64.wasm",
        );
    });

    test("preserves version tags on unpkg URLs", function () {
        expect(
            resolve_server_wasm_url(
                "https://unpkg.com/@perspective-dev/client@4.5.1/dist/cdn/perspective.js",
            ),
        ).toEqual(
            "https://unpkg.com/@perspective-dev/server@4.5.1/dist/wasm/perspective-server.wasm",
        );
    });

    test("resolves untagged node_modules layouts to the sibling package", function () {
        expect(
            resolve_server_wasm_url(
                "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js",
            ),
        ).toEqual(
            "http://localhost:6598/node_modules/@perspective-dev/server/dist/wasm/perspective-server.wasm",
        );
    });

    test("matches minified and query-string variants", function () {
        expect(
            resolve_server_wasm_url(
                "https://cdn.jsdelivr.net/npm/@perspective-dev/client@4.5.1/dist/cdn/perspective.min.js?v=1",
            ),
        ).toEqual(
            "https://cdn.jsdelivr.net/npm/@perspective-dev/server@4.5.1/dist/wasm/perspective-server.wasm",
        );
    });

    test("falls back to relative resolution for unrecognized layouts", function () {
        expect(
            resolve_server_wasm_url(
                "https://example.com/assets/perspective.js",
            ),
        ).toEqual(
            "https://example.com/server/dist/wasm/perspective-server.wasm",
        );
    });
});
