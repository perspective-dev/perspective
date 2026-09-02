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

// The chat sidebar tab (feature `llm-agent`), driven through the same fake
// OpenAI-compatible engine as `agent.spec.ts`. The chat panel is a pure view
// over the shared agent slot, so the transcript must survive tab switches.

import { test, expect, compareInnerHTMLToSnapshot } from "../helpers.ts";

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
            settings: true,
        });

        window["__MAKE_ENGINE__"] = (script) => ({
            chat: {
                completions: {
                    create: async (request) => {
                        const step = script.shift();
                        if (!step) {
                            throw new Error("Fake engine script exhausted");
                        }

                        if (step.hang) {
                            return await new Promise(() => {});
                        }

                        // `{stream: [...]}` returns the WebLLM `stream:
                        // true` shape - an async iterable of chunk deltas.
                        // A `{gate: "name"}` delta pauses the stream until
                        // the test calls `window[name]()`; `{hang: true}`
                        // never resumes (Stop-mid-stream tests).
                        if (step.stream) {
                            const deltas = step.stream;
                            return {
                                [Symbol.asyncIterator]: async function* () {
                                    for (const delta of deltas) {
                                        if (delta.gate) {
                                            await new Promise((resolve) => {
                                                window[delta.gate] = resolve;
                                            });
                                        } else if (delta.hang) {
                                            await new Promise(() => {});
                                        } else {
                                            yield {
                                                choices: [{ delta }],
                                            };
                                        }
                                    }
                                },
                            };
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

async function configure(page, script) {
    await page.evaluate(async (script) => {
        const viewer = document.querySelector("perspective-viewer");
        viewer.agentConfig({
            name: "webllm",
            model: "fake-model",
            engine: window["__MAKE_ENGINE__"](script),
        });
    }, script);
}

test.describe("llm-agent chat panel", () => {
    test("chat tab is hidden until agentConfig() is called", async ({
        page,
    }) => {
        const tab = page.locator("perspective-viewer #chat_tabbar_tab");
        await expect(
            page.locator("perspective-viewer #query_tabbar_tab"),
        ).toBeVisible();

        await expect(tab).toHaveCount(0);
        await configure(page, []);
        await expect(tab).toBeVisible();
    });

    test("sending a prompt renders the transcript and applies the config", async ({
        page,
    }) => {
        await configure(page, [
            { tool: "get_schema" },
            {
                tool: "set_view_config",
                args: { config: { group_by: ["State"], columns: ["Sales"] } },
            },
            { text: "Grouped by state." },
        ]);

        await page.locator("perspective-viewer #chat_tabbar_tab").click();
        const input = page.locator("perspective-viewer #chat_input");
        await input.fill("Show me sales by state");
        await input.press("Enter");

        const log = page.locator("perspective-viewer #chat_log");
        await expect(
            log.locator(".chat-assistant:not(.chat-pending)"),
        ).toHaveText("Grouped by state.", { timeout: 10000 });

        await compareInnerHTMLToSnapshot(log);

        const config = await page.evaluate(async () => {
            return await document.querySelector("perspective-viewer").save();
        });

        expect(config.group_by).toEqual(["State"]);
        expect(config.columns).toEqual(["Sales"]);
    });

    test("stop cancels an in-flight turn", async ({ page }) => {
        await configure(page, [{ hang: true }]);
        await page.locator("perspective-viewer #chat_tabbar_tab").click();
        const input = page.locator("perspective-viewer #chat_input");
        await input.fill("This will hang");
        await input.press("Enter");

        const log = page.locator("perspective-viewer #chat_log");
        await expect(log.locator(".chat-pending")).toBeVisible();
        await page.locator("perspective-viewer #chat_stop_button").click();
        await expect(log.locator(".chat-error")).toHaveText("Stopped");
        await compareInnerHTMLToSnapshot(log, ["stopped"]);
        await expect(input).toBeEnabled();
    });

    test("streamed text renders incrementally", async ({ page }) => {
        await configure(page, [
            {
                stream: [
                    { role: "assistant" },
                    { content: "**Str" },
                    { gate: "__RELEASE__" },
                    { content: "eaming** done" },
                ],
            },
        ]);

        await page.locator("perspective-viewer #chat_tabbar_tab").click();
        const input = page.locator("perspective-viewer #chat_input");
        await input.fill("Stream it");
        await input.press("Enter");

        // The partial text is visible BEFORE the stream completes...
        const log = page.locator("perspective-viewer #chat_log");
        await expect(log.locator(".chat-streaming")).toContainText("Str");
        await page.waitForFunction(() => window["__RELEASE__"]);
        await page.evaluate(() => window["__RELEASE__"]());

        // ...and the final entry is markdown-rendered from the full fold.
        const message = log.locator(
            ".chat-assistant:not(.chat-pending):not(.chat-streaming)",
        );

        await expect(message).toHaveText("Streaming done");
        await compareInnerHTMLToSnapshot(log, ["final"]);
    });

    test("reasoning follows its tail until the reader scrolls away", async ({
        page,
    }) => {
        // Enough lines to overflow the capped body twice over.
        const bulk = (n) =>
            Array.from({ length: n }, (_, i) => `thought ${i}`).join("\n");

        await configure(page, [
            {
                stream: [
                    { reasoning_content: bulk(40) },
                    { gate: "__MORE__" },
                    { reasoning_content: "\n" + bulk(40) },
                    { gate: "__DONE__" },
                    { content: "Finished." },
                ],
            },
        ]);

        await page.locator("perspective-viewer #chat_tabbar_tab").click();
        const input = page.locator("perspective-viewer #chat_input");
        await input.fill("Think at length");
        await input.press("Enter");

        const body = page.locator(
            "perspective-viewer .chat-streaming .chat-reasoning-body",
        );

        await expect(body).toContainText("thought 39");

        // Pinned at the tail: appending scrolls to the new bottom.
        await page.waitForFunction(() => window["__MORE__"]);
        await page.evaluate(() => window["__MORE__"]());
        await expect
            .poll(async () =>
                body.evaluate(
                    (x) => x.scrollHeight - x.scrollTop - x.clientHeight,
                ),
            )
            .toBeLessThan(24);

        // Scroll away, and the next delta must NOT yank the view back.
        await body.evaluate((x) => x.scrollTo({ top: 0 }));
        await page.waitForFunction(() => window["__DONE__"]);
        await page.evaluate(() => window["__DONE__"]());
        await expect(
            page.locator(
                "perspective-viewer .chat-assistant:not(.chat-pending):not(.chat-streaming)",
            ),
        ).toContainText("Finished.");

        expect(
            await page
                .locator("perspective-viewer .chat-reasoning-body")
                .evaluate((x) => x.scrollTop),
        ).toBeLessThan(24);
    });

    test("a failed tool call renders an error chip with the failure in its tooltip", async ({
        page,
    }) => {
        await configure(page, [
            {
                tool: "set_view_config",
                args: { config: { expressions: { Bad: '"Sales" +' } } },
            },
            { text: "That expression is invalid." },
        ]);

        await page.locator("perspective-viewer #chat_tabbar_tab").click();
        const input = page.locator("perspective-viewer #chat_input");
        await input.fill("Add a computed column");
        await input.press("Enter");

        const log = page.locator("perspective-viewer #chat_log");
        await expect(
            log.locator(".chat-assistant:not(.chat-pending)"),
        ).toHaveText("That expression is invalid.");

        await compareInnerHTMLToSnapshot(log);
    });
});
