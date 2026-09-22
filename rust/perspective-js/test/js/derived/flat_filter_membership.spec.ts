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
import perspective from "../perspective_client.ts";
import { expect_flat_parity } from "./oracle.ts";
import { make_source } from "./fixtures.ts";

test.describe("Derived table membership follows the parent's filter", function () {
    test("a row updated into the filter appears", async function () {
        const source = await make_source();
        const view = await source.view({ filter: [["y", ">", 8]] });
        const derived = await perspective.table(view);
        const size = await derived.size();
        await source.update([{ id: 0, y: 10 }]);
        expect(await derived.size()).toEqual(size + 1);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a row updated out of the filter disappears", async function () {
        const source = await make_source();
        const view = await source.view({ filter: [["y", ">", 8]] });
        const derived = await perspective.table(view);
        const size = await derived.size();
        const inside = (await view.to_json())[0].id;
        await source.update([{ id: inside, y: 0 }]);
        expect(await derived.size()).toEqual(size - 1);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("removing a row outside the filter is a no-op", async function () {
        const source = await make_source();
        const view = await source.view({ filter: [["y", ">", 8]] });
        const derived = await perspective.table(view);
        const size = await derived.size();
        await source.remove([0]);
        expect(await derived.size()).toEqual(size);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("removing a row inside the filter removes it", async function () {
        const source = await make_source();
        const view = await source.view({ filter: [["y", ">", 8]] });
        const derived = await perspective.table(view);
        const inside = (await view.to_json())[0].id;
        await source.remove([inside]);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a filter on an expression column", async function () {
        const source = await make_source();
        const view = await source.view({
            expressions: { big: '"x" * 2' },
            filter: [["big", ">", 30]],
        });

        const derived = await perspective.table(view);
        await expect_flat_parity(view, derived);
        await source.update([
            { id: 0, x: 100 },
            { id: 23, x: 0 },
        ]);

        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
