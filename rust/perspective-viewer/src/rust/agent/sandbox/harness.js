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

const post = (message, transfer = []) => self.postMessage(message, transfer);

const describe = (error) => {
    if (!(error instanceof Error)) {
        return String(error);
    }

    const head = String(error);
    const stack = error.stack ?? "";
    return stack.startsWith(head) ? stack : `${head}\n${stack}`.trim();
};

const format = (args) =>
    args
        .map((arg) => {
            if (typeof arg === "string") {
                return arg;
            }

            if (arg instanceof Error) {
                return describe(arg);
            }

            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        })
        .join(" ");

const log = (...args) => post({ t: "log", text: format(args) });

for (const level of ["log", "info", "warn", "error", "debug"]) {
    console[level] = log;
}

self.addEventListener("error", (event) => {
    event.preventDefault();
    post({ t: "error", message: describe(event.error ?? event.message) });
});

self.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    post({ t: "error", message: describe(event.reason) });
});

function emit(data, options = {}) {
    const replace = options?.replace === true;
    if (typeof data === "string") {
        post({ t: "emit", kind: "csv", data, replace });
    } else if (data instanceof ArrayBuffer) {
        post({ t: "emit", kind: "arrow", data, replace }, [data]);
    } else if (ArrayBuffer.isView(data)) {
        const end = data.byteOffset + data.byteLength;
        const copy = data.buffer.slice(data.byteOffset, end);
        post({ t: "emit", kind: "arrow", data: copy, replace }, [copy]);
    } else if (Array.isArray(data)) {
        post({ t: "emit", kind: "rows", data: JSON.stringify(data), replace });
    } else if (data !== null && typeof data === "object") {
        post({
            t: "emit",
            kind: "columns",
            data: JSON.stringify(data),
            replace,
        });
    } else {
        throw new TypeError(
            "psp.emit() takes an array of row objects, an object of column arrays, a CSV string, or Arrow IPC bytes",
        );
    }
}

globalThis.psp = Object.freeze({ emit, log });

self.onmessage = async ({ data }) => {
    if (data?.t !== "start") {
        return;
    }

    self.onmessage = null;
    post({ t: "started" });
    const module = new Blob([data.source], { type: "text/javascript" });
    try {
        await import(URL.createObjectURL(module));
        post({ t: "finished" });
    } catch (error) {
        post({ t: "error", message: describe(error) });
    }
};
