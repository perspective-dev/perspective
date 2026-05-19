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

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import type { Locator, Page } from "@playwright/test";
import * as prettier from "prettier";

// Re-export test framework (preserves consoleLogs auto-fixture)
export { test, expect } from "@perspective-dev/test";

// Re-export page object models
export { PageView } from "@perspective-dev/test";
export { ColumnSettingsSidebar } from "@perspective-dev/test/src/js/models/column_settings.ts";
export { ColumnSelector } from "@perspective-dev/test/src/js/models/settings_panel.ts";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const API_VERSION: string = JSON.parse(
    fs
        .readFileSync(
            path.resolve(__dirname, "../../../../tools/test/package.json"),
        )
        .toString(),
)["version"];

export const DEFAULT_CONFIG: ViewerConfigUpdate = {
    aggregates: {},
    columns_config: {},
    columns: [],
    expressions: {},
    filter: [],
    group_by: [],
    group_rollup_mode: "rollup",
    plugin: "",
    plugin_config: {},
    settings: false,
    sort: [],
    split_by: [],
    version: API_VERSION,
    table: "load-viewer-csv",
    title: null,
    theme: "Pro Light",
};

export async function compareContentsToSnapshot(
    contents: string,
    extraSnapshotPath?: string[],
): Promise<void> {
    const { expect, test } = await import("@playwright/test");
    let titlePath = test.info().titlePath;
    if (extraSnapshotPath) {
        titlePath = titlePath.concat(extraSnapshotPath);
    }

    const snapshotPath = [
        titlePath
            .slice(1)
            .map((s) =>
                s
                    .trim()
                    .replace(/[^a-z0-9]+/gi, "-")
                    .toLowerCase(),
            )
            .join("-") + ".txt",
    ];

    const pathArray = Array.isArray(snapshotPath)
        ? snapshotPath
        : [snapshotPath];

    const cleanedContents = contents
        .replace(/style=""/g, "")
        .replace(/(min-|max-)?(width|height): *\d+\.*\d+(px)?;? */g, "");

    const formatted = await prettier.format(cleanedContents, {
        parser: "html",
    });

    await expect(formatted).toMatchSnapshot(pathArray);
}

export async function compareNodes(
    left: Locator,
    right: Locator,
    page: Page,
): Promise<boolean> {
    const leftEl = await left.elementHandle();
    const rightEl = await right.elementHandle();
    return await page.evaluate(
        async (compare) => {
            return compare.leftEl?.isEqualNode(compare.rightEl) || false;
        },
        { leftEl, rightEl },
    );
}

export async function getShadowContents(page: Page): Promise<string> {
    const raw = await page.evaluate(async () => {
        const viewer =
            document.querySelector("perspective-viewer")!.shadowRoot!;
        return viewer.innerHTML;
    });

    return await prettier.format(raw, {
        parser: "html",
    });
}

export async function getLightContents(page: Page): Promise<string> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector(
            "perspective-viewer perspective-viewer-plugin",
        )!;
        return viewer.innerHTML;
    });
}
