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

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer").restore({
            plugin: "Debug",
        });

        window["__AGENT_CALLS__"] = [];
        window["__MAKE_ENGINE__"] = (script) => ({
            chat: {
                completions: {
                    create: async (request) => {
                        window["__AGENT_CALLS__"].push(request);
                        const step = script.shift();
                        if (!step) {
                            throw new Error("Fake engine script exhausted");
                        }

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
                            id: `chatcmpl-${script.length}`,
                            object: "chat.completion",
                            created: 0,
                            model: "fake-model",
                            choices: [
                                {
                                    index: 0,
                                    message,
                                    finish_reason: step.tool
                                        ? "tool_calls"
                                        : "stop",
                                },
                            ],
                        };
                    },
                },
            },
        });
    });
});

async function allToolResults(page) {
    return await page.evaluate(() => {
        const calls = window["__AGENT_CALLS__"];
        return calls[calls.length - 1].messages
            .filter((m) => m.role === "tool")
            .map((m) => JSON.parse(m.content));
    });
}

const BUNDLE = "/rust/perspective-viewer/dist/docs/perspective-docs.json";

const RETRIEVAL_GOLDENS: [string, (result: any) => boolean][] = [
    [
        "arrange panels grid",
        (x) => x.path === "docs/md/how_to/javascript/layout.md",
    ],
    [
        "dashboard layout",
        (x) => x.path === "docs/md/how_to/javascript/layout.md",
    ],
    [
        "side by side panels",
        (x) => x.path === "docs/md/how_to/javascript/layout.md",
    ],
    [
        "stack panels tabs",
        (x) => x.path === "docs/md/how_to/javascript/layout.md",
    ],
    [
        "resize panel sizes",
        (x) => x.path === "docs/md/how_to/javascript/layout.md",
    ],
    [
        "split-layout orientation",
        (x) => x.path === "docs/md/how_to/javascript/layout.md",
    ],
    ["master detail filter", (x) => x.title.includes("Master/detail")],
    ["derived table workspace", (x) => /derived/i.test(x.title)],
];

async function lastToolResult(page) {
    return await page.evaluate(() => {
        const calls = window["__AGENT_CALLS__"];
        return calls[calls.length - 1].messages.find((m) => m.role === "tool")
            ?.content;
    });
}

