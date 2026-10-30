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

import { test, expect } from "../helpers.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORPUS = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../perspective-migrate/corpus",
);

const CASES = [
    "viewer/2.6.0/xy_scatter_symbol_list.json",
    "viewer/2.7.1/datagrid.json",
    "viewer/2.7.1/xy_scatter.json",
    "viewer/2.10.0/datagrid_editable.json",
    "viewer/4.4.1/d3fc_y_bar.json",
    "viewer/5.2.0/datagrid_sizes_and_colors.json",
    "viewer/5.4.0/datagrid_formats.json",
];

const HOST_KEYS = ["version", "table", "theme", "settings"];

function corpus_case(name: string): Record<string, any> {
    return JSON.parse(fs.readFileSync(path.join(CORPUS, name), "utf8"));
}

function migrated(name: string): Record<string, any> {
    const output = { ...corpus_case(name).output };
    for (const key of HOST_KEYS) {
        delete output[key];
    }

    return output;
}

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-all.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("perspective-migrate corpus", () => {
    for (const name of CASES) {
        test(`${name} migrates in the browser to its corpus output`, async ({
            page,
        }) => {
            const { input, from, output, steps } = corpus_case(name);
            const result = await page.evaluate(
                async ({ input, from }) => {
                    const url =
                        "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
                    const viewer = await import(url);
                    return await viewer.default.migrate("viewer", input, from);
                },
                { input, from },
            );

            expect({ ...result.value, version: "CURRENT" }).toEqual(output);
            expect(result.steps).toEqual(steps);
        });

        test(`${name} restores into the current viewer`, async ({ page }) => {
            const config = migrated(name);
            const saved = await page.evaluate(async (config) => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                )! as any;
                await viewer.restore(config);
                return await viewer.save();
            }, config);

            for (const key of [
                "plugin",
                "columns",
                "group_by",
                "split_by",
                "expressions",
                "aggregates",
            ]) {
                if (key in config) {
                    expect(saved[key]).toEqual(config[key]);
                }
            }

            for (const [column, style] of Object.entries<any>(
                saved.columns_config ?? {},
            )) {
                for (const [key, value] of Object.entries(style)) {
                    expect(config.columns_config?.[column]?.[key]).toEqual(
                        value,
                    );
                }
            }

            for (const [key, value] of Object.entries(
                saved.plugin_config ?? {},
            )) {
                expect(config.plugin_config?.[key]).toEqual(value);
            }
        });
    }
});
