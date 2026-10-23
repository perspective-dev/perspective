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

const V2_VIEW = {
    row_pivot: ["State"],
    expressions: ['//profit\n"Sales" - "Cost"'],
};

test.describe("migrate", function () {
    test("upgrades a 2.x engine config", async function () {
        const result = await perspective.migrate("view", V2_VIEW, "2.6.0");
        expect(result).toEqual({
            value: {
                group_by: ["State"],
                expressions: { profit: '"Sales" - "Cost"' },
            },
            notices: [],
            steps: ["view.v2_aliases", "view.expressions_map"],
        });
    });

    test("an upgraded config creates a view", async function () {
        const { value } = await perspective.migrate("view", V2_VIEW, "2.6.0");
        const table = await perspective.table({
            State: ["NY", "NJ"],
            Sales: [5, 7],
            Cost: [1, 2],
        });

        const view = await table.view(value);
        const columns = await view.to_columns();
        expect(columns.profit).toEqual([9, 5, 4]);
        await view.delete();
        await table.delete();
    });

    test("a token's own version overrides from_version", async function () {
        const { value, steps } = await perspective.migrate(
            "viewer",
            {
                version: "5.4.0",
                plugin: "Datagrid",
                columns_config: { Sales: { number_fg_mode: "bar" } },
            },
            "2.0.0",
        );

        expect(value.columns_config).toEqual({ Sales: { fg_mode: "bar" } });
        expect(steps).toEqual(["datagrid.mode_renames"]);
    });

    test("rejects an unknown kind", async function () {
        await expect(perspective.migrate("table", {})).rejects.toThrow(
            "Unknown config kind",
        );
    });

    test("names the step which rejected a config", async function () {
        await expect(
            perspective.migrate(
                "view",
                { row_pivot: ["a"], group_by: ["b"] },
                "2.0.0",
            ),
        ).rejects.toThrow("view.v2_aliases");
    });
});
