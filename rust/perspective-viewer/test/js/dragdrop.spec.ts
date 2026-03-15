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

/**
 * Triggers an HTML5 drag-and-drop sequence between two elements inside the
 * viewer's shadow DOM and waits for the resulting `perspective-config-update`
 * event.  Returns the updated viewer config detail.
 *
 * The event listener is registered *before* the drag events are dispatched so
 * there is no race between the drag completing and the listener attaching.
 *
 * Key sequencing: the DragDrop state machine requires:
 *   dragstart → DragInProgress (set synchronously)
 *   dragenter on an active-column slot → DragOverInProgress
 *   drop on the container → drop_received PubSub emitted → config update
 *
 * Firing dragenter on the #active-columns container itself does NOT advance
 * the state (the container's dragenter handler is just a Safari workaround).
 * We must fire it on a [data-index] slot element inside the container.
 */
async function shadowDragAndDropWaitForConfig(
    page,
    originSelector: string,
    containerSelector: string,
) {
    return await page.evaluate(
        async ({ originSelector, containerSelector }) => {
            const viewer = document.querySelector("perspective-viewer")!;
            const shadow = viewer.shadowRoot!;

            const origin = shadow.querySelector(
                originSelector,
            ) as HTMLElement;
            const container = shadow.querySelector(
                containerSelector,
            ) as HTMLElement;

            if (!origin || !container) {
                throw new Error(
                    `Shadow selectors not found: ${originSelector}, ${containerSelector}`,
                );
            }

            // Register listener BEFORE the drag so we cannot miss the event.
            const configPromise = new Promise<any>((resolve) => {
                viewer.addEventListener(
                    "perspective-config-update",
                    (e: any) => resolve(e.detail),
                    { once: true },
                );
            });

            const dt = new DataTransfer();

            // 1. Start drag on the inactive column draggable handle.
            origin.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }),
            );

            // 2. Wait for requestAnimationFrame so notify_drag_start completes
            //    and DragInProgress state is fully set.
            await new Promise((r) => requestAnimationFrame(r));

            // 3. Fire dragenter on an active column slot ([data-index] element)
            //    inside the container.  This calls notify_drag_enter which
            //    transitions the state to DragOverInProgress – required for
            //    notify_drop to emit drop_received.
            const activeSlot = container.querySelector(
                "[data-index]",
            ) as HTMLElement | null;
            if (activeSlot) {
                activeSlot.dispatchEvent(
                    new DragEvent("dragenter", {
                        bubbles: true,
                        dataTransfer: dt,
                    }),
                );
                await new Promise((r) => requestAnimationFrame(r));
            }

            // 4. Drop on the container – notify_drop reads DragOverInProgress
            //    and emits drop_received.
            container.dispatchEvent(
                new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
            );

            // 5. End the drag.
            origin.dispatchEvent(
                new DragEvent("dragend", { bubbles: true, dataTransfer: dt }),
            );

            // Wait for perspective-config-update with a local timeout so the
            // test error message is more informative than the Playwright default.
            return await Promise.race([
                configPromise,
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () =>
                            reject(
                                new Error(
                                    "perspective-config-update timeout",
                                ),
                            ),
                        8000,
                    ),
                ),
            ]);
        },
        { originSelector, containerSelector },
    );
}

test.describe("Drag and drop", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore.html",
        );
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer!.getTable();
            await viewer!.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Sales", "Profit"],
            });
        });
    });

    test("dragging inactive column to active list adds the column", async ({
        page,
    }) => {
        // Drag the first inactive column into the active columns list and
        // wait for the config-update event.
        const config = await shadowDragAndDropWaitForConfig(
            page,
            "#sub-columns [data-index='0'] .column-selector-draggable",
            "#active-columns",
        );

        // The active column list should now be longer than the initial 2.
        expect(config.columns.length).toBeGreaterThan(2);
    });

    test("drag-and-drop preserves existing active columns", async ({
        page,
    }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer!.save();
        });

        // Original two active columns must still be present.
        expect(saved.columns).toContain("Sales");
        expect(saved.columns).toContain("Profit");
    });
});
