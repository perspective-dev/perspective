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

test.describe("to_csv", () => {
    test("0-sided view returns CSV string", async () => {
        const table = await perspective.table([
            { x: 1, y: "a" },
            { x: 2, y: "b" },
        ]);
        const view = await table.view();
        const csv = await view.to_csv();
        expect(csv).toEqual('"x","y"\n1,"a"\n2,"b"\n');
        view.delete();
        table.delete();
    });

    test("respects start_row/end_row viewport", async () => {
        const table = await perspective.table([
            { x: 1, y: "a" },
            { x: 2, y: "b" },
            { x: 3, y: "c" },
        ]);
        const view = await table.view();
        const csv = await view.to_csv({ start_row: 1, end_row: 2 });
        expect(csv).toEqual('"x","y"\n2,"b"\n');
        view.delete();
        table.delete();
    });

    test("1-sided view emits row paths", async () => {
        const table = await perspective.table([
            { x: 1, y: "a" },
            { x: 2, y: "a" },
            { x: 3, y: "b" },
        ]);
        const view = await table.view({ group_by: ["y"] });
        const csv = await view.to_csv();
        expect(csv).toEqual('"y","x","y (count)"\n,6,3\n"a",3,2\n"b",3,1\n');
        view.delete();
        table.delete();
    });

    test("1-sided view qualifies an aggregate of its key", async () => {
        const table = await perspective.table([
            { x: 1, y: "a" },
            { x: 2, y: "a" },
            { x: 3, y: "b" },
        ]);
        const view = await table.view({
            group_by: ["y"],
            columns: ["y", "x"],
            aggregates: { y: "distinct count" },
        });
        const csv = await view.to_csv();
        expect(csv).toEqual(
            '"y","y (distinct count)","x"\n,2,6\n"a",1,3\n"b",1,3\n',
        );
        view.delete();
        table.delete();
    });

    test("escapes quotes and commas in string values", async () => {
        const table = await perspective.table([
            { x: 'he said "hi"', y: "a,b" },
        ]);
        const view = await table.view();
        const csv = await view.to_csv();
        expect(csv).toEqual('"x","y"\n"he said ""hi""","a,b"\n');
        view.delete();
        table.delete();
    });

    // https://github.com/perspective-dev/perspective/issues/3152
    test("escapes utf8 in string values", async () => {
        const table = await perspective.table([
            {
                年月: "2023/01/01",
                轄區分局: "第四分局",
                路口名稱: "南屯區",
                路口名稱split: "五權西路與環中路口",
                A1: 0.0,
                A2: 3.0,
                A3: 130.0,
                總件數: 18.0,
                死亡人數: 0.0,
                受傷人數: null,
                主要肇因: "未注意車前狀態",
            },
            {
                年月: "2023/01/01",
                轄區分局: "第六分局",
                路口名稱: "西屯區",
                路口名稱split: "中清聯絡道與環中路口",
                A1: 0.0,
                A2: 2.0,
                A3: 100.0,
                總件數: 15.0,
                死亡人數: 0.0,
                受傷人數: null,
                主要肇因: "未注意車前狀態",
            },
        ]);

        const view = await table.view();
        const csv = await view.to_csv();
        expect(csv).toEqual(
            `"年月","轄區分局","路口名稱","路口名稱split","A1","A2","A3","總件數","死亡人數","主要肇因","受傷人數"\n2023-01-01,"第四分局","南屯區","五權西路與環中路口",0,3,130,18,0,"未注意車前狀態",\n2023-01-01,"第六分局","西屯區","中清聯絡道與環中路口",0,2,100,15,0,"未注意車前狀態",\n`,
        );

        view.delete();
        table.delete();
    });
});
