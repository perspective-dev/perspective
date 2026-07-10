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
import perspective from "../perspective_client";

const JAN_1_2024_UTC = 1704067200000;

test.describe("Date timezone invariance", function () {
    let SAVED_TZ: string | undefined;

    test.beforeEach(() => {
        SAVED_TZ = process.env.TZ;
        process.env.TZ = "Europe/Amsterdam";
    });

    test.afterEach(() => {
        process.env.TZ = SAVED_TZ;
    });

    test("date strings serialize to UTC midnight epoch ms", async function () {
        const table = await perspective.table({ d: "date" });
        await table.update({ d: ["2024-01-01"] });
        const view = await table.view();
        const cols = (await view.to_columns()) as { d: number[] };
        expect(cols.d).toEqual([JAN_1_2024_UTC]);
        await view.delete();
        await table.delete();
    });

    test("date epoch ms input round-trips exactly", async function () {
        const table = await perspective.table({ d: "date" });
        await table.update({ d: [JAN_1_2024_UTC] });
        const view = await table.view();
        const cols = (await view.to_columns()) as { d: number[] };
        expect(cols.d).toEqual([JAN_1_2024_UTC]);
        await view.delete();
        await table.delete();
    });

    test("formatted output prints the stored calendar day", async function () {
        const table = await perspective.table({ d: "date" });
        await table.update({ d: ["2024-01-01"] });
        const view = await table.view();
        expect(await view.to_columns_string({ formatted: true })).toEqual(
            '{"d":["2024-01-01"]}',
        );
        expect(await view.to_csv()).toEqual('"d"\n2024-01-01\n');
        await view.delete();
        await table.delete();
    });

    test("day_bucket stays on the UTC calendar day at the day boundary", async function () {
        const table = await perspective.table({ t: "datetime" });

        // 23:59 UTC is already the next day in Europe/Amsterdam
        await table.update({ t: ["2020-01-31 23:59:00"] });
        const view = await table.view({
            expressions: { bucket: `bucket("t", 'D')` },
        });

        const cols = (await view.to_columns()) as { bucket: number[] };

        // 2020-01-31T00:00:00Z
        expect(cols.bucket).toEqual([1580428800000]);
        await view.delete();
        await table.delete();
    });

    test("day_of_week and hour_of_day compute in UTC", async function () {
        const table = await perspective.table({ t: "datetime" });
        await table.update({ t: ["2020-01-31 23:59:00"] });
        const view = await table.view({
            expressions: {
                dow: `day_of_week("t")`,
                hod: `hour_of_day("t")`,
            },
        });

        const cols = (await view.to_columns()) as {
            dow: string[];
            hod: number[];
        };

        // Friday 23:00 UTC, not Saturday 00:59 Amsterdam
        expect(cols.dow).toEqual(["6 Friday"]);
        expect(cols.hod).toEqual([23]);
        await view.delete();
        await table.delete();
    });

    test("JSON date output agrees with Arrow date32 day arithmetic", async function () {
        const table = await perspective.table({ d: "date" });
        await table.update({ d: ["2024-01-01"] });
        const view = await table.view();
        const cols = (await view.to_columns()) as { d: number[] };
        expect(cols.d[0] % 86400000).toEqual(0);
        expect(cols.d[0] / 86400000).toEqual(19723); // days since epoch
        await view.delete();
        await table.delete();
    });
});
