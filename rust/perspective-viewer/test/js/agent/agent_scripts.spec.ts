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

const DATA = "https://fake-data.example";
const CDN = "https://esm.fake.example";
const CORS = { "access-control-allow-origin": "*" };
const ENTITLEMENTS = [
    "read_view",
    "configure_view",
    "manage_layout",
    "read_docs",
    "execute_code",
];

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

async function toolResults(page) {
    return await page.evaluate(() => {
        const calls = window["__AGENT_CALLS__"];
        const messages = calls[calls.length - 1].messages;
        const start = messages.map((m) => m.role).lastIndexOf("user");
        return messages
            .slice(start)
            .filter((m) => m.role === "tool")
            .map((m) => JSON.parse(m.content));
    });
}

async function runAgent(
    page,
    steps,
    prompts = ["go"],
    entitlements: string[] | null = ENTITLEMENTS,
) {
    return await page.evaluate(
        async ({ steps, prompts, entitlements }) => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.agentConfig({
                name: "webllm",
                ...(entitlements ? { entitlements } : {}),
                engine: window["__MAKE_ENGINE__"](steps),
            });

            const answers = [];
            for (const prompt of prompts) {
                answers.push(await viewer.agentPrompt(prompt));
            }

            return answers;
        },
        { steps, prompts, entitlements },
    );
}

async function tableSize(page, name) {
    return await page.evaluate(async (name) => {
        const table = await window["__TEST_WORKER__"].open_table(name);
        return await table.size();
    }, name);
}

async function tableColumns(page, name) {
    return await page.evaluate(async (name) => {
        const table = await window["__TEST_WORKER__"].open_table(name);
        const view = await table.view();
        const columns = await view.to_columns();
        await view.delete();
        return columns;
    }, name);
}

async function hostedTables(page) {
    return await page.evaluate(async () => {
        return await window["__TEST_WORKER__"].get_hosted_table_names();
    });
}

async function sandboxFrames(page) {
    return await page.evaluate(
        () =>
            document.querySelectorAll("iframe[data-perspective-agent-script]")
                .length,
    );
}

async function serveJson(page, path, body) {
    await page.route(`${DATA}${path}`, async (route) => {
        await route.fulfill({
            headers: CORS,
            contentType: "application/json",
            body: JSON.stringify(typeof body === "function" ? body() : body),
        });
    });
}

