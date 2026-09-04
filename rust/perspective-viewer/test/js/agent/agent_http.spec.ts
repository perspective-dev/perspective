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

// The `llm-agent` HTTP transport (a direct `url` connection), driven
// through Playwright network interception so the REAL `fetch()` path — CORS
// preflight, auth header, error surfacing, mid-flight abort — is exercised
// with no live LLM. The offline `agent.spec.ts` covers the same tool loop
// over the in-page engine transport; this suite covers what only HTTP has.

import { test, expect, compareInnerHTMLToSnapshot } from "../helpers.ts";

const BASE_URL = "https://fake-llm.example/v1";

const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
};

// Serve a scripted OpenAI-chat-completions endpoint at `BASE_URL`,
// recording each completion request (its URL, headers and parsed body) into
// `calls`. A step is `{tool, args}`, `{text}`, `{status, body}` (an HTTP
// error) or `{hang: true}` (never respond).
async function scripted_route(page, script, calls) {
    await page.route(`${BASE_URL}/**`, async (route) => {
        if (route.request().method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers: CORS_HEADERS });
            return;
        }

        calls.push({
            url: route.request().url(),
            headers: route.request().headers(),
            body: route.request().postDataJSON(),
        });

        const step = script.shift();
        if (!step) {
            throw new Error("Fake endpoint script exhausted");
        }

        if (step.hang) {
            await new Promise(() => {});
        }

        if (step.status) {
            await route.fulfill({
                status: step.status,
                headers: CORS_HEADERS,
                contentType: "application/json",
                body: JSON.stringify(step.body ?? {}),
            });

            return;
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
                              arguments: JSON.stringify(step.args ?? {}),
                          },
                      },
                  ],
              }
            : { role: "assistant", content: step.text };

        await route.fulfill({
            status: 200,
            headers: CORS_HEADERS,
            contentType: "application/json",
            body: JSON.stringify({
                id: `chatcmpl-${script.length}`,
                object: "chat.completion",
                created: 0,
                model: "fake-model",
                choices: [
                    {
                        index: 0,
                        message,
                        finish_reason: step.tool ? "tool_calls" : "stop",
                    },
                ],
            }),
        });
    });
}

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("llm-agent http transport", () => {
    test("tool loop over fetch() carries auth and applies the config", async ({
        page,
    }) => {
        const calls = [];
        await scripted_route(
            page,
            [
                { tool: "get_schema" },
                {
                    tool: "set_view_config",
                    args: {
                        config: { group_by: ["State"], columns: ["Sales"] },
                    },
                },
                { text: "Grouped by state." },
            ],
            calls,
        );

        const result = await page.evaluate(async (base_url) => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({ plugin: "Debug" });
            viewer.agentConfig({
                url: `${base_url}/chat/completions`,
                apiKey: "test-key",
                model: "fake-model",
            });

            const answer = await viewer.agentPrompt("Show me sales by state");
            const config = await viewer.save();
            return {
                answer,
                group_by: config.group_by,
                columns: config.columns,
            };
        }, BASE_URL);

        expect(result.answer).toEqual("Grouped by state.");
        expect(result.group_by).toEqual(["State"]);
        expect(result.columns).toEqual(["Sales"]);

        expect(calls.length).toEqual(3);
        for (const call of calls) {
            expect(call.url).toEqual(`${BASE_URL}/chat/completions`);
            expect(call.headers["authorization"]).toEqual("Bearer test-key");
            expect(call.headers["content-type"]).toEqual("application/json");
            expect(call.body.model).toEqual("fake-model");
            expect(call.body.messages[0].role).toEqual("system");
            expect(call.body.tools.map((x) => x.function.name).sort()).toEqual([
                "activate_panel",
                "add_panel",
                "get_schema",
                "get_style_schema",
                "get_view_config",
                "list_panels",
                "list_plugins",
                "remove_panel",
                "search_docs",
                "set_view_config",
                "validate_expression",
            ]);
        }

        // The tool results ride back as `role: "tool"` messages.
        const roles = calls[2].body.messages.map((x) => x.role);
        expect(roles).toEqual([
            "system",
            "user",
            "assistant",
            "tool",
            "assistant",
            "tool",
        ]);
    });

    test("HTTP errors reject prompt() with status and body", async ({
        page,
    }) => {
        await scripted_route(
            page,
            [
                {
                    status: 401,
                    body: { error: { message: "Incorrect API key provided" } },
                },
            ],
            [],
        );

        const error = await page.evaluate(async (base_url) => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({ plugin: "Debug" });
            viewer.agentConfig({
                url: `${base_url}/chat/completions`,
            });

            try {
                await viewer.agentPrompt("hello");
                return null;
            } catch (e) {
                return e.message ?? `${e}`;
            }
        }, BASE_URL);

        expect(error).toContain("401");
        expect(error).toContain("Incorrect API key provided");
    });

    test("stop aborts an in-flight fetch", async ({ page }) => {
        await scripted_route(page, [{ hang: true }], []);
        await page.evaluate(async (base_url) => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({ plugin: "Debug", settings: true });
            viewer.agentConfig({
                url: `${base_url}/chat/completions`,
            });
        }, BASE_URL);

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
});
