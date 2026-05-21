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

import type * as perspective_server from "@perspective-dev/server/dist/wasm/perspective-server.js";

type PspPtr = bigint | number;
type EmscriptenServer = number;

var out = console.log.bind(console);
var err = console.error.bind(console);

var UTF8Decoder = new TextDecoder("utf8");
var printCharBuffers: Array<Array<number> | null> = [null, [], []];

function UTF8ArrayToString(
    heapOrArray: Uint8Array | Array<number>,
    idx = 0,
    maxBytesToRead = NaN,
) {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
    return UTF8Decoder.decode(
        heapOrArray instanceof Uint8Array
            ? heapOrArray.subarray(idx, endPtr)
            : new Uint8Array(heapOrArray.slice(idx, endPtr)),
    );
}

function printChar(stream: number, curr: number) {
    var buffer: Array<number> = printCharBuffers[stream]!;
    if (curr === 0 || curr === 10) {
        (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
        buffer.length = 0;
    } else {
        buffer.push(curr);
    }
}

export default async function (obj: any) {
    let psp_module: perspective_server.MainModule;
    let is_memory64 = false;
    let wasm_memory: WebAssembly.Memory;
    const module = {
        HaveOffsetConverter() {
            console.error("HaveOffsetConverter");
        },
        __syscall_ftruncate64(...args: any[]) {
            console.error("__syscall_frtuncate64", args);
        },
        __syscall_getdents64(...args: any[]) {
            console.error("__syscall_frtuncate64", args);
        },
        __syscall_unlinkat(...args: any[]) {
            console.error("__syscall_frtuncate64", args);
        },
        __throw_exception_with_stack_trace(ex: number) {
            // @ts-ignore
            const e = new WebAssembly.Exception(
                (psp_module as any).__cpp_exception,
                [ex],
                {
                    traceStack: true,
                },
            );

            // @ts-ignore This is helpful for debugging
            e.message = "Unexpected internal error";
            throw e;
        },
        clock_time_get(
            clk_id: number,
            ignored_precision: bigint,
            ptime: bigint | number,
        ) {
            if (is_memory64) {
                ptime = ptime as bigint;
                ptime = Number(ptime);
                if (
                    !(clk_id == 0 || clk_id == 1 || clk_id == 2 || clk_id == 3)
                ) {
                    return 28;
                }
                var now;

                if (clk_id === 0) {
                    now = Date.now();
                } else {
                    now = performance.now();
                }

                const nsec = Math.round(now * 1000 * 1000);
                const HEAP64 = new BigInt64Array(wasm_memory.buffer);
                HEAP64[ptime / 8] = BigInt(nsec);
                return 0;
            } else {
                ptime = ptime as number;
                ptime >>>= 0;
                if (
                    !(clk_id == 0 || clk_id == 1 || clk_id == 2 || clk_id == 3)
                ) {
                    return 28;
                }

                var now;
                if (clk_id === 0) {
                    now = Date.now();
                } else {
                    now = performance.now();
                }

                var nsec = Math.round(now * 1e6);
                const HEAP64 = new BigInt64Array(wasm_memory.buffer);
                HEAP64[ptime >>> 3] = BigInt(nsec);
                return 0;
            }
        },
        emscripten_asm_const_int(...args: any[]) {
            return 0;
        },
        emscripten_notify_memory_growth(memoryIndex: bigint | number) {
            if (is_memory64) {
                memoryIndex = Number(memoryIndex as bigint);
            } else {
                memoryIndex = memoryIndex as number;
                memoryIndex >>>= 0;
            }

            if (memoryIndex != 0) {
                console.error("abort");
            }
        },
        environ_get(...args: any[]) {
            return 0;
        },
        environ_sizes_get(...args: any[]) {
            return 0;
        },
        fd_close(...args: any[]) {
            console.error("fd_close", args);
            return 0;
        },
        fd_read(...args: any[]) {
            console.error("fd_read", args);
            return 0;
        },
        fd_seek(...args: any[]) {
            console.error("fs_seek", args);
            return 0;
        },
        fd_write(
            fd: number,
            iov: number | bigint,
            iovcnt: number | bigint,
            pnum: number | bigint,
        ) {
            const HEAPU8 = new Uint8Array(wasm_memory.buffer);

            if (!is_memory64) {
                iov = iov as number;
                iovcnt = iovcnt as number;
                pnum = pnum as number;
                iov >>>= 0;
                iovcnt >>>= 0;
                pnum >>>= 0;
                let num = 0;
                const HEAPU32 = new Uint32Array(wasm_memory.buffer);

                for (let i = 0; i < iovcnt; i++) {
                    let ptr = HEAPU32[(iov >>> 2) >>> 0];
                    let len = HEAPU32[((iov + 4) >>> 2) >>> 0];
                    iov += 8;
                    for (let j = 0; j < len; j++) {
                        printChar(fd, HEAPU8[(ptr + j) >>> 0]);
                    }
                    num += len;
                }
                HEAPU32[(pnum >>> 2) >>> 0] = num;
                return 0;
            } else {
                iov = Number(iov as bigint);
                iovcnt = Number(iovcnt as bigint);
                pnum = Number(pnum as bigint);
                let num = 0;
                const HEAPU64 = new BigUint64Array(wasm_memory.buffer);

                for (let i = 0; i < iovcnt; i++) {
                    let ptr = Number(HEAPU64[iov / 8]);
                    let len = Number(HEAPU64[(iov + 8) / 8]);
                    iov += 16;
                    for (let j = 0; j < len; j++) {
                        printChar(fd, HEAPU8[ptr + j]);
                    }

                    num += len;
                }
                HEAPU64[pnum / 8] = BigInt(num);
                return 0;
            }
        },
        proc_exit(e: number) {
            console.error("proc_exit", e);
            return 0;
        },
    };

    const x = await obj.instantiateWasm(
        { env: module, wasi_snapshot_preview1: module },
        (instance: WebAssembly.Instance) => {
            psp_module =
                instance.exports as any as perspective_server.MainModule;

            // @ts-ignore
            is_memory64 = !!psp_module.psp_is_memory64();
            wasm_memory = instance.exports.memory as WebAssembly.Memory;

            // @ts-ignore
            psp_module._initialize();
        },
    );

    const extensions: Record<string, any> = {};
    for (const [name, func] of Object.entries(x)) {
        extensions[`_${name}`] = func;
    }

    return {
        ...x,
        ...extensions,
        get HEAPU8() {
            // @ts-ignore
            return new Uint8Array(wasm_memory.buffer);
        },
    };
}
