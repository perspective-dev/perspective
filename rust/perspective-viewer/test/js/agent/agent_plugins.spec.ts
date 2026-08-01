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

// `list_plugins` reports each plugin's DECLARED contract, so a model can
// tell that `columns` means different things in different plugins - the
// field-reported failure (`Y Line` plots `columns` as Y series against
// `group_by`; `X/Y Line` plots `columns[0]` as X against `columns[1]`).
// Runs against `superstore-all.html`, the harness that registers the real
// chart and datagrid plugins.

import { test, expect } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-all.html");

    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        window["__AGENT_CALLS__"] = [];
        window["__MAKE_ENGINE__"] = (script) => ({
            chat: {
                completions: {
                    create: async (request) => {
                        window["__AGENT_CALLS__"].push(request);
                        const step = script.shift();
                        const message = step.tool
                            ? {
                                  role: "assistant",
                                  content: "",
                                  tool_calls: [
                                      {
                                          id: `call_${script.length}`,
                                          type: "function",
                                          function: {
                                              name: step.tool,
                                              arguments: JSON.stringify(
                                                  step.args ?? {},
                                              ),
                                          },
                                      },
                                  ],
                              }
                            : { role: "assistant", content: step.text };

                        return {
                            id: "chatcmpl-1",
                            object: "chat.completion",
                            created: 0,
                            model: "fake-model",
                            choices: [{ index: 0, message }],
                        };
                    },
                },
            },
        });
    });
});

async function listPlugins(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer");
        viewer.agentConfig({
            name: "webllm",
            engine: window["__MAKE_ENGINE__"]([
                { tool: "list_plugins" },
                { text: "ok" },
            ]),
        });

        await viewer.agentPrompt("What can you draw?");
        const calls = window["__AGENT_CALLS__"];
        const result = calls[calls.length - 1].messages.find(
            (m) => m.role === "tool",
        ).content;

        return JSON.parse(result);
    });
}

// TODO(texodus): can't run these without proxy test plugins
test.describe.skip("llm-agent list_plugins contract", () => {
    test("reports each plugin's declared column roles", async ({ page }) => {
        const result = await listPlugins(page);
        const by_name = Object.fromEntries(
            result.plugins.map((x) => [x.name, x]),
        );

        // The two plugins whose `columns` semantics models confuse.
        expect(by_name["Y Line"].columns.roles).toEqual(["Y Axis"]);
        expect(by_name["Y Line"].columns.required).toEqual(1);
        expect(by_name["X/Y Line"].columns.roles).toEqual([
            "X Axis",
            "Y Axis",
            "Tooltip",
        ]);

        expect(by_name["X/Y Line"].columns.required).toEqual(2);

        // Columns past the named slots repeat the last role: more Y
        // series for `Y Line`, more tooltips for `X/Y Line`.
        expect(by_name["Y Line"].columns.extra_columns).toEqual("Y Axis");
        expect(by_name["X/Y Line"].columns.extra_columns).toEqual("Tooltip");
        expect(result.columns_are_positional).toContain("roles[i]");
    });

    test("reports what group_by and split_by draw, per plugin", async ({
        page,
    }) => {
        const result = await listPlugins(page);
        const by_name = Object.fromEntries(
            result.plugins.map((x) => [x.name, x]),
        );

        // Same field, three different pictures.
        expect(by_name["Y Line"].group_by).toEqual("X Axis");
        expect(by_name["Treemap"].group_by).toEqual("Hierarchy");
        expect(by_name["Datagrid"].group_by).toEqual(
            "aggregates rows; no visual role",
        );
        expect(by_name["Heatmap"].split_by).toEqual("Y Axis");

        // The X/Y charts take both axes from `columns`, so `group_by`
        // draws nothing - stated, not left to inference.
        expect(by_name["X/Y Line"].group_by).toContain("no visual role");
    });

    test("flags the charts that connect points in row order", async ({
        page,
    }) => {
        const result = await listPlugins(page);
        const by_name = Object.fromEntries(
            result.plugins.map((x) => [x.name, x]),
        );

        // Line charts draw the view's row order, so an unsorted config
        // renders natural order...
        expect(by_name["X/Y Line"].ordering).toContain("sort");
        expect(by_name["Map Line"].ordering).toContain("row order");

        // ...while the point charts are unaffected, and an unsorted
        // config is NOT itself a mistake - hence declared, not inferred.
        expect(by_name["X/Y Scatter"].ordering).toBeNull();
        expect(by_name["Y Line"].ordering).toBeNull();
        expect(by_name["Datagrid"].ordering).toBeNull();
    });
});

