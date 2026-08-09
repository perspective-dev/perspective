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
import { describeDuckDB } from "./setup.js";

describeDuckDB("coerce_types", (getClient) => {
    test("schema maps every type", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        expect(await table.schema()).toEqual({
            tiny: "integer",
            small: "integer",
            utiny: "integer",
            usmall: "integer",
            uint: "float",
            ubig: "float",
            big: "float",
            float: "float",
            decimal: "float",
            time: "datetime",
            timestamp: "datetime",
            date: "date",
            enum: "string",
            string: "string",
        });
    });

    test("narrow integers, flat", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({
            columns: ["tiny", "small", "utiny", "usmall"],
        });

        expect(await view.to_json()).toEqual([
            { tiny: -1, small: -300, utiny: 255, usmall: 65535 },
            { tiny: 1, small: 300, utiny: 0, usmall: 0 },
        ]);

        await view.delete();
    });

    test("wide and fractional numbers, flat", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({
            columns: ["uint", "ubig", "big", "float", "decimal"],
        });

        const json = await view.to_json();
        expect(json[0].uint).toEqual(4294967295);
        expect(json[0].ubig).toEqual(9007199254740992);
        expect(json[0].big).toEqual(9007199254740992);
        expect(json[0].float).toEqual(1.5);
        expect(json[0].decimal).toBeCloseTo(1.234, 6);
        expect(json[1].big).toEqual(-9007199254740992);
        expect(json[1].decimal).toBeCloseTo(-5.678, 6);
        await view.delete();
    });

    test("temporal types, flat", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({
            columns: ["time", "timestamp", "date"],
        });

        expect(await view.to_json()).toEqual([
            { time: 3661000, timestamp: 1672531200000, date: 1672531200000 },
            { time: 1000, timestamp: 1672617600000, date: 1672617600000 },
        ]);

        await view.delete();
    });

    test("dictionary-encoded ENUM, flat", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({ columns: ["enum", "string"] });
        expect(await view.to_json()).toEqual([
            { enum: "happy", string: "a" },
            { enum: "sad", string: "b" },
        ]);

        await view.delete();
    });

    test("dictionary-encoded ENUM, grouped", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({
            group_by: ["enum"],
            columns: ["tiny"],
            aggregates: { tiny: "sum" },
        });

        expect(await view.to_json()).toEqual([
            { __ROW_PATH__: [], tiny: 0 },
            { __ROW_PATH__: ["happy"], tiny: -1 },
            { __ROW_PATH__: ["sad"], tiny: 1 },
        ]);

        await view.delete();
    });

    test("DECIMAL row path is a number, not a debug string", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({
            group_by: ["decimal"],
            columns: ["tiny"],
            aggregates: { tiny: "sum" },
        });

        const json = await view.to_json();
        expect(json[0].__ROW_PATH__).toEqual([]);
        expect(json[1].__ROW_PATH__[0]).toBeCloseTo(-5.678, 6);
        expect(json[2].__ROW_PATH__[0]).toBeCloseTo(1.234, 6);
        await view.delete();
    });

    test("filter matching nothing is an empty view", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({
            columns: ["tiny"],
            filter: [["string", "==", "no such value"]],
        });

        expect(await view.to_json()).toEqual([]);
        expect(await view.to_columns()).toEqual({ tiny: [] });
        await view.delete();
    });

    test("column values query, no columns selected", async function () {
        const table = await getClient().open_table("memory.coerce_types");
        const view = await table.view({ group_by: ["enum"], columns: [] });
        const csv = await view.to_csv();
        expect(csv.split("\n").filter((x) => x.length > 0)).toEqual([
            "__ROW_PATH_0__",
            "null",
            '"happy"',
            '"sad"',
        ]);

        await view.delete();
    });
});
