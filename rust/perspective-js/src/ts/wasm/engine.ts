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

import type { MainModule } from "@perspective-dev/server/dist/wasm/perspective-server.js";
import type { EmscriptenServer, PspPtr } from "./emscripten_api.ts";

export type ApiResponse = {
    client_id: number;
    data: Uint8Array;
};

export interface PerspectiveServerOptions {
    on_poll_request?: (x: PerspectiveServer) => Promise<void>;
}

export class PerspectivePollThread {
    private poll_handle?: Promise<void>;
    private server: PerspectiveServer;
    constructor(server: PerspectiveServer) {
        this.server = server;
    }

    private set_poll_handle() {
        this.poll_handle = new Promise((resolve, reject) =>
            setTimeout(() =>
                this.server
                    .poll()
                    .then(resolve)
                    .catch(reject)
                    .finally(() => {
                        this.poll_handle = undefined;
                    }),
            ),
        );

        return this.poll_handle;
    }

    async on_poll_request() {
        if (!this.poll_handle) {
            await this.set_poll_handle();
        } else {
            await this.poll_handle.then(() => {
                if (!this.poll_handle) {
                    return this.set_poll_handle();
                }
            });
        }
    }
}

export class PerspectiveServer {
    clients: Map<number, (buffer: Uint8Array) => Promise<void>>;
    server: EmscriptenServer;
    module: MainModule;
    on_poll_request?: (x: PerspectiveServer) => Promise<void>;
    constructor(module: MainModule, options?: PerspectiveServerOptions) {
        this.clients = new Map();
        this.module = module;
        this.on_poll_request = options?.on_poll_request;
        this.server = module._psp_new_server(
            !!options?.on_poll_request ? 1 : 0,
        ) as EmscriptenServer;
    }

    /**
     * Helper function to create server emitter/receiver pairs
     */
    make_session(
        callback: (buffer: Uint8Array) => Promise<void>,
    ): PerspectiveSession {
        const client_id = this.module._psp_new_session(this.server as any);
        this.clients.set(client_id, callback);
        return new PerspectiveSession(
            this.module,
            this.server,
            client_id,
            this.clients,
            this.on_poll_request && (() => this.on_poll_request!(this)),
        );
    }

    async poll() {
        const polled = this.module._psp_poll(this.server as any);
        await decode_api_responses(
            this.module,
            polled,
            async (msg: ApiResponse) => {
                await this.clients.get(msg.client_id)!(msg.data);
            },
        );
    }

    delete() {
        this.module._psp_delete_server(this.server as any);
    }
}

export class PerspectiveSession {
    constructor(
        private mod: MainModule,
        private server: EmscriptenServer,
        private client_id: number,
        private client_map: Map<number, (buffer: Uint8Array) => Promise<void>>,
        private on_poll_request?: () => Promise<void>,
    ) {}

    async handle_request(view: Uint8Array) {
        const ptr = await convert_typed_array_to_pointer(
            this.mod,
            view,
            async (viewPtr) => {
                return this.mod._psp_handle_request(
                    this.server as any,
                    this.client_id,
                    viewPtr as any,
                    this.mod._psp_is_memory64()
                        ? (BigInt(view.byteLength) as any as number)
                        : (view.byteLength as any),
                );
            },
        );

        await decode_api_responses(this.mod, ptr, async (msg: ApiResponse) => {
            await this.client_map.get(msg.client_id)!(msg.data);
        });

        if (this.on_poll_request) {
            await this.on_poll_request();
        } else {
            await this.poll();
        }
    }

    private async poll() {
        const polled = this.mod._psp_poll(this.server as any);
        await decode_api_responses(
            this.mod,
            polled,
            async (msg: ApiResponse) => {
                if (msg.client_id === 0) {
                    await this.client_map.get(this.client_id)!(msg.data);
                } else {
                    await this.client_map.get(msg.client_id)!(msg.data);
                }
            },
        );
    }

    close() {
        this.mod._psp_close_session(this.server as any, this.client_id);
    }
}

async function convert_typed_array_to_pointer(
    core: MainModule,
    array: Uint8Array,
    callback: (_: PspPtr) => Promise<PspPtr>,
): Promise<PspPtr> {
    const ptr = core._psp_alloc(
        core._psp_is_memory64()
            ? (BigInt(array.byteLength) as any as number)
            : (array.byteLength as any),
    );

    core.HEAPU8.set(array, Number(ptr));
    const msg = await callback(ptr);
    core._psp_free(ptr);
    return msg;
}

/**
 * Convert a pointer to WASM memory into an `ApiResponse[]`, via a custom
 * encoding.
 *
 * @param core The emscripten API
 * @param ptr A pointer to a fixed-sized struct representing a set of
 * `proto::Resp` payloads, encoded as a length-prefixed array of
 * (char* data, u32_t len, u32_t client_id) tuples:
 *
 * ```text
 *   N   data    length   client_id   data    length   client_id
 * +-------------------------------------------------------------+
 * | 2 | 0xabc | 9      | 0         | 0xdef | 12     | 0         |
 * +-------------------------------------------------------------+
 *       |                           |
 *       |  +-------------+          |  +----------------+
 *       +--| "Test Data" |          +--| "Hello, World" |
 *          +-------------+             +----------------+
 * ```
 *
 * @param callback A callback to which is passed the responses. THe responses
 * must be fully processed or copied before the callback returns, as it
 * references memory on the wasm stack.
 */
async function decode_api_responses(
    core: MainModule,
    ptr: PspPtr,
    callback: (_: ApiResponse) => Promise<void>,
) {
    const is_64 = core._psp_is_memory64();
    const response = new DataView(
        core.HEAPU8.buffer,
        Number(ptr),
        is_64 ? 12 : 8,
    );

    const num_msgs = response.getUint32(0, true);
    const msgs_ptr = is_64
        ? response.getBigInt64(4, true)
        : response.getUint32(4, true);

    const messages = new DataView(
        core.HEAPU8.buffer,
        Number(msgs_ptr),
        num_msgs * (is_64 ? 16 : 12),
    );

    try {
        for (let i = 0; i < num_msgs; i++) {
            const [data_ptr, data_len, client_id] = is_64
                ? [
                      messages.getBigInt64(i * 16, true),
                      messages.getInt32(i * 16 + 8, true),
                      messages.getInt32(i * 16 + 12, true),
                  ]
                : [
                      messages.getUint32(i * 12, true),
                      messages.getUint32(i * 12 + 4, true),
                      messages.getInt32(i * 12 + 8, true),
                  ];

            const data = new Uint8Array(
                core.HEAPU8.buffer,
                Number(data_ptr),
                data_len,
            );

            const resp = { client_id, data };
            await callback(resp);
        }
    } finally {
        for (let i = 0; i < num_msgs; i++) {
            const data_ptr = is_64
                ? messages.getBigInt64(i * 16, true)
                : messages.getInt32(i * 12, true);

            core._psp_free(data_ptr as any);
        }

        core._psp_free(
            is_64
                ? (BigInt(messages.byteOffset) as any as number)
                : (messages.byteOffset as any),
        );
        core._psp_free(
            is_64
                ? (BigInt(response.byteOffset) as any as number)
                : (response.byteOffset as any),
        );
    }
}
