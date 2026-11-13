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

async function load(page) {
    await page.goto("/rust/perspective-viewer/test/html/blank.html");
    await page.waitForFunction(() => "WORKER" in window);
    const viewer = page.locator("perspective-viewer");
    await viewer.evaluate(async (viewer) => {
        const table = (await window.WORKER).table("a,b,c\n1,2,3\n4,5,6");
        await viewer.load(table);
        await viewer.flush();
    });

    return viewer;
}

async function stubClipboard(page) {
    await page.evaluate(() => {
        const log = { calls: 0, items: [] as { type: string; text: string }[] };
        (window as any).__CLIPBOARD__ = log;
        (navigator.clipboard as any).write = (items: ClipboardItem[]) => {
            log.calls++;
            return (async () => {
                for (const item of items) {
                    for (const type of item.types) {
                        const blob = await item.getType(type);
                        log.items.push({ type, text: await blob.text() });
                    }
                }
            })();
        };
    });
}

test.describe("Viewer Copy", () => {
    test("copy > starts the clipboard write synchronously within the call", async ({
        page,
    }) => {
        const viewer = await load(page);
        await stubClipboard(page);
        const calls = await viewer.evaluate(async (viewer) => {
            const copied = viewer.copy();
            const calls = (window as any).__CLIPBOARD__.calls;
            await copied;
            return calls;
        });

        expect(calls).toBe(1);
    });

    test("copy > defaults to CSV as text/plain and resolves after the write", async ({
        page,
    }) => {
        const viewer = await load(page);
        await stubClipboard(page);
        const items = await viewer.evaluate(async (viewer) => {
            await viewer.copy();
            return (window as any).__CLIPBOARD__.items;
        });

        expect(items).toEqual([
            { type: "text/plain", text: '"a","b","c"\n1,2,3\n4,5,6\n' },
        ]);
    });

    test("copy > rejects when the clipboard write is denied", async ({
        page,
    }) => {
        const viewer = await load(page);
        await page.evaluate(() => {
            (navigator.clipboard as any).write = () =>
                Promise.reject(
                    new DOMException(
                        "Write permission denied.",
                        "NotAllowedError",
                    ),
                );
        });

        const error = await viewer.evaluate((viewer) =>
            viewer.copy().then(
                () => null,
                (e) => ({ name: e.name, message: e.message }),
            ),
        );

        expect(error).toEqual({
            name: "NotAllowedError",
            message: "Write permission denied.",
        });
    });

    test("copy > rejects when the Clipboard API is unavailable", async ({
        page,
    }) => {
        const viewer = await load(page);
        await page.evaluate(() => {
            Object.defineProperty(navigator, "clipboard", {
                value: undefined,
                configurable: true,
            });
        });

        const message = await viewer.evaluate((viewer) =>
            viewer.copy().then(
                () => null,
                (e) => e.message,
            ),
        );

        expect(message).toBe("Clipboard API unavailable");
    });

    test("copy > rejects a selection method when nothing is selected", async ({
        page,
    }) => {
        const viewer = await load(page);
        await stubClipboard(page);
        const result = await viewer.evaluate(async (viewer) => {
            const message = await viewer.copy({ method: "csv-selected" }).then(
                () => null,
                (e) => e.message,
            );

            return { message, calls: (window as any).__CLIPBOARD__.calls };
        });

        expect(result).toEqual({ message: "Nothing is selected", calls: 0 });
    });

    test("copy > copies the selection as of the call", async ({ page }) => {
        const viewer = await load(page);
        await stubClipboard(page);
        const result = await viewer.evaluate(async (viewer) => {
            viewer.setSelection({ start_row: 0, end_row: 1 });
            const expected = await viewer.export({ method: "csv-selected" });
            const copied = viewer.copy({ method: "csv-selected" });
            viewer.setSelection(undefined);
            await copied;
            return {
                expected,
                copied: (window as any).__CLIPBOARD__.items.map((x) => x.text),
            };
        });

        expect(result.expected).toBe('"a","b","c"\n1,2,3\n');
        expect(result.copied).toEqual([result.expected]);
    });
});
