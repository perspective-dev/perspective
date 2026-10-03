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

const INLINE_FIXTURES = {
    "strong and emphasis": [
        "**Done!** Key *stats* here.",
        "<p><strong>Done!</strong> Key <em>stats</em> here.</p>",
    ],
    "snake_case identifiers are not emphasis": [
        "call get_schema then set_view_config",
        "<p>call get_schema then set_view_config</p>",
    ],
    "emphasis nests inside strong": [
        "**bold with *ital* inside**",
        "<p><strong>bold with <em>ital</em> inside</strong></p>",
    ],
    "unpaired delimiters stay literal": [
        "2 * 3 * 4 and a ~ tilde",
        "<p>2 * 3 * 4 and a ~ tilde</p>",
    ],
    "code spans and strikethrough": [
        "run `pnpm test` and ~~skip~~ this",
        "<p>run <code>pnpm test</code> and <del>skip</del> this</p>",
    ],
    "raw HTML is literal text": [
        "<script>alert(1)</script>",
        "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    ],
    "known entities decode and unknown ones stay literal": [
        "a &amp; b &#65; &unknown; c",
        "<p>a &amp; b A &amp;unknown; c</p>",
    ],
};

const BLOCK_FIXTURES = {
    "heading, rule and fenced code": [
        "## Stats\n\n---\n\n```sql\nSELECT 1;\n```",
        "<h2>Stats</h2><hr>" +
            '<pre class="scrollable"><code data-lang="sql">SELECT 1;\n</code></pre>',
    ],
    "a code block and a nested list inside an item": [
        "- first\n- second:\n  ```\n  x = 1\n  ```\n  - inner",
        "<ul><li>first</li><li>second:" +
            '<pre class="scrollable"><code>x = 1\n</code></pre>' +
            "<ul><li>inner</li></ul></li></ul>",
    ],
    "an ordered list keeps its start": [
        "3. three\n4. four",
        '<ol start="3"><li>three</li><li>four</li></ol>',
    ],
    "a table aligns its columns and keeps an escaped pipe in code": [
        "| Region | Sales |\n| :--- | ---: |\n| West | `a\\|b` |",
        "<table><thead><tr>" +
            '<th class="chat-md-align-left">Region</th>' +
            '<th class="chat-md-align-right">Sales</th>' +
            "</tr></thead><tr>" +
            '<td class="chat-md-align-left">West</td>' +
            '<td class="chat-md-align-right"><code>a|b</code></td>' +
            "</tr></table>",
    ],
    "dashes under a paragraph are a rule, not a table": [
        "Title\n---",
        "<p>Title</p><hr>",
    ],
    "blockquote, soft break and hard break": [
        "> quoted\n> more\n\nafter  \nbreak",
        "<blockquote><p>quoted more</p></blockquote><p>after<br>break</p>",
    ],
};

test.describe("llm-agent markdown fixtures", () => {
    for (const [name, [markdown, html]] of Object.entries({
        ...INLINE_FIXTURES,
        ...BLOCK_FIXTURES,
    })) {
        test(name, async ({ page }) => {
            const message = await render(page, markdown);
            expect(await message.evaluate((x) => x.innerHTML)).toBe(html);
        });
    }

    test("raw HTML creates no elements", async ({ page }) => {
        const message = await render(page, "<script>alert(1)</script>");
        await expect(message.locator("script")).toHaveCount(0);
        await expect(message).toHaveText("<script>alert(1)</script>");
    });

    test("links open externally and images render as alt text with a link", async ({
        page,
    }) => {
        const message = await render(
            page,
            '[safe](https://example.com "hi") ' +
                "![leak](https://example.com/x.png) <https://a.co>",
        );

        await expect(message.locator("img")).toHaveCount(0);
        await expect(message.locator(".chat-md-image")).toHaveText("leak");
        const anchors = await message.locator("a").evaluateAll((xs) =>
            xs.map((x) => ({
                href: x.getAttribute("href"),
                title: x.getAttribute("title"),
                target: x.getAttribute("target"),
                rel: x.getAttribute("rel"),
                text: x.textContent,
            })),
        );

        const external = { target: "_blank", rel: "noopener noreferrer" };
        expect(anchors).toEqual([
            {
                href: "https://example.com",
                title: "hi",
                text: "safe",
                ...external,
            },
            {
                href: "https://example.com/x.png",
                title: null,
                text: " (image)",
                ...external,
            },
            {
                href: "https://a.co",
                title: null,
                text: "https://a.co",
                ...external,
            },
        ]);
    });

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
