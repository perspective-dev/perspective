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

import {
    test,
    expect,
    PageView,
    compareContentsToSnapshot,
} from "../helpers.ts";

async function openSidebarAndScrollToBottom() {
    const elem = document.querySelector("perspective-viewer");
    await elem.getTable();
    await elem.toggleConfig(true);
    elem.shadowRoot.querySelector("#active-columns").scrollTop = 500;
}

async function checkSaveDisabled(page, expr) {
    let view = new PageView(page);
    let settingsPanel = await view.openSettingsPanel();
    await settingsPanel.createNewExpression("", expr, false);
}

test.beforeEach(async ({ page }) => {
    await page.goto(
        "/node_modules/@perspective-dev/viewer/test/html/superstore.html",
    );
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer").restore({
            plugin: "Debug",
        });
    });
});

const HIGHLIGHT_FIXTURES = {
    "numbers, operators and column names": [
        '"Sales" + 123',
        [
            ["column", '"Sales"'],
            ["whitespace", " "],
            ["operator", "+"],
            ["whitespace", " "],
            ["literal", "123"],
        ],
    ],
    "function symbols and string literals": [
        "concat('a', \"State\")",
        [
            ["symbol", "concat"],
            ["operator", "("],
            ["literal", "'a'"],
            ["operator", ","],
            ["whitespace", " "],
            ["column", '"State"'],
            ["operator", ")"],
        ],
    ],
    "a comment ends at the line break": [
        "// Title\n1 + 2",
        [
            ["comment", "// Title"],
            ["br"],
            ["literal", "1"],
            ["whitespace", " "],
            ["operator", "+"],
            ["whitespace", " "],
            ["literal", "2"],
        ],
    ],
    "an escaped character stays inside its string": [
        "'test\\/'",
        [["literal", "'test\\/'"]],
    ],
};

