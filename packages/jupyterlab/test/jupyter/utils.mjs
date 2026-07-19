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

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const notebook_template = JSON.parse(
    fs.readFileSync(__dirname + "/notebook_template.json", {
        encoding: "utf-8",
    }),
);

const DIST_ROOT = path.join(__dirname, "..", "..", "dist", "esm");
const TEST_CONFIG_ROOT = path.join(__dirname, "..", "config", "jupyter");

const remove_jupyter_artifacts = () => {
    fs.rmSync(path.join(TEST_CONFIG_ROOT, "lab"), {
        recursive: true,
        force: true,
    });

    fs.rmSync(path.join(DIST_ROOT, ".ipynb_checkpoints"), {
        recursive: true,
        force: true,
    });
};

/**
 * Generate a new Jupyter notebook using the standard JSON template, and
 * save it into dist/esm so that the tests can use the resulting notebook.
 *
 * @param {String} notebook_name
 * @param {Array<String>} cells
 */
const generate_notebook = (notebook_name, cells) => {
    const notebook_path = path.join(DIST_ROOT, notebook_name);

    // deepcopy the notebook template so we are not modifying a shared object
    const nb = JSON.parse(JSON.stringify(notebook_template));

    // import perspective, set up test data etc.
    nb["cells"] = [
        {
            cell_type: "code",
            metadata: {},
            execution_count: null,
            outputs: [],
            source: [
                "import perspective\n",
                "import perspective.widget\n",
                "import pandas as pd\n",
                "import numpy as np\n",
                "arrow_data = None\n",
                "with open('test.arrow', 'rb') as arrow: \n    arrow_data = arrow.read()",
            ],
        },
    ];

    // Cells defined in the test as an array of arrays - each inner array
    // is a new cell to be added to the notebook.
    for (const cell of cells) {
        nb["cells"].push({
            cell_type: "code",
            execution_count: null,
            metadata: {},
            outputs: [],
            source: cell,
        });
    }

    // Write the notebook to dist/esm, which acts as the working directory
    // for the Jupyterlab test server.
    fs.writeFileSync(notebook_path, JSON.stringify(nb));
};

// Add Jupyterlab-specific bindings to the global Jest objects
export function describe_jupyter(body, { name, root } = {}) {
    // Remove the automatically generated workspaces directory, as it
    // will try to redirect single-document URLs to the last URL opened.
    test.beforeEach(remove_jupyter_artifacts);
    test.afterAll(remove_jupyter_artifacts);

    test.afterEach(async () => {
        const port = process.env.__JUPYTERLAB_PORT__;
        if (!port) {
            return;
        }
        try {
            const base = `http://127.0.0.1:${port}`;
            const res = await fetch(`${base}/api/sessions`, {
                headers: { Accept: "application/json" },
            });
            const sessions = await res.json();
            await Promise.all(
                (Array.isArray(sessions) ? sessions : []).map((s) =>
                    fetch(`${base}/api/sessions/${s.id}`, {
                        method: "DELETE",
                    }).catch(() => {}),
                ),
            );
        } catch (e) {}
    });

    // URL is null because each test.capture_jupyterlab will have its own
    // unique notebook generated.
    return test.describe(`Blank Notebook`, body);
}

/**
 * Execute body() on a Jupyter notebook without taking any screenshots.
 *
 * @param {*} name
 * @param {*} cells
 * @param {*} body
 */
export function test_jupyter(name, cells, body) {
    const notebook_name = `${name.replace(/[ \.']/g, "_")}.ipynb`;
    generate_notebook(notebook_name, cells);
    const url = `doc/tree/${notebook_name}`;
    test(name, async ({ page }) => {
        await page.goto(
            `http://127.0.0.1:${process.env.__JUPYTERLAB_PORT__}/${url}`,
            { waitUntil: "domcontentloaded" },
        );
        await body({ page });
    });
}

test_jupyter.skip = function (name, _cells, _body) {
    test.skip(name, async () => {});
};

