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
import perspective from "@perspective-dev/client";

let server;
let port;

test.describe("WebSocketManager", function () {
    test.beforeEach(() => {
        server = new perspective.WebSocketServer({ port: 0 });
        port = server._server.address().port;
    });

    test.afterEach(() => {
        server.close();
    });

    test("sends initial data client on subscribe", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test");
        const client_view = await client_table.view();
        const client_data = await client_view.to_json();
        expect(client_data).toEqual(data);
        await client.terminate();

        // // TODO Can't await delete here because `terminate()` doesn't
        // // guarantee server-side cleanup happens immediately. So this test
        // // leaks a small `Table` sometimes, as do several others in this
        // // suite.

        await new Promise((x) => setTimeout(x, 10));
        await table.delete();
    });

    test("Throws an exception when the server is detached", async () => {
        const data = [{ x: 1 }];
        const _table = await perspective.table(data, { name: "test2" });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test2");
        const client_view = await client_table.view();
        await server.close();
        const client_data = client_view.to_json();
        await expect(client_data).rejects.toThrow();
    });

    test("passes back errors from server", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test");
        await expect(client_table.view({ columns: ["z"] })).rejects.toThrow(
            "Abort(): Invalid column 'z' found in View columns.\n",
        );

        const client_view = await client_table.view();
        const client_data = await client_view.to_json();
        expect(client_data).toEqual(data);
        await client.terminate();

        await new Promise((x) => setTimeout(x, 10));
        await table.delete();
    });

    test("sends initial data multiple client on subscribe", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const client_1 = await perspective.websocket(`ws://localhost:${port}`);
        const client_2 = await perspective.websocket(`ws://localhost:${port}`);
        const client_1_table = await client_1.open_table("test");
        const client_2_table = await client_2.open_table("test");
        const client_1_view = await client_1_table.view();
        const client_2_view = await client_2_table.view();
        const client_1_data = await client_1_view.to_json();
        const client_2_data = await client_2_view.to_json();
        await client_1.terminate();
        await client_2.terminate();
        expect(client_1_data).toEqual(data);
        expect(client_2_data).toEqual(data);

        await new Promise((x) => setTimeout(x, 10));
        await table.delete();
    });

    test("passes back errors with multiple client on subscribe", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const client_1 = await perspective.websocket(`ws://localhost:${port}`);
        const client_2 = await perspective.websocket(`ws://localhost:${port}`);
        const client_1_table = await client_1.open_table("test");
        const client_2_table = await client_2.open_table("test");
        await expect(client_1_table.view({ columns: ["z"] })).rejects.toThrow(
            "Abort(): Invalid column 'z' found in View columns.\n",
        );

        const client_1_view = await client_1_table.view();
        const client_2_view = await client_2_table.view();
        const client_1_data = await client_1_view.to_json();
        const client_2_data = await client_2_view.to_json();
        await client_1.terminate();
        await client_2.terminate();
        expect(client_1_data).toEqual(data);
        expect(client_2_data).toEqual(data);

        await new Promise((x) => setTimeout(x, 10));
        await table.delete();
    });

    test("sends updates to client on subscribe", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test");
        const client_view = await client_table.view();
        let done;
        let result = new Promise((x) => {
            done = x;
        });

        const on_update = () => {
            client_view.to_json().then(async (updated_data) => {
                await client_view.delete();
                await table.delete();
                expect(updated_data).toEqual([{ x: 1 }, { x: 2 }]);
                await client.terminate();
                setTimeout(done);
            });
        };

        client_view.on_update(on_update);
        client_view.to_json().then((client_data) => {
            expect(client_data).toEqual(data);
            return table.update([{ x: 2 }]);
        });

        await result;
    });

    test("Calls `update` and sends arraybuffers using `binary_length`", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const view = await table.view();
        const arrow = await view.to_arrow();
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test");
        await client_table.update(arrow);
        const client_view = await client_table.view();
        const client_data = await client_view.to_json();
        expect(client_data).toEqual([{ x: 1 }, { x: 1 }]);
        await client_view.delete();
        await client.terminate();
        await view.delete();
        await table.delete();
    });

    test("Calls `update` and sends `Uint8Array` using `binary_length` multiple times", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const view = await table.view();
        const arrow = await view.to_arrow();
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test");
        await client_table.update(arrow);
        await client_table.update(arrow);
        await client_table.update(arrow);
        const client_view = await client_table.view();
        const client_data = await client_view.to_json();
        expect(client_data).toEqual([{ x: 1 }, { x: 1 }, { x: 1 }, { x: 1 }]);
        await client_view.delete();
        await view.delete();
        await table.delete();
    });

    test("Calls `update` and sends `Uint8Array` using `on_update`", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const view = await table.view();
        const arrow = await view.to_arrow();
        let update_port;
        let done;
        let result = new Promise((x) => {
            done = x;
        });

        const updater = async (updated) => {
            expect(updated.port_id).toEqual(update_port);
            expect(updated.delta instanceof Uint8Array).toEqual(true);
            expect(updated.delta.byteLength).toBeGreaterThan(0);
            await view.delete();
            await table.delete();
            await client.terminate();

            done();
        };

        view.on_update(updater, { mode: "row" });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const client_table = await client.open_table("test");
        for (let i = 0; i < 5; i++) {
            // take up some ports on the remote table
            await client_table.make_port();
        }

        update_port = await client_table.make_port();
        await client_table.update(arrow, { port_id: update_port });
        await result;
    });

    // TODO ping loop is not yet implemented
    test.skip("disables ping loop on disconnect", async () => {
        const data = [{ x: 1 }];
        const table = await perspective.table(data, { name: "test" });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const _client_table = await client.open_table("test");
        expect(await _client_table.size()).toEqual(1);
        expect(client._ping_loop).toBeDefined();
        await server.close();
        expect(client._ping_loop).toBeUndefined();
        await table.delete();
    });

    test("Can get hosted table names", async () => {
        const data = [{ x: 1 }];
        const host_table_name = "test";
        const table = await perspective.table(data, { name: host_table_name });
        const client = await perspective.websocket(`ws://localhost:${port}`);
        const table_names = await client.get_hosted_table_names();
        expect(table_names).toContain(host_table_name);
        await client.terminate();
        await table.delete();
    });
});
