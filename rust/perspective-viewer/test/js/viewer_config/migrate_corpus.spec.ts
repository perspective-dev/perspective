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
    "panel/5.6.1/settings_dropped.json",
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
            const { kind, input, from, output, steps } = corpus_case(name);
            const result = await page.evaluate(
                async ({ kind, input, from }) => {
                    const url =
                        "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
                    const viewer = await import(url);
                    return await viewer.default.migrate(kind, input, from);
                },
                { kind, input, from },
            );

            expect({ ...result.value, version: "CURRENT" }).toEqual(output);
            expect(result.steps).toEqual(steps);
        });

        test(`${name} output validates in the browser`, async ({ page }) => {
            const { kind, output } = corpus_case(name);
            const error = await page.evaluate(
                async ({ kind, output }) => {
                    const url =
                        "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
                    const viewer = await import(url);
                    try {
                        await viewer.default.validate(kind, output);
                        return null;
                    } catch (e) {
                        return `${e}`;
                    }
                },
                { kind, output },
            );

            expect(error).toBeNull();
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
                    const migrated = config.columns_config?.[column]?.[key];
                    if (
                        typeof value === "object" &&
                        value !== null &&
                        !Array.isArray(value)
                    ) {
                        expect(typeof migrated).toEqual("object");
                        expect(value).toEqual(
                            expect.objectContaining(migrated),
                        );
                    } else {
                        expect(migrated).toEqual(value);
                    }
                }
            }

            for (const [key, value] of Object.entries(
                saved.plugin_config ?? {},
            )) {
                expect(config.plugin_config?.[key]).toEqual(value);
            }
        });
    }

    test("the live viewer's save() validates strictly", async ({ page }) => {
        const error = await page.evaluate(async () => {
            const url =
                "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
            const module = await import(url);
            const viewer = document.querySelector("perspective-viewer")! as any;
            const token = await viewer.save();
            try {
                await module.default.validate("viewer", token, {
                    strict: true,
                });
                return null;
            } catch (e) {
                return `${e}`;
            }
        });

        expect(error).toBeNull();
    });

    test("validate rejects an unknown key with its reason", async ({
        page,
    }) => {
        const error = await page.evaluate(async () => {
            const url =
                "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
            const module = await import(url);
            try {
                await module.default.validate("viewer", { bogus: 1 });
                return null;
            } catch (e) {
                return `${e}`;
            }
        });

        expect(error).toContain("bogus");
    });

    test("create_validator migrates and validates synchronously", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const url =
                "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
            const module = await import(url);
            const validator = await module.default.create_validator();
            const viewer = document.querySelector("perspective-viewer")! as any;
            const token = await viewer.save();
            validator.validate("viewer", token, { strict: true });
            const { steps } = validator.migrate("viewer", token);
            try {
                validator.validate("viewer", { bogus: 1 });
                return { steps, error: null };
            } catch (e) {
                return { steps, error: `${e}` };
            }
        });

        expect(result.steps).toEqual([]);
        expect(result.error).toContain("bogus");
    });
});
