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

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";
import { gotoBasic, restoreChart } from "./helpers";

async function countColorPixels(
    page: Page,
    hex: string,
    tolerance = 24,
): Promise<number> {
    return await page.evaluate(
        ({ hex, tolerance }) => {
            const findCanvas = (
                root: Document | ShadowRoot,
            ): HTMLCanvasElement | null => {
                const direct = root.querySelector(
                    ".webgl-canvas",
                ) as HTMLCanvasElement | null;
                if (direct) {
                    return direct;
                }

                for (const el of Array.from(root.querySelectorAll("*"))) {
                    const sr = (el as Element & { shadowRoot?: ShadowRoot })
                        .shadowRoot;
                    if (sr) {
                        const found = findCanvas(sr);
                        if (found) {
                            return found;
                        }
                    }
                }

                return null;
            };

            const canvas = findCanvas(document);
            if (!canvas || canvas.width === 0 || canvas.height === 0) {
                return 0;
            }

            const sampler = document.createElement("canvas");
            sampler.width = canvas.width;
            sampler.height = canvas.height;
            const ctx = sampler.getContext("2d", {
                willReadFrequently: true,
            })!;

            ctx.drawImage(canvas, 0, 0);
            const x0 = Math.round(canvas.width * 0.05);
            const y0 = Math.round(canvas.height * 0.05);
            const w = Math.round(canvas.width * 0.9);
            const h = Math.round(canvas.height * 0.9);
            const data = ctx.getImageData(x0, y0, w, h).data;

            const target = [
                parseInt(hex.slice(1, 3), 16),
                parseInt(hex.slice(3, 5), 16),
                parseInt(hex.slice(5, 7), 16),
            ];

            let count = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (
                    data[i + 3] > 0 &&
                    Math.abs(data[i] - target[0]) <= tolerance &&
                    Math.abs(data[i + 1] - target[1]) <= tolerance &&
                    Math.abs(data[i + 2] - target[2]) <= tolerance
                ) {
                    count++;
                }
            }

            return count;
        },
        { hex, tolerance },
    );
}

async function expectColorPresent(page: Page, hex: string, min = 500) {
    await expect
        .poll(async () => await countColorPixels(page, hex), {
            timeout: 10000,
        })
        .toBeGreaterThan(min);
}

test.describe("columns_config color overrides", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("Y Bar series `color` override recolors the series", async ({
        page,
    }) => {
        const OVERRIDE = "#d604c1";
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["State"],
        });

        expect(await countColorPixels(page, OVERRIDE)).toBe(0);
        await restoreChart(page, {
            columns_config: { Sales: { color: OVERRIDE } },
        } as any);

        await expectColorPresent(page, OVERRIDE);
    });

    test("Y Bar split `palette` override cycles over split series", async ({
        page,
    }) => {
        const PALETTE = ["#d604c1", "#04d69b", "#6b04d6"];
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["State"],
            split_by: ["Category"],
            columns_config: {
                Sales: {
                    palette: `linear-gradient(to right, ${PALETTE.join(", ")})`,
                },
            },
        } as any);

        for (const color of PALETTE) {
            await expectColorPresent(page, color, 200);
        }
    });

    test("Heatmap numeric `gradient` override replaces the theme gradient", async ({
        page,
    }) => {
        const OVERRIDE = "#d604c1";
        await restoreChart(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["State"],
            split_by: ["Category"],
            columns_config: {
                Sales: {
                    gradient: `linear-gradient(to right, ${OVERRIDE} 0%, ${OVERRIDE} 100%)`,
                },
            },
        } as any);

        await expectColorPresent(page, OVERRIDE);
    });

    test("Treemap categorical `palette` override replaces the series palette", async ({
        page,
    }) => {
        const OVERRIDE = "#d604c1";
        await restoreChart(page, {
            plugin: "Treemap",
            columns: ["Sales", "Sub-Category"],
            group_by: ["Category"],
            aggregates: { "Sub-Category": "dominant" },
            columns_config: {
                "Sub-Category": {
                    palette: `linear-gradient(to right, ${OVERRIDE})`,
                },
            },
        } as any);

        await expectColorPresent(page, OVERRIDE);
    });

    test("Heatmap `gradient` as a var() reference resolves through a workspace palette", async ({
        page,
    }) => {
        const OVERRIDE = "#d604c1";
        await page.evaluate(
            async ({ OVERRIDE }) => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                ) as any;
                const table = await viewer.getTable();
                await viewer.restoreWorkspace({
                    palette: {
                        "--psp-user--gradient-flat": `linear-gradient(${OVERRIDE}, ${OVERRIDE})`,
                    },
                    layout: {
                        type: "tab-layout",
                        tabs: ["main"],
                        selected: 0,
                    },
                    panels: {
                        main: {
                            table: await table.get_name(),
                            plugin: "Heatmap",
                            columns: ["Sales"],
                            group_by: ["State"],
                            split_by: ["Category"],
                            columns_config: {
                                Sales: {
                                    gradient: "var(--psp-user--gradient-flat)",
                                },
                            },
                        },
                    },
                });
            },
            { OVERRIDE },
        );

        await expectColorPresent(page, OVERRIDE);
    });

    test("Y Bar split `palette` as a var() reference resolves through a page-authored property", async ({
        page,
    }) => {
        const PALETTE = ["#d604c1", "#04d69b", "#6b04d6"];
        await page.addStyleTag({
            content: `perspective-viewer { --psp-user--palette-1: linear-gradient(${PALETTE.join(", ")}); }`,
        });

        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["State"],
            split_by: ["Category"],
            columns_config: {
                Sales: { palette: "var(--psp-user--palette-1)" },
            },
        } as any);

        for (const color of PALETTE) {
            await expectColorPresent(page, color, 200);
        }
    });

    test("clearing the override restores theme colors", async ({ page }) => {
        const OVERRIDE = "#d604c1";
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["State"],
            columns_config: { Sales: { color: OVERRIDE } },
        } as any);

        await expectColorPresent(page, OVERRIDE);
        await restoreChart(page, { columns_config: null } as any);
        await expect
            .poll(async () => await countColorPixels(page, OVERRIDE), {
                timeout: 10000,
            })
            .toBe(0);
    });
});
