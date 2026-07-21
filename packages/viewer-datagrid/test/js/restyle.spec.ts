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

// Regression spec for `restyle()`: the datagrid caches theme-derived colors
// on its model at creation time, and `restyle()` used to be a no-op, so a
// theme change on a live viewer kept painting cells with the OLD theme's
// colors until something recreated the model. `restyle()` now re-reads the
// computed style into the model (and resets auto column sizes for the new
// theme's fonts, preserving user-set widths), and the host's follow-up
// `update()` repaints.

import { expect, test } from "@perspective-dev/test";

async function goto_ready(page: any) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }

        // `basic-test.html` loads only `pro.css` (= "Pro Light"); "Pro Dark"
        // is a separate stylesheet, without which a theme switch changes no
        // CSS at all.
        await new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href =
                "/node_modules/@perspective-dev/viewer/dist/css/pro-dark.css";
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    });
}

// The inline `color` a negative numeric cell was painted with, and the
// theme's `--psp-datagrid--neg-cell--color`, both normalized to the
// browser's canonical `rgb(...)` serialization for comparison.
async function read_neg_cell_color(page: any) {
    return await page.evaluate(async () => {
        const norm = (color: string) => {
            const el = document.createElement("div");
            el.style.color = color;
            document.body.appendChild(el);
            const out = getComputedStyle(el).color;
            el.remove();
            return out;
        };

        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const td = datagrid.regular_table.querySelector("tbody td");
        return {
            cell: norm(td.style.color),
            theme_var: norm(
                getComputedStyle(datagrid.regular_table)
                    .getPropertyValue("--psp-datagrid--neg-cell--color")
                    .trim(),
            ),
        };
    });
}

test.describe("Datagrid restyle()", () => {
    test("theme change repaints cells with the new theme's colors", async ({
        page,
    }) => {
        await goto_ready(page);

        // Only negative values visible, so every data cell is painted with
        // the neg-cell foreground color cached on the model.
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                theme: "Pro Light",
                columns: ["Profit"],
                filter: [["Profit", "<", 0]],
            });
        });

        const light = await read_neg_cell_color(page);
        expect(light.cell).toEqual(light.theme_var);

        await page.evaluate(async (theme: string) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme });
        }, "Pro Dark");

        const dark = await read_neg_cell_color(page);
        expect(dark.theme_var).not.toEqual(light.theme_var);
        expect(dark.cell).toEqual(dark.theme_var);

        // And back again — the model refresh is not one-shot.
        await page.evaluate(async (theme: string) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme });
        }, "Pro Light");

        const light2 = await read_neg_cell_color(page);
        expect(light2.cell).toEqual(light.theme_var);
    });

    // Asserted at the plugin level (`regular-table` override store +
    // `plugin.save()`) rather than through `viewer.save()`/`restore()`:
    // the host's schema-driven `plugin_config` bucket strips the `columns`
    // key on both sides (`update_plugin_config`'s `active_keys()` retain),
    // so column widths do not round-trip through the public viewer config
    // at all today — a pre-existing gap unrelated to `restyle()`.
    test("user-set column widths survive a theme change", async ({ page }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                theme: "Pro Light",
                columns: ["Profit"],
            });
            await viewer.flush();
            await new Promise((x) => setTimeout(x, 500));

            // The end state of a user column-resize drag.
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;
            datagrid.regular_table.restoreColumnSizes({ 0: 300 });
        });

        // A genuine theme change dispatches `restyle()`, whose
        // `resetAutoSize()` must preserve the user width via the
        // save/restore override bracket.
        await page.evaluate(async (theme: string) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ theme });
            await viewer.flush();
            await new Promise((x) => setTimeout(x, 500));
        }, "Pro Dark");

        const state = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;
            return {
                live: datagrid.regular_table.saveColumnSizes(),
                token: datagrid.save(),
                model_theme: datagrid.model._theme,
            };
        });

        expect(state.live).toEqual({ "0": 300 });
        expect(state.token.columns.Profit.column_size_override).toEqual(300);

        // Proof the restyle actually ran (the bracket was exercised, not
        // skipped): the model captured the new theme.
        expect(state.model_theme).toEqual('"Pro Dark"');
    });
});
