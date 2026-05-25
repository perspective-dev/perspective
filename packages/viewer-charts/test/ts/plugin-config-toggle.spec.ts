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

/**
 * Regression test for the blank-canvas bug on `plugin_config` toggle.
 *
 * Bug chain (all three required to reproduce):
 *   1. `RendererTransport.saveZoom` was `async` but never returned the
 *      pending-reply promise — every caller got `Promise<undefined>`.
 *   2. `plugin.save()` called it without `await` and stored the bare
 *      Promise as `state.zoom`. `JSON.stringify` collapses any Promise
 *      to `{}`.
 *   3. A later `plugin.restore(token)` with `token.zoom === {}` reached
 *      `ZoomController.restore({})`, which blindly assigned `undefined`
 *      to every internal field. `isDefault()` then returned false
 *      (`1 === undefined`) and `getVisibleDomain()` produced NaN on
 *      every axis, the projection matrix went NaN, every glyph
 *      projected off-screen, the canvas painted blank.
 *
 * Fix lives in three places — `ZoomController.restore` validates,
 * `saveZoom` returns the promise, `plugin.save` awaits it — and we want
 * the suite to fail if *any* of them regresses.
 *
 * Pixel-count assertion (not a screenshot snapshot): the bug produces
 * `plotPixels: 0` which is what `assertPlotNeverBlank` is built for, and
 * pixel counts don't drift across Chromium versions the way snapshots
 * do.
 */

import { test } from "@perspective-dev/test";
import {
    assertPlotNeverBlank,
    calibratePlotBaseline,
    captureFrames,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

/**
 * Half the calibrated quiescent pixel count — far above 0 (the blank-
 * canvas signature) and well below the steady-state baseline, so a
 * single skipped intermediate frame from RAF scheduling doesn't trip
 * the assertion. Frame-to-frame jitter on a healthy chart is ~1%
 * (see `frame-timing.spec.ts`).
 */
const BLANK_HEADROOM = 0.5;

test.describe("plugin_config toggle (regression)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    /**
     * Reproduces the user-visible symptom: toggling `series_zoom_mode`
     * via the wholesale-restore path that the dropdown UI ultimately
     * routes through. Fails pre-fix when the active plugin's bucket has
     * accumulated a malformed `zoom: {}` from a prior save round-trip,
     * because `plugin.restore` then calls `restoreZoom({})` and
     * corrupts the controller.
     */
    test("Y Line + datetime axis stays rendered across series_zoom_mode toggle", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Line",
            columns: ["Profit"],
            group_by: ["Order Date"],
        });

        const baseline = await calibratePlotBaseline(page);

        const frames = await captureFrames(page, async () => {
            await page.evaluate(async () => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                )! as unknown as { restore: (c: unknown) => Promise<void> };
                await viewer.restore({
                    plugin_config: { series_zoom_mode: "fixed" },
                });
                await viewer.restore({
                    plugin_config: { series_zoom_mode: "dynamic" },
                });
            });
            await waitOneFrame(page);
            await waitOneFrame(page);
        });

        assertPlotNeverBlank(frames, Math.floor(baseline * BLANK_HEADROOM));
    });
});