export async function default_body(page) {
    await execute_all_cells(page);
    const viewer = await page.waitForSelector(
        ".jp-OutputArea-output perspective-viewer",
        { visible: true },
    );
    await viewer.evaluate(async (viewer) => await viewer.flush());
    return viewer;
}
export async function execute_all_cells(page) {
    await page.waitForFunction(async () => !!document.title);
    await page.waitForSelector(".lm-Widget", { visible: true });
    await page.waitForSelector(".jp-NotebookPanel-toolbar", {
        visible: true,
    });

    try {
        await page.waitForFunction(
            async () => {
                try {
                    const res = await fetch("/api/sessions", {
                        headers: { Accept: "application/json" },
                    });
                    const sessions = await res.json();
                    return (
                        Array.isArray(sessions) &&
                        sessions.some(
                            (s) =>
                                s.kernel &&
                                s.kernel.connections > 0 &&
                                s.kernel.execution_state &&
                                s.kernel.execution_state !== "starting",
                        )
                    );
                } catch (e) {
                    return false;
                }
            },
            null,
            { timeout: 60000, polling: 500 },
        );
    } catch (e) {}

    // wait for a cell to be active
    try {
        await page.waitForSelector(
            '.jp-Notebook-ExecutionIndicator:not([data-status="idle"])',
            { timeout: 1000 },
        );
    } catch (e) {}
    // await new Promise((x) => setTimeout(x, 2000));

    await page.waitForSelector(
        '.jp-Notebook-ExecutionIndicator[data-status="idle"]',
    );

    // Use our custom keyboard shortcut to run all cells
    await page.keyboard.press("R");
    await page.keyboard.press("R");
    await page.evaluate(() => (document.scrollTop = 0));
    try {
        await page.waitForFunction(
            () =>
                !Array.from(
                    document.querySelectorAll(".jp-InputPrompt"),
                ).some((el) => (el.textContent || "").includes("*")),
            null,
            { timeout: 60000, polling: 500 },
        );
    } catch (e) {}
}

export async function add_and_execute_cell(page, cell_content) {
    // wait for a code cell to be visible
    await page.waitForSelector(".jp-CodeCell", {
        visible: true,
    });

    // find and click the a cell in the notebook
    await page.click(".jp-CodeCell");
    await new Promise((x) => setTimeout(x, 100));
    // find and click the "new cell" button
    await page.click('jp-button[data-command="notebook:insert-cell-below"]');

    // Click into the new active cell's editor before typing — grabbing
    // `document.activeElement` races JupyterLab's command/edit mode focus,
    // and in command mode the source is eaten as keyboard shortcuts.
    // `insertText` inserts atomically (no auto-indent/auto-close mangling).
    await page.locator(".jp-CodeCell.jp-mod-active .cm-content").click();
    await page.keyboard.insertText(cell_content);

    await new Promise((x) => setTimeout(x, 100));
    // now while the element is still focused, click the run cell button
    await page.click(
        'jp-button[data-command="notebook:run-cell-and-select-next"]',
    );
    await new Promise((x) => setTimeout(x, 100));
    // wait for kernel to stop running
    // await page.waitForSelector(
    //     "//div.jp-InputPrompt[contains(text(),'[*]:')]",
    //     {
    //         hidden: true,
    //     }
    // );
}
export async function assert_no_error_in_cell(page, cell_content) {
    // run the cell
    await add_and_execute_cell(page, cell_content);

    // wait for jupyter to render any frontend exceptions
    return await Promise.race([
        page
            .waitForSelector(
                'div[data-mime-type="application/vnd.jupyter.stderr"]',
            )
            .then(async (el) => {
                // Only visible with `PSP_DEBUG=1` (playwright `quiet`)
                console.log(
                    "assert_no_error_in_cell stderr:",
                    await el.evaluate((e) => e.textContent.slice(0, 1000)),
                );
                return false;
            }),
        page
            .waitForSelector("//div//pre[contains(text(),\"'Passed'\")]")
            .then(() => true),
    ]);
}

let _python_pass_token = 0;

/**
 * Assert that a block of Python `assert` statements eventually passes, polling
 * across fresh cell executions.
 *
 * A frontend `viewer.restore()` syncs back to the Python traits asynchronously
 * (config-update event -> `model.save_changes()` -> comm -> kernel), and
 * ipykernel only applies comm messages while the kernel is idle (between
 * executions). A one-shot `assert_no_error_in_cell` therefore races the
 * round-trip and fails on a slow runner even though the sync is on its way.
 * Re-issue the assertion in a new cell (each execution gives the kernel another
 * idle window to apply the pending update) until it passes or `tries` is
 * exhausted. A per-attempt success token makes the check stale-safe — a prior
 * failed attempt's output can never be mistaken for success.
 *
 * @returns {Promise<boolean>} whether the asserts passed within `tries`.
 */
export async function assert_python_eventually(page, asserts, tries = 15) {
    for (let i = 0; i < tries; i++) {
        const token = `PSP_PASS_${_python_pass_token++}`;
        await add_and_execute_cell(page, `${asserts}\n${JSON.stringify(token)}`);
        const passed = await page
            .locator(`.jp-OutputArea-output:has-text("${token}")`)
            .first()
            .waitFor({ state: "visible", timeout: 4000 })
            .then(() => true)
            .catch(() => false);
        if (passed) {
            return true;
        }
    }
    return false;
}
