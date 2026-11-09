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

import { test, expect } from "@perspective-dev/test";
import { make_client, VirtualServer } from "@perspective-dev/client";

function make_handler(hold) {
    const deleted = new Set();
    return {
        getHostedTables: () => ["t"],
        tableSchema: () => ({ a: "integer" }),
        tableSize: async () => {
            await hold.table_size?.();
            return 3;
        },
        tableMakeView: () => {},
        viewDelete: (view_id) => {
            deleted.add(view_id);
        },
        viewGetData: (_view_id, _config, _schema, _viewport, slice) => {
            [1, 2, 3].forEach((value, i) => slice.setIntegerCol("a", i, value));
        },
        viewSchema: async () => {
            await hold.view_schema?.();
            return { a: "integer" };
        },
        viewSize: async (view_id) => {
            await hold.view_size?.();
            if (deleted.has(view_id)) {
                throw new Error(`no such view ${view_id}`);
            }

            return 3;
        },
        tableDescribe: () => ({
            view_schema: { a: "integer" },
            expression_schema: {},
        }),
    };
}

function connect(handler) {
    const server = new VirtualServer(handler);
    const scratch = new VirtualServer(make_handler({}));
    let recording = null;
    const client = make_client(async (bytes) => {
        const target = recording ? scratch : server;
        if (recording) {
            recording.bytes = bytes.slice();
        }

        await client.handle_response(await target.handleRequest(bytes.slice()));
    });

    async function record(request) {
        recording = {};
        await settle(request());
        const { bytes } = recording;
        recording = null;
        return bytes;
    }

    return { client, server, record };
}

function hold_until_entered(hold, name) {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    hold[name] = () => {
        entered.resolve();
        hold[name] = undefined;
        return release.promise;
    };

    return { entered: entered.promise, release: release.resolve };
}

function capture_console_errors() {
    const original = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(" "));
    return {
        errors,
        restore: () => {
            console.error = original;
        },
    };
}

async function settle(promise) {
    try {
        return { value: await promise };
    } catch (error) {
        return { error };
    }
}

function expect_view_not_found(response) {
    expect(new TextDecoder().decode(response)).toContain("View not found");
    expect(Array.from(response.slice(-2))).toEqual([0x10, 0x01]);
}

async function race_delete_against(hold, name, request) {
    const { client, server, record } = connect(make_handler(hold));
    const table = await client.open_table("t");
    const view = await table.view();
    const bytes = await record(() => request(view));
    const { entered, release } = hold_until_entered(hold, name);
    const captured = capture_console_errors();
    const replay = server.handleRequest(bytes);
    await entered;
    await view.delete();
    release();
    const outcome = await settle(replay);
    captured.restore();
    return { table, outcome, errors: captured.errors };
}

test("A delete() while a dimensions request awaits the handler fails only that request", async () => {
    const { table, outcome, errors } = await race_delete_against(
        {},
        "table_size",
        (view) => view.dimensions(),
    );

    expect(outcome.error).toBeUndefined();
    expect_view_not_found(outcome.value);
    expect(errors).toEqual([]);

    const view2 = await table.view();
    const dims2 = await view2.dimensions();
    expect(dims2.num_table_rows).toBe(3);
    expect(dims2.num_view_rows).toBe(3);
    await view2.delete();
});

test("A delete() while a data request awaits the schema fails only that request", async () => {
    const { table, outcome, errors } = await race_delete_against(
        {},
        "view_schema",
        (view) => view.to_columns(),
    );

    expect(outcome.error).toBeUndefined();
    expect_view_not_found(outcome.value);
    expect(errors).toEqual([]);

    const view2 = await table.view();
    expect(await view2.to_columns()).toEqual({ a: [1, 2, 3] });
    await view2.delete();
});

test("A handler failure for a view deleted during the request answers 'View not found'", async () => {
    const { table, outcome, errors } = await race_delete_against(
        {},
        "view_size",
        (view) => view.dimensions(),
    );

    expect(outcome.error).toBeUndefined();
    expect_view_not_found(outcome.value);
    expect(errors).toEqual([]);

    const view2 = await table.view();
    expect((await view2.dimensions()).num_view_rows).toBe(3);
    await view2.delete();
});
