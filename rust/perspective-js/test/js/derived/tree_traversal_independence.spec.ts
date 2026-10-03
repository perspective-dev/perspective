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
import { expect_tree_parity } from "./oracle.ts";
import { make_source, rows } from "./fixtures.ts";

test.describe("Derived table ignores presentation state", function () {
    test("parent sort is ignored", async function () {
        const source = await make_source();
        const config = {
            group_by: ["g", "h"],
            columns: ["x"],
            sort: [["x", "desc"]],
        };

        const view = await source.view(config);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, config, derived);
        await source.update(rows(6, 24));
        await expect_tree_parity(source, config, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("parent sort on a hidden column is not exposed", async function () {
        const source = await make_source();
        const config = {
            group_by: ["g"],
            columns: ["x"],
            sort: [["y", "desc"]],
        };

        const view = await source.view(config);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, config, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("collapsed parent rows are still present and updated", async function () {
        const source = await make_source();
        const config = { group_by: ["g", "h"], columns: ["x"] };
        const view = await source.view(config);
        await view.collapse(1);
        await view.collapse(0);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, config, derived);
        await source.update(rows(6, 24));
        await expect_tree_parity(source, config, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("set_depth on the parent changes nothing", async function () {
        const source = await make_source();
        const config = { group_by: ["g", "h"], columns: ["x"] };
        const view = await source.view(config);
        const derived = await perspective.table(view);
        await view.set_depth(0);
        await source.update(rows(6, 24));
        await expect_tree_parity(source, config, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
