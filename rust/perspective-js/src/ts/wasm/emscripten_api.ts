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

import * as perspective_server from "./perspective-server.poly.ts";
export type * from "../../../dist/wasm/perspective-js.js";
import type * as perspective_server_t from "@perspective-dev/server/dist/wasm/perspective-server.js";

export type PspPtr = BigInt | number;
export type EmscriptenServer = bigint | number;

export interface DiskBridgeHelpers {
    heap: () => Uint8Array;
    toAddr: (p: number | bigint) => number;
    readCString: (p: number | bigint) => string;
}

export interface CompileOptions {
    make_disk_bridge?: (helpers: DiskBridgeHelpers) => {
        store(
            namePtr: number | bigint,
            dataPtr: number | bigint,
            len: number,
        ): number;
        load(
            namePtr: number | bigint,
            dataPtr: number | bigint,
            len: number,
        ): number;
        remove(namePtr: number | bigint): void;
        ensureOpen(name: string): Promise<void>;
    };
}

export async function compile_perspective(
    wasmBinary: ArrayBuffer,
    opts?: CompileOptions,
): Promise<perspective_server_t.MainModule> {
    const module = await perspective_server.default({
        locateFile(x: any) {
            return x;
        },
        make_disk_bridge: opts?.make_disk_bridge,
        instantiateWasm: async (
            imports: any,
            receive: (_: WebAssembly.Instance) => void,
        ) => {
            imports["env"] = {
                ...imports["env"],
                psp_stack_trace() {
                    const str = Error().stack || "";
                    const textEncoder = new TextEncoder();
                    const bytes = textEncoder.encode(str);
                    const ptr = module._psp_alloc(
                        module._psp_is_memory64()
                            ? (BigInt(bytes.byteLength + 1) as any as number)
                            : bytes.byteLength + 1,
                    );

                    module.HEAPU8.set(bytes, Number(ptr));
                    module.HEAPU8[Number(ptr) + bytes.byteLength] = 0;
                    return ptr;
                },
                psp_heap_size() {
                    if (module._psp_is_memory64()) {
                        return BigInt(module.HEAPU8.buffer.byteLength);
                    } else {
                        return module.HEAPU8.buffer.byteLength;
                    }
                },
            };

            const webasm = await WebAssembly.instantiate(wasmBinary, imports);
            receive(webasm.instance);
            return webasm.instance.exports;
        },
    });

    return module;
}