test.describe("llm-agent script tools", () => {
    test("execute_code is withheld by default", async ({ page }) => {
        await runAgent(page, [{ text: "ok" }], ["hello"], null);
        const tools = await page.evaluate(() =>
            window["__AGENT_CALLS__"][0].tools.map((x) => x.function.name),
        );

        expect(tools).not.toContain("run_script");
        expect(tools).not.toContain("list_scripts");
        expect(tools).not.toContain("stop_script");
    });

    test("execute_code advertises the script tools", async ({ page }) => {
        await runAgent(page, [{ text: "ok" }], ["hello"]);
        const tools = await page.evaluate(() =>
            window["__AGENT_CALLS__"][0].tools.map((x) => x.function.name),
        );

        expect(tools).toContain("run_script");
        expect(tools).toContain("list_scripts");
        expect(tools).toContain("stop_script");
    });

    test("run_script without the grant is an unknown tool", async ({
        page,
    }) => {
        await runAgent(
            page,
            [
                {
                    tool: "run_script",
                    args: { name: "denied", source: "psp.emit([{ a: 1 }]);" },
                },
                { text: "done" },
            ],
            ["go"],
            null,
        );

        const results = await toolResults(page);
        expect(results[0].error).toEqual("Unknown tool `run_script`");
        expect(await sandboxFrames(page)).toEqual(0);
        expect(await hostedTables(page)).not.toContain("denied");
    });

    test("run_script loads fetched rows into a table add_panel can display", async ({
        page,
    }) => {
        await serveJson(page, "/rows.json", {
            items: [
                { name: "a", value: 1 },
                { name: "b", value: 2 },
                { name: "c", value: 3 },
            ],
        });

        const answers = await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "fetched",
                    source: `const response = await fetch("${DATA}/rows.json");
const json = await response.json();
psp.log("items", json.items.length);
psp.emit(json.items.map((x) => ({ name: x.name, value: x.value })));`,
                },
            },
            {
                tool: "add_panel",
                args: {
                    config: { table: "fetched", columns: ["name", "value"] },
                },
            },
            { tool: "list_scripts" },
            { text: "Loaded." },
        ]);

        expect(answers).toEqual(["Loaded."]);
        const results = await toolResults(page);
        expect(results[0].name).toEqual("fetched");
        expect(results[0].schema).toEqual({ name: "string", value: "integer" });
        expect(results[0].rows).toEqual(3);
        expect(results[0].log).toEqual(["items 3"]);
        expect(results[1].error).toBeUndefined();
        expect(results[1].config.table).toEqual("fetched");
        expect(
            results[2].scripts.map((x) => [x.name, x.status, x.rows]),
        ).toEqual([["fetched", "finished", 3]]);

        expect(await tableColumns(page, "fetched")).toEqual({
            name: ["a", "b", "c"],
            value: [1, 2, 3],
        });
    });

    test("run_script loads emitted Arrow bytes", async ({ page }) => {
        const arrow = "/rust/perspective-viewer/test/arrow/int_float_str.arrow";
        await page.route(`${DATA}/data.arrow`, async (route) => {
            const response = await page.request.get(arrow);
            await route.fulfill({
                headers: CORS,
                contentType: "application/octet-stream",
                body: await response.body(),
            });
        });

        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "arrow",
                    source: `const response = await fetch("${DATA}/data.arrow");
psp.emit(await response.arrayBuffer());`,
                },
            },
            { text: "done" },
        ]);

        const expected = await page.evaluate(async (arrow) => {
            const buffer = await (await fetch(arrow)).arrayBuffer();
            const table = await window["__TEST_WORKER__"].table(buffer);
            const result = {
                schema: await table.schema(),
                rows: await table.size(),
            };

            await table.delete();
            return result;
        }, arrow);

        const results = await toolResults(page);
        expect(results[0].schema).toEqual(expected.schema);
        expect(results[0].rows).toEqual(expected.rows);
    });

    test("a polling script keeps replacing its table until stop_script", async ({
        page,
    }) => {
        let tick = 0;
        await serveJson(page, "/snapshot.json", () => {
            tick += 1;
            return Array.from({ length: tick }, (_, id) => ({ id, tick }));
        });

        await runAgent(
            page,
            [
                {
                    tool: "run_script",
                    args: {
                        name: "snapshot",
                        source: `const load = async () => (await fetch("${DATA}/snapshot.json")).json();
psp.emit(await load());
setInterval(async () => psp.emit(await load(), { replace: true }), 50);`,
                    },
                },
                { text: "Polling." },
                { tool: "stop_script", args: { name: "snapshot" } },
                { tool: "list_scripts" },
                { text: "Stopped." },
            ],
            ["start"],
        );

        const results = await toolResults(page);
        expect(results[0].rows).toEqual(1);
        await expect.poll(() => tableSize(page, "snapshot")).toBeGreaterThan(3);

        const columns = await tableColumns(page, "snapshot");
        expect(new Set(columns.tick).size).toEqual(1);
        expect(columns.id.length).toEqual(columns.tick[0]);

        await page.evaluate(() =>
            document.querySelector("perspective-viewer").agentPrompt("stop"),
        );

        const stopped = await toolResults(page);
        expect(stopped[0]).toEqual({
            name: "snapshot",
            status: "stopped",
            table_dropped: false,
        });

        expect(stopped[1].scripts[0].status).toEqual("stopped");
        expect(await sandboxFrames(page)).toEqual(0);
        const size = await tableSize(page, "snapshot");
        await page.waitForTimeout(300);
        expect(await tableSize(page, "snapshot")).toEqual(size);
    });

    test("a script streams WebSocket frames after a control message", async ({
        page,
    }) => {
        await page.routeWebSocket("wss://fake-data.example/feed", (ws) => {
            ws.onMessage((message) => {
                const request = JSON.parse(String(message));
                if (request.op === "subscribe") {
                    ws.send(JSON.stringify({ type: "trade", id: 1, p: 10.5 }));
                    ws.send(JSON.stringify({ type: "trade", id: 2, p: 11.25 }));
                    ws.send(JSON.stringify({ type: "trade", id: 1, p: 12.5 }));
                }
            });
        });

        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "trades",
                    table: { index: "id" },
                    source: `const socket = new WebSocket("wss://fake-data.example/feed");
socket.onopen = () => socket.send(JSON.stringify({ op: "subscribe" }));
socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    psp.emit([{ id: message.id, price: message.p }]);
};`,
                },
            },
            { text: "Streaming." },
        ]);

        const results = await toolResults(page);
        expect(results[0].schema).toEqual({ id: "integer", price: "float" });
        await expect
            .poll(async () => (await tableColumns(page, "trades")).price)
            .toEqual([12.5, 11.25]);
    });

    test("a script imports a CDN module to parse a Wikipedia HTML table", async ({
        page,
    }) => {
        await page.route(`${CDN}/html-table.js`, async (route) => {
            await route.fulfill({
                headers: CORS,
                contentType: "text/javascript",
                body: `export function parseTable(html) {
    return [...html.matchAll(/<tr>(.*?)<\\/tr>/g)].map((row) =>
        [...row[1].matchAll(/<t[hd]>(.*?)<\\/t[hd]>/g)].map((cell) => cell[1]),
    );
}`,
            });
        });

        await page.route(`${DATA}/w/api.php**`, async (route) => {
            await route.fulfill({
                headers: CORS,
                contentType: "application/json",
                body: JSON.stringify({
                    parse: {
                        title: "New York Giants seasons",
                        text: '<table class="wikitable"><tr><th>Season</th><th>PF</th><th>PA</th></tr><tr><td>2021</td><td>258</td><td>416</td></tr><tr><td>2022</td><td>365</td><td>371</td></tr></table>',
                    },
                }),
            });
        });

        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "giants",
                    source: `import { parseTable } from "${CDN}/html-table.js";
const url = "${DATA}/w/api.php?action=parse&page=New_York_Giants_seasons&prop=text&format=json&formatversion=2&origin=*";
const json = await (await fetch(url)).json();
const [header, ...body] = parseTable(json.parse.text);
psp.log("columns:", header);
psp.emit(body.map((row) => ({
    Season: Number(row[0]),
    "Points For": Number(row[header.indexOf("PF")]),
    "Points Against": Number(row[header.indexOf("PA")]),
})));`,
                },
            },
            {
                tool: "add_panel",
                args: {
                    config: {
                        table: "giants",
                        group_by: ["Season"],
                        columns: ["Points For", "Points Against"],
                    },
                },
            },
            { text: "Charted." },
        ]);

        const results = await toolResults(page);
        expect(results[0].log).toEqual(['columns: ["Season","PF","PA"]']);
        expect(results[1].error).toBeUndefined();
        expect(await tableColumns(page, "giants")).toEqual({
            Season: [2021, 2022],
            "Points For": [258, 365],
            "Points Against": [416, 371],
        });
    });

    test("a script that finishes without emitting is an error", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: { name: "empty", source: 'psp.log("nothing to do");' },
            },
            { tool: "list_scripts" },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toContain(
            "The script finished without calling `psp.emit()`",
        );

        expect(results[0].error).toContain("nothing to do");
        expect(results[1]).toEqual({ scripts: [] });
        expect(await hostedTables(page)).not.toContain("empty");
        expect(await sandboxFrames(page)).toEqual(0);
    });

    test("a script that throws reports the error with its log", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "broken",
                    source: 'psp.log("step 1");\nthrow new Error("boom");',
                },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toContain("boom");
        expect(results[0].error).toContain("step 1");
        expect(await hostedTables(page)).not.toContain("broken");
    });

    test("a top-level return is answered with the module hint", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "returned",
                    source: "const rows = [{ a: 1 }];\nreturn rows;",
                },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toContain("SyntaxError");
        expect(results[0].error).toContain("not a function body");
        expect(results[0].error).toContain("psp.emit(rows)");
        expect(await hostedTables(page)).not.toContain("returned");
    });

    test("a JSON syntax error is not answered with the module hint", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: { name: "badjson", source: 'JSON.parse("{bad");' },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toContain("SyntaxError");
        expect(results[0].error).not.toContain("not a function body");
    });

    test("a syntax error is reported", async ({ page }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: { name: "syntax", source: "psp.emit([{ a: 1 }" },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toBeDefined();
        expect(await hostedTables(page)).not.toContain("syntax");
    });

    test("a script that never emits times out and is terminated", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "slow",
                    start_timeout_ms: 1000,
                    source: "await new Promise(() => {});",
                },
            },
            { tool: "list_scripts" },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toContain(
            "No rows were emitted within 1000ms",
        );

        expect(results[1]).toEqual({ scripts: [] });
        expect(await sandboxFrames(page)).toEqual(0);
    });

    test("a fetch blocked by CORS fails the script", async ({ page }) => {
        await page.route(`${DATA}/private.json`, async (route) => {
            await route.fulfill({
                contentType: "application/json",
                body: JSON.stringify([{ a: 1 }]),
            });
        });

        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "private",
                    source: `psp.emit(await (await fetch("${DATA}/private.json")).json());`,
                },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toMatch(/fetch/i);
        expect(await hostedTables(page)).not.toContain("private");
    });

    test("scripts run in an opaque origin without page credentials", async ({
        page,
    }) => {
        const origin = new URL(page.url()).origin;
        let headers;
        await page.route(`${origin}/sandbox-probe`, async (route) => {
            headers = await route.request().allHeaders();
            await route.fulfill({
                headers: CORS,
                contentType: "application/json",
                body: "{}",
            });
        });

        await page.evaluate(() => {
            document.cookie = "psp_secret=1";
        });

        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "probe",
                    source: `const response = await fetch("${origin}/sandbox-probe");
psp.emit([{
    origin: self.origin,
    has_document: typeof document !== "undefined",
    has_storage: typeof localStorage !== "undefined",
    has_parent: typeof parent !== "undefined",
    status: response.status,
}]);`,
                },
            },
            { text: "done" },
        ]);

        expect(await tableColumns(page, "probe")).toEqual({
            origin: ["null"],
            has_document: [false],
            has_storage: [false],
            has_parent: [false],
            status: [200],
        });

        expect(headers.origin).toEqual("null");
        expect(headers.cookie).toBeUndefined();
    });

    test("run_script refuses to replace a table it did not create", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "load-viewer-csv",
                    source: "psp.emit([{ a: 1 }]);",
                },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[0].error).toContain(
            "already exists and was not created by `run_script`",
        );

        expect(await tableSize(page, "load-viewer-csv")).toBeGreaterThan(1);
        expect(await sandboxFrames(page)).toEqual(0);
    });

    test("re-running a name replaces the script and its table", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: { name: "draft", source: "psp.emit([{ a: 1 }]);" },
            },
            {
                tool: "run_script",
                args: {
                    name: "draft",
                    source: 'psp.emit([{ b: "x" }, { b: "y" }]);',
                },
            },
            { tool: "list_scripts" },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[1].schema).toEqual({ b: "string" });
        expect(results[1].note).toBeUndefined();
        expect(results[2].scripts.map((x) => x.name)).toEqual(["draft"]);
        expect(await tableColumns(page, "draft")).toEqual({ b: ["x", "y"] });
        expect(await sandboxFrames(page)).toEqual(1);
    });

    test("re-running a displayed table replaces its rows in place", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: { name: "shown", source: "psp.emit([{ a: 1 }]);" },
            },
            {
                tool: "add_panel",
                args: { config: { table: "shown", columns: ["a"] } },
            },
            {
                tool: "run_script",
                args: {
                    name: "shown",
                    source: "psp.emit([{ a: 5 }, { a: 6 }]);",
                },
            },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[2].schema).toEqual({ a: "integer" });
        expect(results[2].rows).toEqual(2);
        expect(results[2].note).toBeDefined();
        expect(await tableColumns(page, "shown")).toEqual({ a: [5, 6] });
    });

    test("stop_script with drop_table deletes the table", async ({ page }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "dropped",
                    source: "psp.emit([{ a: 1 }]);\nsetInterval(() => psp.emit([{ a: 2 }]), 50);",
                },
            },
            {
                tool: "stop_script",
                args: { name: "dropped", drop_table: true },
            },
            { tool: "list_scripts" },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[1].table_dropped).toEqual(true);
        expect(results[2]).toEqual({ scripts: [] });
        expect(await hostedTables(page)).not.toContain("dropped");
        expect(await sandboxFrames(page)).toEqual(0);
    });

    test("stop_script names the current scripts for an unknown name", async ({
        page,
    }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: { name: "known", source: "psp.emit([{ a: 1 }]);" },
            },
            { tool: "stop_script", args: { name: "unknown" } },
            { text: "done" },
        ]);

        const results = await toolResults(page);
        expect(results[1].error).toEqual(
            'Unknown script `unknown` - current scripts: ["known"]',
        );
    });

    test("scripts survive agentConfig and agentReset", async ({ page }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "durable",
                    source: "psp.emit([{ a: 1 }]);\nsetInterval(() => psp.emit([{ a: 2 }]), 50);",
                },
            },
            { text: "done" },
        ]);

        await page.evaluate(() =>
            document.querySelector("perspective-viewer").agentReset(),
        );

        await runAgent(page, [{ tool: "list_scripts" }, { text: "listed" }]);
        const results = await toolResults(page);
        expect(results[0].scripts.map((x) => [x.name, x.status])).toEqual([
            ["durable", "finished"],
        ]);

        expect(await sandboxFrames(page)).toEqual(1);
        const size = await tableSize(page, "durable");
        await expect
            .poll(() => tableSize(page, "durable"))
            .toBeGreaterThan(size);
    });

    test("viewer.delete() terminates every script", async ({ page }) => {
        await runAgent(page, [
            {
                tool: "run_script",
                args: {
                    name: "orphan",
                    source: "psp.emit([{ a: 1 }]);\nsetInterval(() => psp.emit([{ a: 2 }]), 50);",
                },
            },
            { text: "done" },
        ]);

        expect(await sandboxFrames(page)).toEqual(1);
        await page.evaluate(() =>
            document.querySelector("perspective-viewer").delete(),
        );

        expect(await sandboxFrames(page)).toEqual(0);
        const size = await tableSize(page, "orphan");
        await page.waitForTimeout(300);
        expect(await tableSize(page, "orphan")).toEqual(size);
    });
});
