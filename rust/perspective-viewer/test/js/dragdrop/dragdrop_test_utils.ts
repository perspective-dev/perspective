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

import { Locator, Page } from "@playwright/test";

/** The draggable handle of the first visible inactive column. */
export const INACTIVE_DRAG =
    "#sub-columns .column-selector-column:not(.column-selector-column-hidden) .column-selector-draggable";

/** The draggable handle of the first active column. */
export const ACTIVE_DRAG =
    "#active-columns .column-selector-column .column-selector-draggable";

/** Returns the `#settings_panel` innerHTML from the viewer's shadow root. */
export async function getSettingsPanelContents(page: Page) {
    return page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        return viewer.shadowRoot!.querySelector("#settings_panel")!.innerHTML;
    });
}

/**
 * Initiates a real browser drag from `src` to `tgt` using mouse events, without
 * completing the drop. The drag is left in-flight so the caller can snapshot the
 * intermediate dragover UI state.
 */
export async function shadowDragOver(page: Page, src: Locator, tgt: Locator) {
    const srcBox = (await src.boundingBox())!;
    const tgtBox = (await tgt.boundingBox())!;
    const srcX = srcBox.x + srcBox.width / 2;
    const srcY = srcBox.y + srcBox.height / 2;
    const tgtX = tgtBox.x + tgtBox.width / 2;
    const tgtY = tgtBox.y + tgtBox.height / 2;

    await page.mouse.move(srcX, srcY);
    await page.mouse.down();

    // Small initial move to trigger the browser's drag-start threshold.
    await page.mouse.move(srcX + 5, srcY, { steps: 2 });

    // Move to the target center, generating dragenter + dragover events.
    await page.mouse.move(tgtX, tgtY, { steps: 10 });

    // Allow Yew to process events and re-render.
    await page.waitForTimeout(100);
}

/**
 * Initiates a real browser drag from `src`, optionally hovers over
 * `wrongTgt`, then presses Escape to cancel — firing `dragend` without a
 * `drop`.
 */
export async function shadowDragCancel(
    page: Page,
    src: Locator,
    wrongTgt: Locator | null = null,
) {
    const srcBox = (await src.boundingBox())!;
    const srcX = srcBox.x + srcBox.width / 2;
    const srcY = srcBox.y + srcBox.height / 2;

    await src.evaluate((el) => {
        window["dragend_resolvers"] = Promise.withResolvers();
        el.addEventListener("dragend", () => {
            window["dragend_resolvers"].resolve();
        });
    });

    await page.mouse.move(srcX, srcY);
    await page.mouse.down();
    await page.mouse.move(srcX + 5, srcY, { steps: 2 });

    if (wrongTgt) {
        const wrongBox = (await wrongTgt.boundingBox())!;
        await page.mouse.move(
            wrongBox.x + wrongBox.width / 2,
            wrongBox.y + wrongBox.height / 2,
            { steps: 10 },
        );
    }

    // Drag is a cruel mistress.
    await page.waitForTimeout(100);

    // Cancel the drag (fires dragend with no preceding drop).
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
        await window["dragend_resolvers"].promise;
    });
}

export async function shadowDragReleaseInGap(
    page: Page,
    src: Locator,
    overTgt: Locator,
    belowTgt: Locator,
) {
    const srcBox = (await src.boundingBox())!;
    const overBox = (await overTgt.boundingBox())!;
    const belowBox = (await belowTgt.boundingBox())!;
    const gapTop = overBox.y + overBox.height;
    const gap = belowBox.y - gapTop;
    if (gap <= 0) {
        throw new Error(`No vertical gap between drop targets (${gap}px)`);
    }

    await src.evaluate((el) => {
        window["dragend_resolvers"] = Promise.withResolvers();
        el.addEventListener("dragend", () => {
            window["dragend_resolvers"].resolve();
        });
    });

    await page.mouse.move(
        srcBox.x + srcBox.width / 2,
        srcBox.y + srcBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(srcBox.x + srcBox.width / 2 + 5, srcBox.y, {
        steps: 2,
    });

    const x = overBox.x + overBox.width / 2;
    await page.mouse.move(x, overBox.y + overBox.height / 2, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.move(x, gapTop + gap / 2, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.evaluate(async () => {
        await window["dragend_resolvers"].promise;
    });
}

export async function localDrag(page: any, source: any, target: any) {
    await source.dragTo(target, { steps: 100 });
}