test.describe("llm-agent search_docs", () => {
    test("inline entries act as a searchable data dictionary", async ({
        page,
    }) => {
        const answer = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                docs: [
                    {
                        title: "Column: Discount",
                        text: "Discount is a ratio in [0, 1], not a percent.",
                    },
                    {
                        title: "Column: Profit",
                        text: "Profit is net of returns and discounts.",
                    },
                ],
                engine: window["__MAKE_ENGINE__"]([
                    {
                        tool: "search_docs",
                        args: { query: "discount ratio percent" },
                    },
                    { text: "Discount is a 0-1 ratio." },
                ]),
            });

            return await viewer.agentPrompt("What units is Discount in?");
        });

        expect(answer).toEqual("Discount is a 0-1 ratio.");
        const tool_result = await lastToolResult(page);
        expect(tool_result).toContain("ratio in [0, 1]");
        expect(tool_result).toContain("Column: Discount");
    });

    test("a fetch() Response source resolves lazily and searches", async ({
        page,
    }) => {
        await page.route("https://fake-docs.example/**", (route) =>
            route.fulfill({
                status: 200,
                headers: { "access-control-allow-origin": "*" },
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        title: "Aggregates",
                        text: "The aggregates field maps column names to aggregate functions like sum and avg.",
                    },
                ]),
            }),
        );

        const answer = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                docs: fetch("https://fake-docs.example/docs.json"),
                engine: window["__MAKE_ENGINE__"]([
                    { tool: "search_docs", args: { query: "aggregates sum" } },
                    { text: "Use the aggregates field." },
                ]),
            });

            return await viewer.agentPrompt("How do I sum a column?");
        });

        expect(answer).toEqual("Use the aggregates field.");
        expect(await lastToolResult(page)).toContain("aggregate functions");
    });

    test("a failed docs source surfaces as a tool-result error", async ({
        page,
    }) => {
        await page.route("https://fake-docs.example/**", (route) =>
            route.fulfill({
                status: 404,
                headers: { "access-control-allow-origin": "*" },
                body: "not here",
            }),
        );

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                docs: fetch("https://fake-docs.example/docs.json"),
                engine: window["__MAKE_ENGINE__"]([
                    { tool: "search_docs", args: { query: "anything" } },
                    { text: "I could not consult the docs." },
                ]),
            });

            await viewer.agentPrompt("What is a view?");
        });

        const tool_result = await lastToolResult(page);
        expect(tool_result).toContain("Docs failed to load");
        expect(tool_result).toContain("404");
    });

    test("the packaged bundle upgrades set_view_config's advertised schema", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                docs: fetch(
                    "/rust/perspective-viewer/dist/docs/perspective-docs.json",
                ),
                engine: window["__MAKE_ENGINE__"]([{ text: "ok" }]),
            });

            await viewer.agentPrompt("hello");
            const calls = window["__AGENT_CALLS__"];
            return {
                system: JSON.stringify(calls[0].messages[0].content),
                params: calls[0].tools.find(
                    (x) => x.function.name === "set_view_config",
                ).function.parameters,
            };
        });

        const params = result.params;
        expect(params.properties.config["$ref"]).toBeUndefined();
        expect(params.properties.config.type).toEqual("object");

        const config_props = params.properties.config.properties;
        expect(Object.keys(config_props)).toContain("windows");
        expect(Object.keys(config_props)).toContain("columns_config");
        expect(Object.keys(config_props)).toContain("group_by");
        expect(config_props.columns.type).toEqual("array");
        for (const ref of JSON.stringify(params).match(
            /#\/definitions\/[^"]+/g,
        ) ?? []) {
            const name = ref.slice("#/definitions/".length);
            expect(name).not.toContain("%");
            expect(params.definitions[name]).toBeDefined();
        }

        expect(result.system).toContain("search_docs");
    });

    test("the packaged corpus covers only viewer configuration", async ({
        page,
    }) => {
        const paths = await page.evaluate(async (url) => {
            const bundle = await (await fetch(url)).json();
            return bundle.chunks.map((x) => x.path);
        }, BUNDLE);

        for (const excluded of [
            "docs/md/how_to/python/",
            "docs/md/use_cases/",
            "docs/md/integrations/",
            "docs/md/tutorials/",
            "rust/perspective-viewer/docs/",
            "docs/md/FAQ.md",
            "docs/md/how_to/javascript/installation.md",
        ]) {
            expect(paths.filter((x) => x.startsWith(excluded))).toEqual([]);
        }

        for (const included of [
            "docs/md/how_to/javascript/layout.md",
            "docs/md/how_to/javascript/save_restore.md",
            "docs/md/explanation/derived_table.md",
            "docs/md/explanation/view/config/expressions.md",
            "docs/md/glossary.md",
            "rust/perspective-client/docs/expression_gen.md",
            "rust/perspective-viewer/dist/wasm/perspective-viewer.d.ts",
            "packages/viewer-datagrid/src/ts/types.ts",
            "packages/viewer-charts/src/ts/charts/chart.ts",
            "rust/perspective-viewer/dist/ts-rs/Layout.d.ts",
        ]) {
            expect(paths).toContain(included);
        }

        const titles = await page.evaluate(async (url) => {
            const bundle = await (await fetch(url)).json();
            return bundle.chunks.map((x) => x.title);
        }, BUNDLE);

        for (const engine of [
            "to_arrow",
            "get_hosted_table_names",
            "_fullRender",
        ]) {
            expect(titles.filter((x) => x.endsWith(`» ${engine}`))).toEqual([]);
        }
    });

    test("the packaged corpus retrieves the layout and workspace docs", async ({
        page,
    }) => {
        await page.evaluate(
            async ({ url, queries }) => {
                const viewer = document.querySelector("perspective-viewer");
                viewer.agentConfig({
                    name: "webllm",
                    maxTurns: queries.length + 2,
                    docs: fetch(url),
                    engine: window["__MAKE_ENGINE__"]([
                        ...queries.map((query) => ({
                            tool: "search_docs",
                            args: { query, limit: 4 },
                        })),
                        { text: "Searched." },
                    ]),
                });

                await viewer.agentPrompt("How do I arrange a dashboard?");
            },
            { url: BUNDLE, queries: RETRIEVAL_GOLDENS.map(([q]) => q) },
        );

        const results = await allToolResults(page);
        expect(results.length).toEqual(RETRIEVAL_GOLDENS.length);
        RETRIEVAL_GOLDENS.forEach(([query, matches], idx) => {
            expect(
                results[idx].results.some(matches),
                `search_docs("${query}")`,
            ).toBe(true);
        });
    });

    test("the packaged bundle schema for set_workspace omits panels", async ({
        page,
    }) => {
        const params = await page.evaluate(async (url) => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                docs: fetch(url),
                engine: window["__MAKE_ENGINE__"]([{ text: "ok" }]),
            });

            await viewer.agentPrompt("hello");
            return window["__AGENT_CALLS__"][0].tools.find(
                (x) => x.function.name === "set_workspace",
            ).function.parameters;
        }, BUNDLE);

        const config_props = Object.keys(params.properties.config.properties);
        expect(config_props).toContain("layout");
        expect(config_props).toContain("derived_tables");
        expect(config_props).toContain("masters");
        expect(config_props).toContain("global_filters");
        expect(config_props).not.toContain("panels");
        expect(params.definitions?.ViewerConfigInitial).toBeUndefined();
        for (const ref of JSON.stringify(params).match(
            /#\/definitions\/[^"]+/g,
        ) ?? []) {
            const name = ref.slice("#/definitions/".length);
            expect(params.definitions[name]).toBeDefined();
        }
    });

    test("the packaged corpus answers an expression query", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                docs: fetch(
                    "/rust/perspective-viewer/dist/docs/perspective-docs.json",
                ),
                engine: window["__MAKE_ENGINE__"]([
                    {
                        tool: "search_docs",
                        args: { query: "bucket expression date" },
                    },
                    { text: "Bucket with bucket(x, 'M')." },
                ]),
            });

            return await viewer.agentPrompt("How do I bucket a date column?");
        });

        expect(result).toEqual("Bucket with bucket(x, 'M').");

        // Loose on purpose - docs edits must not break this smoke.
        expect(await lastToolResult(page)).toContain("bucket");
    });
});
