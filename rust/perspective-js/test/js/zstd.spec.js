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
import perspective from "./perspective_client";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import * as fs from "node:fs";

const superstore_uncompressed = fs.readFileSync(
    require.resolve("superstore-arrow/superstore.arrow"),
).buffer;

test.describe("Arrow IPC", function () {
    test.describe("to_arrow() zstd", function () {
        test("to_arrow() zstd is smaller and round-trips", async () => {
            let table = await perspective.table(
                superstore_uncompressed.slice(),
            );
            let view = await table.view();
            const json = await view.to_json();
            const lz4 = await view.to_arrow({ compression: "lz4" });
            const arr = await view.to_arrow({ compression: "zstd" });
            expect(arr.byteLength).toBeLessThan(
                superstore_uncompressed.byteLength,
            );
            expect(arr.byteLength).toBeLessThan(lz4.byteLength);
            expect(Buffer.from(arr).equals(Buffer.from(lz4))).toBe(false);
            view.delete();
            table.delete();

            table = await perspective.table(arr);
            view = await table.view();
            expect(await view.to_json()).toEqual(json);
            const arr2 = await view.to_arrow({ compression: undefined });
            expect(arr2.byteLength).toBeGreaterThan(arr.byteLength);
            view.delete();
            table.delete();
        });

        test("to_arrow() rejects an unknown compression", async () => {
            const table = await perspective.table(
                superstore_uncompressed.slice(),
            );
            const view = await table.view();
            await expect(
                view.to_arrow({ compression: "gzip" }),
            ).rejects.toThrow(/compression/);
            view.delete();
            table.delete();
        });
    });
});
