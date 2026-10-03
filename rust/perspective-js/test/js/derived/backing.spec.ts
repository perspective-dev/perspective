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
import perspective from "../perspective_client.ts";
import { expect_flat_parity, expect_tree_parity } from "./oracle.ts";
import { SCHEMA, rows } from "./fixtures.ts";

const TREE = {
    group_by: ["g", "h"],
    columns: ["x", "y", "h"],
    aggregates: { x: "sum", y: "mean", h: "last" },
};

test.describe("Derived tables over a disk-backed source", function () {
    test("group_by parent", async function () {
        const source = await perspective.table(SCHEMA, {
            index: "id",
            page_to_disk: true,
        });

        await source.update(rows(24));
        const view = await source.view(TREE);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, TREE, derived, view);
        await source.update(rows(12, 18));
        await source.remove([0, 1, 2]);
        await expect_tree_parity(source, TREE, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("flat parent", async function () {
        const source = await perspective.table(SCHEMA, {
            index: "id",
            page_to_disk: true,
        });

        await source.update(rows(24));
        const view = await source.view({
            expressions: { double: '"x" * 2' },
            filter: [["y", ">", 3]],
        });

        const derived = await perspective.table(view);
        await expect_flat_parity(view, derived);
        await source.update(rows(12, 18));
        await source.update([{ id: 0, y: 11 }]);
        await source.remove([5]);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