test.describe("pivot labels follow the plugin's declared roles", () => {
    async function label(page, id) {
        return await page
            .locator(`perspective-viewer #${id} label.pivot-selector-label`)
            .evaluate((x) => getComputedStyle(x, "::before").content);
    }

    // The field's own name, shown beside the role rather than replaced by
    // it; `display: none` when the plugin declares no role.
    async function secondary(page, id) {
        return await page
            .locator(`perspective-viewer #${id} label.pivot-selector-label`)
            .evaluate((x) => {
                const style = getComputedStyle(x, "::after");
                return { content: style.content, display: style.display };
            });
    }

    test("the same declaration drives the UI label and list_plugins", async ({
        page,
    }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.evaluate(async (x) => {
            await x.restore({ plugin: "Datagrid", settings: true });
        });

        // The datagrid's pivots are structural, and say so.
        expect(await label(page, "group_by")).toContain("Group By");
        expect(await label(page, "split_by")).toContain("Split By");

        // A Y-series chart groups by its X axis...
        await viewer.evaluate(async (x) => {
            await x.restore({ plugin: "Y Line", columns: ["Sales"] });
        });

        expect(await label(page, "group_by")).toContain("X Axis");
        expect(await label(page, "split_by")).toContain("Series");

        // The role leads, the field name follows - both visible, so the
        // reader still knows which config field this slot is.
        const group_secondary = await secondary(page, "group_by");
        expect(group_secondary.content).toContain("Group By");
        expect(group_secondary.content).toContain("(");
        expect(group_secondary.content).toContain(")");
        expect(group_secondary.display).not.toEqual("none");

        // ...and a treemap nests a hierarchy.
        await viewer.evaluate(async (x) => {
            await x.restore({ plugin: "Treemap", columns: ["Sales"] });
        });

        expect(await label(page, "group_by")).toContain("Hierarchy");

        // The X/Y charts declare no `group_by` role, so the label falls
        // back to the generic one rather than rendering empty.
        await viewer.evaluate(async (x) => {
            await x.restore({
                plugin: "X/Y Line",
                columns: ["Sales", "Profit"],
            });
        });

        expect(await label(page, "group_by")).toContain("Group By");

        // No role declared, so there is nothing to qualify and the
        // secondary label stays hidden rather than repeating itself.
        expect((await secondary(page, "group_by")).display).toEqual("none");

        // Switching BACK is the regression: Datagrid and Y Line both name
        // exactly one column slot, so the view config and named-slot
        // count are unchanged and nothing in the old prop set differed -
        // the labels stayed on the previous plugin's roles until the
        // settings panel was reopened.
        await viewer.evaluate(async (x) => {
            await x.restore({ plugin: "Datagrid" });
        });

        expect(await label(page, "group_by")).toContain("Group By");
        expect(await label(page, "split_by")).toContain("Split By");

        // Same source as the agent's contract - these cannot disagree.
        const result = await listPlugins(page);
        const by_name = Object.fromEntries(
            result.plugins.map((x) => [x.name, x]),
        );

        expect(by_name["Y Line"].group_by).toEqual("X Axis");
        expect(by_name["Datagrid"].group_by).toEqual(
            "aggregates rows; no visual role",
        );
    });
});

test.describe("llm-agent aggregation type read-back", () => {
    test("reports columns whose type changed under aggregation", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                engine: window["__MAKE_ENGINE__"]([
                    {
                        tool: "set_view_config",
                        args: {
                            config: {
                                plugin: "X/Y Line",
                                group_by: ["State"],
                                columns: ["Order Date", "Sales"],
                            },
                        },
                    },
                    { text: "done" },
                ]),
            });

            await viewer.agentPrompt("Chart it");
            const calls = window["__AGENT_CALLS__"];
            return JSON.parse(
                calls[calls.length - 1].messages.find((m) => m.role === "tool")
                    .content,
            );
        });

        const retyped = result.aggregation_changed_types;
        const date_col = retyped.find((x) => x.name === "Order Date");
        expect(date_col.source_type).toEqual("datetime");
        expect(date_col.type).toEqual("integer");
        expect(date_col.aggregate ?? null).toBeNull();

        // `Sales` sums to a float-ish numeric, so it is NOT retyped away
        // from its source type - no noise for the ordinary case.
        expect(retyped.find((x) => x.name === "Sales")).toBeUndefined();
    });

    test("says nothing when aggregation changes no types", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                engine: window["__MAKE_ENGINE__"]([
                    {
                        tool: "set_view_config",
                        args: { config: { columns: ["Sales"] } },
                    },
                    { text: "done" },
                ]),
            });

            await viewer.agentPrompt("Show sales");
            const calls = window["__AGENT_CALLS__"];
            return JSON.parse(
                calls[calls.length - 1].messages.find((m) => m.role === "tool")
                    .content,
            );
        });

        // Ungrouped: no aggregation, so the key is absent entirely rather
        // than an empty array the model has to read past.
        expect(result.aggregation_changed_types).toBeUndefined();
    });
});
