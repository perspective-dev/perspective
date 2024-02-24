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

import { test, expect } from "@finos/perspective-test";
import perspective from "@finos/perspective";
import { test_null_arrow } from "./test_arrows.js";

const arrow_psp_internal_schema = [
    9, 10, 1, 2, 3, 4, 11, 19, 19, 12, 12, 12, 2,
];

((perspective) => {
    test.describe("Internal API", function () {
        test("is actually using the correct runtime", async function () {
            // Get the internal module;
            if (perspective.sync_module) {
                perspective = await perspective.sync_module();
            }

            expect(perspective.__module__.wasmJSMethod).toEqual("native-wasm");
        });

        test("Arrow schema types are mapped correctly", async function () {
            // This only works for non parallel
            if (perspective.sync_module) {
                perspective = await perspective.sync_module();
            }

            var table = await perspective.table(test_null_arrow.slice());
            let schema, stypes;
            let types = [];
            try {
                schema = table._Table.get_schema();
                stypes = schema.types();

                for (let i = 0; i < stypes.size(); i++) {
                    types.push(stypes.get(i).value);
                }
                expect(types).toEqual(arrow_psp_internal_schema);
            } finally {
                if (schema) {
                    schema.delete();
                }
                if (stypes) {
                    stypes.delete();
                }
            }
            table.delete();
        });
    });
})(perspective);
