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

// The Phase 4 workspace tools (`list_panels` / `add_panel` / `remove_panel`
// / `activate_panel`, plus the `panel` targeting argument on the view
// tools), driven through the scripted fake engine. Panel mutations flow
// through the element's public API (`addPanel` etc.), so the layout
// invariants hold by construction — these specs assert the agent-visible
// contract: results, targeting, and self-correction errors.

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

// The tool-result contents of the LAST model request, parsed.
async function toolResults(page) {
    return await page.evaluate(() => {
        const calls = window["__AGENT_CALLS__"];
        return calls[calls.length - 1].messages
            .filter((m) => m.role === "tool")
            .map((m) => JSON.parse(m.content));
    });
}

test.describe("llm-agent workspace tools", () => {
    test("list_panels then add_panel grows the layout", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const table = (await viewer.save()).table;
            viewer.agentConfig({
                name: "webllm",
                engine: window["__MAKE_ENGINE__"]([
                    { tool: "list_panels" },
                    {
                        tool: "add_panel",
                        args: { config: { table, columns: ["Sales"] } },
                    },
                    { text: "Added a panel." },
                ]),
            });

            const answer = await viewer.agentPrompt("Add a second panel");
            return {
                answer,
                panels: viewer.getPanelNames(),
                active: viewer.getActivePanel(),
            };
        });

        expect(result.answer).toEqual("Added a panel.");
        expect(result.panels.length).toEqual(2);

        const results = await toolResults(page);
        expect(results[0].panels.length).toEqual(1);
        expect(results[0].active).toEqual(result.panels[0]);
        expect(results[1].panel).toEqual(result.panels[1]);
        expect(results[1].config.table).toBeDefined();
    });

    test("set_view_config targets a named panel without touching the active one", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const table = (await viewer.save()).table;
            const second = await viewer.addPanel({ table });
            viewer.agentConfig({
                name: "webllm",
                engine: window["__MAKE_ENGINE__"]([
                    {
                        tool: "set_view_config",
                        args: {
                            config: { group_by: ["State"] },
                            panel: second,
                        },
                    },
                    { text: "Configured." },
                ]),
            });

            await viewer.agentPrompt("Group the second panel by state");
            return {
                second_config: await viewer.save({ panel: second }),
                active_config: await viewer.save(),
                active: viewer.getActivePanel(),
                second,
            };
        });

        // The named panel changed; the active panel (still the first) did
        // not.
        expect(result.active).not.toEqual(result.second);
        expect(result.second_config.group_by).toEqual(["State"]);
        expect(result.active_config.group_by).toEqual([]);
    });
});
