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
    });
});

// Render one canned assistant reply and return the message locator.
async function render(page, text) {
    await page.evaluate(async (text) => {
        const viewer = document.querySelector("perspective-viewer");
        viewer.agentConfig({
            name: "webllm",
            model: "fake-model",
            engine: {
                chat: {
                    completions: {
                        create: async () => ({
                            id: "chatcmpl-0",
                            object: "chat.completion",
                            created: 0,
                            model: "fake-model",
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: "assistant",
                                        content: text,
                                    },
                                    finish_reason: "stop",
                                },
                            ],
                        }),
                    },
                },
            },
        });
    }, text);

    await page.locator("perspective-viewer #chat_tabbar_tab").click();
    const input = page.locator("perspective-viewer #chat_input");
    await input.fill("Go");
    await input.press("Enter");
    const message = page.locator(
        "perspective-viewer .chat-assistant:not(.chat-pending)",
    );

    await expect(message).toBeVisible({ timeout: 10000 });
    return message;
}

test.describe("llm-agent markdown fixtures", () => {
    test("headings, nested lists and code blocks inside items", async ({
        page,
    }) => {
        const message = await render(
            page,
            "## Analysis\n\n" +
                "Steps taken:\n\n" +
                "1. Fetched the schema with `get_schema`\n" +
                "2. Applied this config:\n" +
                "   ```json\n" +
                '   { "group_by": ["State"] }\n' +
                "   ```\n" +
                "   - grouped by **State**\n" +
                "   - sorted *descending*\n" +
                "3. Rendered the chart",
        );

        await compareInnerHTMLToSnapshot(message);
    });
});