test.describe("Expressions", () => {
    for (const [name, [expr, tokens]] of Object.entries(HIGHLIGHT_FIXTURES)) {
        test(`editor > highlights ${name}`, async ({ page }) => {
            await page.evaluate(openSidebarAndScrollToBottom);
            await page.locator("perspective-viewer #add-expression").click();
            const container = page.locator(
                "perspective-viewer #editor-container",
            );

            await container.locator("textarea").fill(expr as string);
            await expect
                .poll(() =>
                    container.locator("#content").evaluate((content) =>
                        Array.from(content.children)
                            .filter(
                                (x) =>
                                    x.tagName === "BR" || x.textContent !== "",
                            )
                            .map((x) =>
                                x.tagName === "BR"
                                    ? ["br"]
                                    : [x.className, x.textContent],
                            ),
                    ),
                )
                .toEqual(tokens);
        });
    }

    test("editor > opens on add-column button click", async ({ page }) => {
        await page.evaluate(openSidebarAndScrollToBottom);

        await page.waitForFunction(
            () =>
                !!document
                    .querySelector("perspective-viewer")
                    .shadowRoot.querySelector("#add-expression"),
        );

        await page.locator("perspective-viewer #add-expression").click();

        await page.waitForFunction(() => {
            const root = document
                .querySelector("perspective-viewer")
                .shadowRoot.querySelector("#editor-container");

            return !!root;
        });

        const editor = await page.waitForFunction(async () => {
            const root = document
                .querySelector("perspective-viewer")
                .shadowRoot.querySelector("#editor-container");
            return root.querySelector("#content");
        });

        const contents = await editor.evaluate((x) => x.outerHTML);

        await page.evaluate(() => document.activeElement.blur());

        await compareContentsToSnapshot(contents);
    });

    test("editor > closes on close button click", async ({ page }) => {
        await page.evaluate(openSidebarAndScrollToBottom);
        await page.waitForFunction(
            () =>
                !!document
                    .querySelector("perspective-viewer")
                    .shadowRoot.querySelector("#add-expression"),
        );

        await page.locator("perspective-viewer #add-expression").click();
        await page.waitForSelector("#editor-container");
        await page.evaluate(async () => {
            let root = document.querySelector("perspective-viewer").shadowRoot;
            await root.querySelector("#column_settings_close_button").click();
        });

        await page.waitForSelector("#editor-container", {
            state: "hidden",
        });

        const contents = await page.evaluate(async () => {
            let root = document.querySelector("perspective-viewer").shadowRoot;
            return (
                root.querySelector("#editor-container")?.innerHTML || "MISSING"
            );
        });

        await compareContentsToSnapshot(contents);
    });

    test("validation > disables save for unknown symbols", async ({ page }) => {
        await checkSaveDisabled(page, "abc");
    });

    test("validation > disables save for type-invalid expression", async ({
        page,
    }) => {
        await checkSaveDisabled(page, '"Sales" + "Category";');
    });

    test("validation > disables save for invalid column references", async ({
        page,
    }) => {
        await checkSaveDisabled(page, '"aaaa" + "Sales";');
    });

    test("columns > shows both aliased and non-aliased expressions", async ({
        page,
    }) => {
        const contents = await page.evaluate(async () => {
            document.activeElement.blur();
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { "1 + 2": "1 + 2", abc: "3 + 4" },
            });
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    // No longer relevant as we cannot save a duplicate identifier
    test.skip("columns > overwrites a duplicate expression alias", async ({
        page,
    }) => {
        let view = new PageView(page);
        view.restore({ expressions: { "4 + 5": "3 + 4" } });

        await view.settingsPanel.createNewExpression("", "4 + 5", true);

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    // No longer relevant as we cannot save a duplicate identifier
    test.skip("columns > overwrites a duplicate expression", async ({
        page,
    }) => {
        let view = new PageView(page);
        view.restore({ expressions: { "3 + 4": "3 + 4" } });
        await view.settingsPanel.createNewExpression("", "3 + 4", true);

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("reset > deletes all expressions on full reset", async ({ page }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.reset(true);
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return (
                elem.shadowRoot.querySelector("#sub-columns")?.innerHTML ||
                "MISSING"
            );
        });

        await compareContentsToSnapshot(contents);
    });

    test("reset > preserves expressions on partial reset", async ({ page }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.reset(false);
        });

        const content = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(content);
    });

    test("reset > deletes expressions used in columns on full reset", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                columns: ["1 + 2"],
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.reset(true);
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return (
                elem.shadowRoot.querySelector("#sub-columns")?.innerHTML ||
                "MISSING"
            );
        });

        await compareContentsToSnapshot(contents);
    });

    test("reset > preserves expressions used in columns on partial reset", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                columns: ["1 + 2"],
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.reset(false);
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("reset > deletes expressions used in group_by/sort/filter on full reset", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                columns: ["1 + 2"],
                group_by: ["3 + 4"],
                sort: [["1 + 2", "asc"]],
                filter: [["1 + 2", "==", 3]],
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.reset(true);
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return (
                elem.shadowRoot.querySelector("#sub-columns")?.innerHTML ||
                "MISSING"
            );
        });

        await compareContentsToSnapshot(contents);
    });

    test("persistence > survives views that don't reference them", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.restore({
                columns: ["State"],
            });
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("add button > marks on hover", async ({ page }) => {
        await page.evaluate(openSidebarAndScrollToBottom);
        let addExprButton = await page.waitForSelector("#add-expression");
        let notHovered = await addExprButton.getAttribute("class");
        expect(notHovered).toBeNull();

        await addExprButton.hover();
        let hovered = await addExprButton.getAttribute("class");
        expect(hovered).toBe("dragdrop-hover");
    });

    // Currently does not work in Firefox!
    test("add button > marks on click", async ({ page }) => {
        await page.evaluate(openSidebarAndScrollToBottom);
        let addExprButton = await page.waitForSelector("#add-expression");
        let unclicked = await addExprButton.getAttribute("class");
        expect(unclicked).toBeNull();
        await addExprButton.click();
        await page.evaluate(openSidebarAndScrollToBottom);
        let clicked = await addExprButton.getAttribute("class");
        expect(clicked).toBe("dragdrop-hover");
    });

    test("persistence > survives views that reference them", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { "3 + 4": "3 + 4", "1 + 2": "1 + 2" },
            });
            await elem.restore({
                columns: ["3 + 4"],
            });
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("aggregates > applies aggregate to expression column", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { '"Sales" + 100': '"Sales" + 100' },
                aggregates: { '"Sales" + 100': "avg" },
                group_by: ["State"],
                columns: ['"Sales" + 100'],
            });
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("sort > sorts by a hidden expression column", async ({ page }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { '"Sales" + 100': '"Sales" + 100' },
                sort: [['"Sales" + 100', "asc"]],
                columns: ["Row ID"],
            });
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("filter > filters by an expression column", async ({ page }) => {
        await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            await elem.toggleConfig(true);
            await elem.restore({
                expressions: { '"Sales" + 100': '"Sales" + 100' },
                filter: [['"Sales" + 100', ">", 150]],
                columns: ["Row ID", '"Sales" + 100'],
            });
        });

        const contents = await page.evaluate(async () => {
            const elem = document.querySelector("perspective-viewer");
            return elem.shadowRoot.querySelector("#sub-columns").innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });
});
